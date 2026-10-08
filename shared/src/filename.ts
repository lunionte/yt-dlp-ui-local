/** Public file stems, shared by the preview and final file publication. No Node APIs. */
export const FILE_STEM_MAX_BYTES = 80;
export function normalizeFileStem(input: string): string {
  let name = input.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/[\s.]+$/, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  let result = '', bytes = 0;
  const encoder = new TextEncoder();
  for (const character of name) {
    const length = encoder.encode(character).length;
    if (bytes + length > FILE_STEM_MAX_BYTES) break;
    result += character; bytes += length;
  }
  return result.replace(/[\s.]+$/, '') || 'Sem título';
}
