import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeFileStem } from '@ytdlp/shared';

export async function createWorkspace(outputFolder: string, jobId: string): Promise<string> {
  return fs.mkdtemp(path.join(outputFolder, `.ytdlp-${jobId}-`));
}
export function requireWorkspaceFile(workspace: string, file: string): void {
  const relative = path.relative(workspace, file);
  if (!path.isAbsolute(file) || !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Arquivo fora do diretório temporário do job');
  }
}
/** Never replace an existing destination, even across concurrent jobs/processes. */
export async function publishFile(file: string, folder: string, title: string): Promise<string> {
  const source = await fs.lstat(file);
  if (!source.isFile() || source.isSymbolicLink()) throw new Error('Arquivo final inválido');
  const stem = normalizeFileStem(title), extension = path.extname(file);
  for (let index = 1; ; index++) {
    const destination = path.join(folder, `${stem}${index === 1 ? '' : ` (${index})`}${extension}`);
    try {
      try { await fs.link(file, destination); }
      catch (error) {
        if (!['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
        await fs.copyFile(file, destination, fs.constants.COPYFILE_EXCL);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    // Keep the recoverable source until the destination has been verified.
    if (!(await fs.stat(destination)).isFile() || (await fs.stat(destination)).size !== source.size) {
      throw new Error('A verificação do arquivo publicado falhou');
    }
    await fs.unlink(file);
    return destination;
  }
}
export async function removeWorkspace(workspace: string, folder: string, jobId: string): Promise<void> {
  const relative = path.relative(folder, workspace);
  if (!relative.startsWith(`.ytdlp-${jobId}-`) || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Diretório temporário inválido');
  const stat = await fs.lstat(workspace);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Diretório temporário inválido');
  await fs.rm(workspace, { recursive: true, force: true });
}
