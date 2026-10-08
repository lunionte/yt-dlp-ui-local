import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { BrowseSchema, DialogResultSchema } from '@ytdlp/shared';
import { executeBuffered } from './runner.service.js';
import { OperationError } from './error.service.js';
import { requireDirectory } from './path.service.js';
let active = false;
export function buildUnixDialogCommands(platform, options) {
    const title = options.title || 'Selecione um caminho';
    const initial = options.defaultPath || '.';
    if (platform === 'darwin') {
        const literal = '"' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"';
        return [{ binaryPath: 'osascript', args: ['-e', `POSIX path of (choose ${options.type === 'folder' ? 'folder' : 'file'} with prompt ${literal})`] }];
    }
    return [
        { binaryPath: 'zenity', args: ['--file-selection', ...(options.type === 'folder' ? ['--directory'] : []), '--title', title, '--filename', initial] },
        { binaryPath: 'kdialog', args: ['--title', title, options.type === 'folder' ? '--getexistingdirectory' : '--getopenfilename', initial] },
    ];
}
async function windowsDialog(options) {
    const encode = (value) => Buffer.from(value, 'utf8').toString('base64');
    // User text is decoded as data. It never participates in PowerShell source syntax.
    const script = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$titleText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(options.title || 'Selecione um caminho')}'))
$initialPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(options.defaultPath || '')}'))
$filterText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(options.filter || 'Todos os arquivos (*.*)|*.*')}'))
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.Opacity = 0
$owner.ShowInTaskbar = $false
$picker = New-Object System.Windows.Forms.${options.type === 'folder' ? 'FolderBrowserDialog' : 'OpenFileDialog'}
try {
  ${options.type === 'folder' ? '$picker.Description = $titleText; $picker.ShowNewFolderButton = $true; if ($initialPath) { $picker.SelectedPath = $initialPath }' : '$picker.Title = $titleText; $picker.Filter = $filterText; if ($initialPath) { if (Test-Path -LiteralPath $initialPath -PathType Container) { $picker.InitialDirectory = $initialPath } else { $picker.InitialDirectory = [IO.Path]::GetDirectoryName($initialPath); $picker.FileName = [IO.Path]::GetFileName($initialPath) } }'}
  $owner.Show()
  if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $picker.${options.type === 'folder' ? 'SelectedPath' : 'FileName'}
  }
} finally { $picker.Dispose(); $owner.Dispose() }
`;
    const result = await executeBuffered({ binaryPath: 'powershell.exe', args: ['-NoProfile', '-NoLogo', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], timeoutMs: 120000, maxBuffer: 1024 * 1024 });
    return { path: result.stdout.trim() || null, cancelled: !result.stdout.trim() };
}
async function electronDialog(options) {
    const moduleName = 'electron';
    const native = await import(moduleName);
    const filters = [];
    const parts = (options.filter || '').split('|');
    for (let i = 0; i + 1 < parts.length; i += 2)
        filters.push({ name: parts[i], extensions: parts[i + 1].split(';').map(p => p.replace('*.', '').trim()) });
    const parent = native.BrowserWindow.getFocusedWindow() || native.BrowserWindow.getAllWindows()[0];
    const result = await native.dialog.showOpenDialog(parent, { title: options.title, defaultPath: options.defaultPath, properties: options.type === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'], filters: filters.length ? filters : undefined });
    return { path: result.filePaths[0] || null, cancelled: result.canceled || !result.filePaths.length };
}
export async function selectPathViaDialog(input) {
    if (active)
        throw new OperationError('CONFLICT', 'system', 'Já existe um diálogo aberto', 409);
    const parsed = BrowseSchema.safeParse(input);
    if (!parsed.success)
        throw new OperationError('VALIDATION_ERROR', 'system', 'Opções inválidas', 400);
    const options = parsed.data;
    if (options.defaultPath) {
        try {
            await fs.stat(options.defaultPath);
        }
        catch {
            throw new OperationError('FILESYSTEM_ERROR', 'system', 'Caminho inicial inexistente', 400);
        }
    }
    active = true;
    try {
        let result;
        if (process.env.ELECTRON)
            result = await electronDialog(options);
        else if (process.platform === 'win32')
            result = await windowsDialog(options);
        else {
            result = { path: null, cancelled: true };
            const commands = buildUnixDialogCommands(process.platform === 'darwin' ? 'darwin' : 'linux', options);
            for (const command of commands) {
                try {
                    const output = await executeBuffered({ ...command, timeoutMs: 120000, maxBuffer: 1024 * 1024 });
                    result = { path: output.stdout.trim() || null, cancelled: !output.stdout.trim() };
                    break;
                }
                catch (error) {
                    const failure = error;
                    if (failure.code === 'ENOENT')
                        continue;
                    if (failure.exitCode === 1 || /User canceled|(-128)/i.test(failure.message))
                        break;
                    throw error;
                }
            }
        }
        result = DialogResultSchema.parse(result);
        if (result.path && options.type === 'folder')
            result.path = await requireDirectory(result.path);
        return result;
    }
    finally {
        active = false;
    }
}
export async function openFolderInExplorer(input) {
    const target = await requireDirectory(input);
    const binary = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    // Launching the user's file manager is independent of download subprocess ownership.
    return new Promise((resolve, reject) => {
        const child = spawn(binary, [target], { shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve({ success: true }); });
    });
}
