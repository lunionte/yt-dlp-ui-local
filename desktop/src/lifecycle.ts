export interface QuitEvent { preventDefault(): void; }
/**
 * Electron does not await listener Promises. Prevent quitting synchronously,
 * then request it again only after cleanup has fulfilled.
 */
export function createQuitGuard(cleanup: () => Promise<void>, quit: () => void, failed: (error: unknown) => void) {
  let complete = false;
  let pending: Promise<void> | undefined;
  return (event: QuitEvent): void => {
    if (complete) return;
    event.preventDefault();
    if (pending) return;
    pending = Promise.resolve().then(cleanup).then(() => { complete = true; quit(); }).catch(error => {
      pending = undefined;
      failed(error);
    });
  };
}
