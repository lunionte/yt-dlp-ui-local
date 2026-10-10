import { test, expect, type Page } from '@playwright/test';
import { capture, emit, job, mediaUrl, mockApp } from './fixtures.js';

async function settled(page: Page) {
  await expect.poll(() => page.locator('.ui-workspace').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
}

async function contained(page: Page) {
  const measurements = await page.evaluate(() => {
    const selectors = ['.ui-workspace', '.ui-downloader', '.ui-pane-body', '.ui-app-footer'];
    return selectors.map(selector => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const box = element.getBoundingClientRect();
      return { selector, visible: !!element.clientHeight, overflowX: element.scrollWidth - element.clientWidth, overflowY: element.scrollHeight - element.clientHeight,
        inside: box.x >= 0 && box.y >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 };
    });
  });
  for (const item of measurements.filter(item => item.visible)) {
    expect(item.inside, item.selector).toBe(true);
    expect(item.overflowX, item.selector).toBeLessThanOrEqual(1);
    expect(item.overflowY, item.selector).toBeLessThanOrEqual(1);
  }
}

for (const size of [{ width: 1200, height: 800 }, { width: 800, height: 600 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 600, height: 400 }]) {
  test(`apresentação e ciclo da fila em ${size.width} × ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockApp(page); await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'Reconectando' })).toHaveCount(0);
    const welcome = page.getByRole('heading', { name: 'O que vamos baixar hoje?' });
    await expect(welcome).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('32px "Instrument Serif"'))).toBe(true);
    await expect(welcome).toHaveCSS('font-family', '"Instrument Serif", Georgia, serif');
    await expect(page.getByRole('heading', { name: 'Downloads (0)' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Downloads/ })).toHaveCount(0);
    const panel = page.getByRole('region', { name: 'Novo download', exact: true });
    const initial = (await panel.boundingBox())!;
    const workspace = (await page.locator('.ui-workspace').boundingBox())!;
    expect(Math.abs(initial.x + initial.width / 2 - workspace.x - workspace.width / 2)).toBeLessThan(2);
    expect(Math.abs(initial.y + initial.height / 2 - workspace.y - workspace.height / 2)).toBeLessThan(2);
    await contained(page);
    const settings = page.getByRole('button', { name: 'Abrir configurações' });
    const settingsBox = (await settings.boundingBox())!;
    expect(settingsBox.width).toBe(40); expect(settingsBox.height).toBe(40);
    expect(settingsBox.y).toBeGreaterThanOrEqual(workspace.y + workspace.height);
    expect(settingsBox.x).toBeLessThanOrEqual(24);
    await settings.click(); await page.keyboard.press('Escape'); await expect(settings).toBeFocused();
    await capture(page, test.info().outputPath('welcome.png'));

    await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
    await expect(page.getByRole('button', { name: 'Iniciar download' })).toBeEnabled();
    await contained(page);
    await page.getByRole('button', { name: 'Iniciar download' }).click();
    // The POST response precedes the event: until the job is present, keep the form visible.
    await expect(welcome).toBeVisible();
    await emit(page, { type: 'JOB_ADDED', sequence: 2, jobId: 'new-job', payload: { ...job('completed', 'new-job'), revision: 2 } });
    await expect(page.getByRole('heading', { name: 'Downloads (1)' })).toBeVisible();
    await settled(page);
    if (size.width >= 700) {
      const split = (await panel.boundingBox())!;
      expect(Math.abs(split.width - initial.width)).toBeLessThan(2);
      expect(split.x).toBeLessThan(initial.x);
      expect(Math.abs(split.y - workspace.y)).toBeLessThan(2);
      await contained(page);
    } else {
      await expect(page.getByRole('tab', { name: 'Downloads (1)' })).toHaveAttribute('aria-selected', 'true');
    }
    await capture(page, test.info().outputPath('queue.png'));
    await page.getByRole('button', { name: 'Remover download da lista' }).click();
    await emit(page, { type: 'JOB_REMOVED', sequence: 3, jobId: 'new-job', payload: { id: 'new-job' } });
    await settled(page);
    await expect(welcome).toBeVisible();
    await expect(page.getByLabel('Link do vídeo ou post')).toHaveValue(mediaUrl);
    await expect(page.getByLabel('Link do vídeo ou post')).toBeFocused();
    await expect(page.getByRole('tab', { name: /^Downloads/ })).toHaveCount(0);
    await contained(page);
    await capture(page, test.info().outputPath('returned.png'));
  });
}

test('falha não revela fila; transição preserva rascunho e SSE não reinicia movimento', async ({ page }) => {
  const scenario = await mockApp(page); scenario.downloadError = true;
  await page.goto('/');
  await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
  await expect(page.getByRole('button', { name: 'Iniciar download' })).toBeEnabled();
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  await expect(page.getByRole('alert')).toContainText('Não há formato compatível');
  await expect(page.getByRole('heading', { name: 'O que vamos baixar hoje?' })).toBeVisible();
  await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Nome do arquivo', exact: true });
  await draft.fill('Meu rascunho');
  await emit(page, { type: 'JOB_ADDED', sequence: 2, jobId: 'external', payload: { ...job('queued', 'external'), revision: 2 } });
  const transition = await page.locator('.ui-downloader').evaluate(element => {
    const animation = element.getAnimations()[0];
    return animation ? { duration: animation.effect?.getTiming().duration, frames: (animation.effect as KeyframeEffect).getKeyframes() } : null;
  });
  expect(transition?.duration).toBe(320);
  expect(transition?.frames[0].transform).not.toBe('translate(0, 0)');
  await page.locator('.ui-workspace').evaluate(element => {
    for (const animation of element.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 160; }
  });
  await page.screenshot({ path: test.info().outputPath('transition-midpoint.png') });
  await page.locator('.ui-workspace').evaluate(element => {
    for (const animation of element.getAnimations({ subtree: true })) animation.play();
  });
  await settled(page);
  await expect(draft).toHaveValue('Meu rascunho'); await expect(draft).toBeFocused();
  await emit(page, { type: 'LOG', sequence: 3, jobId: 'external', payload: { line: 'Atualização', isError: false } });
  expect(await page.locator('.ui-downloader').evaluate(element => element.getAnimations().length)).toBe(0);
  await emit(page, { type: 'JOB_REMOVED', sequence: 4, jobId: 'external', payload: { id: 'external' } });
  await page.setViewportSize({ width: 800, height: 600 });
  await settled(page); await expect(draft).toHaveValue('Meu rascunho'); await expect(draft).toBeFocused();
});

test('snapshot existente e movimento reduzido aplicam layout sem animação', async ({ page }) => {
  await mockApp(page, [job('completed')]); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Downloads (1)' })).toBeVisible();
  expect(await page.locator('.ui-downloader').evaluate(element => element.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emit(page, { type: 'JOB_REMOVED', sequence: 2, jobId: 'job-1', payload: { id: 'job-1' } });
  await expect(page.getByRole('heading', { name: 'O que vamos baixar hoje?' })).toBeVisible();
  expect(await page.locator('.ui-workspace').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await emit(page, { type: 'JOB_ADDED', sequence: 3, jobId: 'second', payload: { ...job('queued', 'second'), revision: 3 } });
  await expect(page.getByRole('heading', { name: 'Downloads (1)' })).toBeVisible();
  expect(await page.locator('.ui-workspace').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('troca de acesso e reversão durante animação mantêm a posição e o formulário', async ({ page }) => {
  await mockApp(page); await page.goto('/');
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await page.getByRole('tab', { name: 'Acesso', exact: true }).click();
  await page.getByLabel('Autenticação', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferências salvas' })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
  await expect(page.getByRole('button', { name: 'Iniciar download' })).toBeEnabled();
  const card = page.locator('.ui-downloader');
  const before = (await card.boundingBox())!;
  await emit(page, { type: 'JOB_ADDED', sequence: 2, jobId: 'rapid', payload: { ...job('queued', 'rapid'), revision: 2 } });
  await card.evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause(); animation.currentTime = 0;
  });
  const start = (await card.boundingBox())!;
  expect(Math.abs(start.x - before.x)).toBeLessThan(2);
  expect(Math.abs(start.y - before.y)).toBeLessThan(2);
  await emit(page, { type: 'JOB_REMOVED', sequence: 3, jobId: 'rapid', payload: { id: 'rapid' } });
  await settled(page);
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  await expect(page.getByLabel('Link do vídeo ou post')).toHaveValue(mediaUrl);
  await contained(page);
});

test('controles Electron opacos, IPC e configurações fora da área de arraste', async ({ page }) => {
  await mockApp(page);
  await page.addInitScript(() => {
    let maximized = false;
    let onChange: (value: boolean) => void = () => {};
    const calls: string[] = [];
    Object.defineProperty(window, 'controlCalls', { value: calls });
    window.electronAPI = {
      isElectron: true, getAppVersion: async () => '1.2.0', showNotification: async () => {},
      selectFolder: async () => ({ path: null, cancelled: true }), openFolder: async () => ({ success: true }),
      minimizeWindow: async () => { calls.push('minimize'); }, closeWindow: async () => { calls.push('close'); },
      maximizeWindow: async () => { calls.push('maximize'); maximized = !maximized; onChange(maximized); },
      isWindowMaximized: async () => maximized, onMaximizeChange: callback => { onChange = callback; return () => {}; },
    };
  });
  await page.goto('/');
  for (const name of ['Minimizar janela', 'Maximizar janela', 'Fechar janela']) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveCSS('border-top-width', '1px');
    await expect(button).toHaveCSS('border-top-color', name === 'Fechar janela' ? 'rgb(190, 18, 60)' : 'rgb(82, 103, 109)');
    await button.click();
  }
  await page.getByRole('button', { name: 'Restaurar janela' }).click();
  await page.getByRole('banner').dblclick({ position: { x: 300, y: 20 } });
  await expect(page.getByRole('button', { name: 'Restaurar janela' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir configurações' })).toBeFocused();
  expect(await page.evaluate(() => Reflect.get(window, 'controlCalls'))).toEqual(['minimize', 'maximize', 'close', 'maximize', 'maximize']);
  await capture(page, test.info().outputPath('electron-controls.png'));
});
