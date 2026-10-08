/**
 * Errors are classified by the backend. Message length and command paths are not causes.
 * This wrapper remains for presentation consumers; it never guesses privacy or authentication.
 */
export function formatFriendlyErrorMessage(message: string | null | undefined): string {
  return message || 'Não foi possível concluir a operação. Consulte o diagnóstico da tentativa.';
}
