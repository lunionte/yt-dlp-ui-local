import { z } from 'zod';
import { DialogResultSchema } from '@ytdlp/shared';
import { apiRequest } from './api.js';
const openResultSchema = z.object({ success: z.boolean(), error: z.string().optional() });
export async function selectDownloadFolder(defaultPath: string, title = 'Selecione a pasta de download'): Promise<string | null> {
  const result = window.electronAPI?.selectFolder
    ? DialogResultSchema.parse(await window.electronAPI.selectFolder(defaultPath || undefined))
    : await apiRequest('/api/system/browse', DialogResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'folder', title, defaultPath: defaultPath || undefined }) });
  return result.cancelled ? null : result.path;
}
export async function openDownloadFolder(folderPath: string): Promise<void> {
  const result = window.electronAPI?.openFolder
    ? openResultSchema.parse(await window.electronAPI.openFolder(folderPath))
    : await apiRequest('/api/system/open-folder', openResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath }) });
  if (!result.success) throw new Error(result.error || 'Não foi possível abrir a pasta.');
}
