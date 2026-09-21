import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export interface DialogOptions {
  type: 'file' | 'folder';
  title?: string;
  defaultPath?: string;
  filter?: string;
}

export interface DialogResult {
  path: string | null;
  cancelled: boolean;
  error?: string;
}

/**
 * Abre o seletor nativo do sistema operacional (Windows, macOS ou Linux).
 */
export async function selectPathViaDialog(options: DialogOptions): Promise<DialogResult> {
  const isFolder = options.type === 'folder';
  const title = options.title || (isFolder ? 'Selecione a pasta' : 'Selecione o arquivo executável');
  const initialPath = options.defaultPath ? path.resolve(options.defaultPath) : '';
  const filter = options.filter || (isFolder ? '' : 'Executáveis (*.exe)|*.exe|Todos os arquivos (*.*)|*.*');

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      return await selectPathWindows({ isFolder, title, initialPath, filter });
    } else if (platform === 'darwin') {
      return await selectPathMacOS({ isFolder, title, initialPath });
    } else {
      return await selectPathLinux({ isFolder, title, initialPath });
    }
  } catch (err: any) {
    console.error('Erro ao abrir diálogo de seleção:', err);
    return {
      path: null,
      cancelled: true,
      error: err.message || 'Falha ao abrir diálogo do sistema operacional',
    };
  }
}

/**
 * Windows: Executa PowerShell com System.Windows.Forms em modo STA
 */
async function selectPathWindows(opts: {
  isFolder: boolean;
  title: string;
  initialPath: string;
  filter: string;
}): Promise<DialogResult> {
  const titleB64 = Buffer.from(opts.title, 'utf-8').toString('base64');
  const pathB64 = Buffer.from(opts.initialPath, 'utf-8').toString('base64');
  const filterB64 = Buffer.from(opts.filter, 'utf-8').toString('base64');

  const script = opts.isFolder
    ? `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.TopLevel = $true
$form.Opacity = 0
$form.ShowInTaskbar = $false

$title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${titleB64}'))
$initPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pathB64}'))

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $title
$dialog.ShowNewFolderButton = $true

if ($initPath -ne '' -and (Test-Path -LiteralPath $initPath)) {
    $dialog.SelectedPath = $initPath
}

$form.Show()
$form.BringToFront()
$result = $dialog.ShowDialog($form)

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}

$form.Dispose()
$dialog.Dispose()
`.trim()
    : `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.TopLevel = $true
$form.Opacity = 0
$form.ShowInTaskbar = $false

$title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${titleB64}'))
$initPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pathB64}'))
$filter = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${filterB64}'))

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $title
$dialog.Filter = $filter

if ($initPath -ne '' -and (Test-Path -LiteralPath $initPath)) {
    if (Test-Path -LiteralPath $initPath -PathType Container) {
        $dialog.InitialDirectory = $initPath
    } else {
        $dialog.InitialDirectory = [System.IO.Path]::GetDirectoryName($initPath)
        $dialog.FileName = [System.IO.Path]::GetFileName($initPath)
    }
}

$form.Show()
$form.BringToFront()
$result = $dialog.ShowDialog($form)

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.FileName
}

$form.Dispose()
$dialog.Dispose()
`.trim();

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    timeout: 120000,
  });

  const selected = stdout.trim();
  if (!selected) {
    return { path: null, cancelled: true };
  }

  return { path: selected, cancelled: false };
}

/**
 * macOS: Usa osascript (AppleScript)
 */
async function selectPathMacOS(opts: {
  isFolder: boolean;
  title: string;
  initialPath: string;
}): Promise<DialogResult> {
  const prompt = opts.title.replace(/"/g, '\\"');
  let cmd = '';

  if (opts.isFolder) {
    cmd = `osascript -e 'POSIX path of (choose folder with prompt "${prompt}")'`;
  } else {
    cmd = `osascript -e 'POSIX path of (choose file with prompt "${prompt}")'`;
  }

  try {
    const { stdout } = await execFileAsync('/bin/sh', ['-c', cmd], { timeout: 120000 });
    const selected = stdout.trim();
    if (!selected) {
      return { path: null, cancelled: true };
    }
    return { path: selected, cancelled: false };
  } catch {
    return { path: null, cancelled: true };
  }
}

/**
 * Linux: Tenta zenity ou kdialog
 */
async function selectPathLinux(opts: {
  isFolder: boolean;
  title: string;
  initialPath: string;
}): Promise<DialogResult> {
  let cmd = '';
  if (opts.isFolder) {
    cmd = `zenity --file-selection --directory --title="${opts.title}" 2>/dev/null || kdialog --getexistingdirectory "${opts.initialPath || '.'}" 2>/dev/null`;
  } else {
    cmd = `zenity --file-selection --title="${opts.title}" 2>/dev/null || kdialog --getopenfilename "${opts.initialPath || '.'}" 2>/dev/null`;
  }

  try {
    const { stdout } = await execFileAsync('/bin/sh', ['-c', cmd], { timeout: 120000 });
    const selected = stdout.trim();
    if (!selected) {
      return { path: null, cancelled: true };
    }
    return { path: selected, cancelled: false };
  } catch {
    return { path: null, cancelled: true };
  }
}

/**
 * Abre uma pasta no gerenciador de arquivos padrão do sistema operacional (Windows Explorer, Finder, etc.)
 */
export async function openFolderInExplorer(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const target = path.resolve(folderPath);

    // Se o diretório não existir, cria-o antes de abrir
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    if (process.platform === 'win32') {
      spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
    }

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao abrir pasta no explorador:', err);
    return { success: false, error: err.message || 'Não foi possível abrir a pasta' };
  }
}
