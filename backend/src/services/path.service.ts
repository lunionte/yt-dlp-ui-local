import fs from 'node:fs/promises';
import path from 'node:path';
import { AbsolutePathSchema } from '@ytdlp/shared';
import { OperationError } from './error.service.js';

export async function requireDirectory(input: string, writable = false): Promise<string> {
  const parsed = AbsolutePathSchema.safeParse(input);
  if (!parsed.success || !path.isAbsolute(input)) throw new OperationError('VALIDATION_ERROR', 'system', 'Caminho deve ser absoluto', 400);
  const resolved = path.resolve(input);
  try {
    if (!(await fs.stat(resolved)).isDirectory()) throw new Error('O caminho não é um diretório');
    if (writable) await fs.access(resolved, fs.constants.W_OK);
    return resolved;
  } catch (error) { throw new OperationError('FILESYSTEM_ERROR', 'system', String(error), 400); }
}
export async function prepareOutputDirectory(input: string): Promise<string> {
  if (!AbsolutePathSchema.safeParse(input).success || !path.isAbsolute(input)) throw new OperationError('VALIDATION_ERROR', 'download', 'Pasta de saída deve ser absoluta', 400);
  try { await fs.mkdir(input, { recursive: true }); } catch (error) { throw new OperationError('FILESYSTEM_ERROR', 'download', String(error), 400); }
  return requireDirectory(input, true);
}
export async function requireCookieFile(input: string): Promise<string> {
  if (!AbsolutePathSchema.safeParse(input).success || !path.isAbsolute(input)) throw new OperationError('VALIDATION_ERROR', 'metadata', 'Arquivo de cookies deve ter caminho absoluto', 400);
  try {
    const stat = await fs.stat(input);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Arquivo de cookies inválido ou maior que 10 MB');
    await fs.access(input, fs.constants.R_OK);
    return path.resolve(input);
  } catch (error) { throw new OperationError('FILESYSTEM_ERROR', 'metadata', String(error), 400); }
}
