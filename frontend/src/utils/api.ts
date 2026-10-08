import type { z } from 'zod';
import { ApiErrorSchema, type MediaError } from '@ytdlp/shared';
export class ApiFailure extends Error {
  constructor(readonly details: MediaError) { super(details.message); }
}
export async function apiRequest<T>(url: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('O servidor retornou uma resposta inválida.'); }
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(data);
    if (parsed.success) throw new ApiFailure(parsed.data.details);
    throw new Error('Não foi possível concluir a operação no servidor.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('A resposta do servidor não corresponde ao contrato da aplicação.');
  return parsed.data;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
