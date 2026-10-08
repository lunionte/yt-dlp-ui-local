import { test, expect, type Page } from '@playwright/test';
import { VideoMetadataSchema } from '@ytdlp/shared';
import { capture, emit, job, mediaUrl, metadata, mockApp } from './fixtures.js';

async function fits(page: Page, selector: string) {
  const area = page.locator(selector);
  await expect(area).toBeVisible();
  const dimensions = await area.evaluate(element => ({ h: element.clientHeight, content: element.scrollHeight, w: element.clientWidth, width: element.scrollWidth }));
  expect(dimensions.content, selector + ' vertical').toBeLessThanOrEqual(dimensions.h + 1);
  expect(dimensions.width, selector + ' horizontal').toBeLessThanOrEqual(dimensions.w + 1);
}
async function media(page: Page) {
  await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
  await expect(page.getByRole('region', { name: 'Novo download', exact: true }).getByRole('heading', { name: metadata.title })).toBeVisible();
}

test('resoluções reais selecionam o máximo, preservam escolha menor e permitem dimensões desconhecidas', async ({ page }) => {
  const scenario = await mockApp(page); await page.goto('/');
  const resolution = page.getByLabel('Resolução máxima');
  await expect(resolution).toBeDisabled();
  await expect(resolution).not.toContainText('Melhor disponível');
  scenario.metadata = VideoMetadataSchema.parse({ ...metadata, availableResolutions: ['2160p', '1080p', '720p'] });
  await media(page); await expect(resolution).toHaveValue('2160p');
  await expect(resolution.locator('option')).toHaveText(['2160p', '1080p', '720p']);
  await resolution.selectOption('720p');
  await page.getByRole('button', { name: 'Analisar', exact: true }).click();
  await expect(resolution).toHaveValue('720p');
  scenario.metadata = VideoMetadataSchema.parse({ ...scenario.metadata, availableResolutions: ['1080p'] });
  await page.getByRole('button', { name: 'Analisar', exact: true }).click();
  await expect(resolution).toHaveValue('1080p');
  const another = 'https://instagram.com/reels/another/';
  scenario.metadata = VideoMetadataSchema.parse({ ...metadata, url: another, availableResolutions: ['1440p', '1080p'] });
  await page.getByLabel('Link do vídeo ou post').fill(another);
  await expect(resolution).toHaveValue('1440p');
  scenario.metadata = VideoMetadataSchema.parse({ ...scenario.metadata, availableResolutions: [] });
  await page.getByRole('button', { name: 'Analisar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Resolução não informada' })).toBeVisible();
  await expect(resolution).toBeDisabled(); await expect(resolution).toHaveValue('best');
  const request = page.waitForRequest(request => request.url().endsWith('/api/downloads') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  expect((await request).postDataJSON()).toMatchObject({ url: another, videoResolution: 'best' });
  await expect(page.getByLabel('Link do vídeo ou post')).toHaveValue(another);
  await fits(page, '.ui-downloader');
});

test('fila com dezenas de jobs preserva leitura durante SSE e revela somente o novo job iniciado', async ({ page }) => {
  const jobs = Array.from({ length: 30 }, (_, index) => ({ ...job('completed', `old-${index}`), createdAt: index }));
  await mockApp(page, jobs.slice().reverse()); await page.goto('/');
  const list = page.getByRole('list', { name: 'Lista de downloads' });
  await expect(list.locator(':scope > li')).toHaveCount(30);
  expect(await list.locator(':scope > li').first().getAttribute('data-job-id')).toBe('old-0');
  await list.evaluate(element => { element.scrollTop = 200; });
  const before = await list.evaluate(element => element.scrollTop);
  await emit(page, { type: 'LOG', sequence: 2, jobId: 'old-29', payload: { line: 'Atualização', isError: false } });
  expect(await list.evaluate(element => element.scrollTop)).toBe(before);
  await media(page);
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  await emit(page, { type: 'JOB_ADDED', sequence: 3, jobId: 'new-job', payload: { ...job('queued', 'new-job'), createdAt: 100, revision: 3 } });
  const latest = list.locator('[data-job-id="new-job"]');
  await expect(latest).toBeInViewport();
  await latest.getByRole('button', { name: 'Ver logs' }).click();
  await page.keyboard.press('Escape');
  await expect(latest.getByRole('button', { name: 'Ver logs' })).toBeFocused();
  await list.evaluate(element => { element.scrollTop = 0; });
  await emit(page, { type: 'PROGRESS', sequence: 4, jobId: 'new-job', payload: { progress: job().progress, status: 'downloading' } });
  expect(await list.evaluate(element => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && scrollY === 0)).toBe(true);
  await capture(page, test.info().outputPath('fila-continua.png'));
});
test('formulário integrado, renomeação, payload e posição estável', async ({ page }) => {
  await mockApp(page, [job('completed', 'old-job')]); await page.goto('/');
  const panel = page.getByRole('region', { name: 'Novo download', exact: true });
  const before = await panel.boundingBox();
  await media(page);
  const video = page.getByRole('radio', { name: 'Vídeo', exact: true });
  await video.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Áudio', exact: true })).toBeChecked();
  await expect(page.getByLabel('Formato do áudio')).toBeVisible();
  await expect(page.getByLabel('Embutir legendas')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft'); await expect(video).toBeChecked();
  await page.getByLabel('Embutir capa').check(); await page.getByLabel('Embutir legendas').check();
  await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do arquivo', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Nome do arquivo', exact: true }).fill('Meu vídeo');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Renomear arquivo', exact: true })).toBeFocused();
  await expect(page.getByLabel('Embutir capa')).toBeChecked();
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/downloads') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  expect((await requestPromise).postDataJSON()).toMatchObject({ mode: 'video', customFilename: 'Meu vídeo', embedThumbnail: true, embedSubtitles: true, auth: { mode: 'none' } });
  await expect(page.getByLabel('Link do vídeo ou post')).toHaveValue(mediaUrl);
  await expect(page.getByRole('button', { name: 'Ver nome completo do arquivo', exact: true })).toHaveText('Meu vídeo.mp4');
  await emit(page, { type: 'JOB_ADDED', sequence: 2, jobId: 'new-job', payload: { ...job('queued', 'new-job'), revision: 2 } });
  await expect(page.getByRole('heading', { name: 'Downloads (2)' })).toBeVisible();
  await expect(page.locator('[data-job-id="new-job"]')).toBeVisible();
  await expect(page.getByLabel('Download exibido')).toHaveCount(0);
  const after = await panel.boundingBox();
  expect(after?.x).toBe(before?.x); expect(after?.y).toBe(before?.y); expect(after?.width).toBe(before?.width);
});

test('renomeação inline cancela, confirma e restaura o nome original', async ({ page }) => {
  await mockApp(page); await page.goto('/'); await media(page);
  const name = page.getByRole('button', { name: 'Ver nome completo do arquivo', exact: true });
  const original = await name.textContent();
  await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome do arquivo', exact: true }).fill('Rascunho');
  await page.keyboard.press('Escape'); await expect(name).toHaveText(original!);
  await expect(page.getByRole('button', { name: 'Renomear arquivo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome do arquivo', exact: true }).fill('Meu arquivo');
  await page.getByRole('button', { name: 'Confirmar nome', exact: true }).click();
  await expect(name).toHaveText('Meu arquivo.mp4');
  await page.getByRole('button', { name: 'Usar nome original', exact: true }).click();
  await expect(name).toHaveText(original!);
  await expect(page.getByRole('navigation', { name: 'Navegação dos downloads' })).toHaveCount(0);
  await expect(page.getByLabel('Download exibido', { exact: true })).toHaveCount(0);
  const form = await page.locator('.ui-downloader').boundingBox();
  const queue = await page.locator('.ui-downloads-pane').boundingBox();
  expect(form!.height).toBeLessThan(650); expect(queue!.height).toBeGreaterThan(form!.height);
  await page.getByLabel('Link do vídeo ou post').focus();
  await expect(page.getByLabel('Link do vídeo ou post')).toHaveCSS('outline-offset', '-3px');
  await capture(page, test.info().outputPath('form-unificado.png'));
  await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome do arquivo', exact: true }).fill('Renomeado ao iniciar');
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/downloads') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  expect((await requestPromise).postDataJSON()).toMatchObject({ customFilename: 'Renomeado ao iniciar' });
});

test('configurações sem rolagem, foco contido e restaurado', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await mockApp(page); await page.goto('/');
  const opener = page.getByRole('button', { name: 'Abrir configurações' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Configurações', exact: true });
  await expect(page.getByRole('button', { name: 'Fechar configurações' })).toBeFocused();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  for (const name of ['Downloads', 'Acesso', 'Ferramentas']) {
    await dialog.getByRole('tab', { name, exact: true }).click();
    await fits(page, '.ui-settings-panel');
  }
  await dialog.getByRole('tab', { name: 'Acesso', exact: true }).click();
  await page.getByLabel('Autenticação', { exact: true }).selectOption('browser');
  await fits(page, '.ui-settings-panel');
  await page.getByLabel('Autenticação', { exact: true }).selectOption('file');
  await fits(page, '.ui-settings-panel');
  const save = await page.getByRole('button', { name: 'Salvar alterações' }).boundingBox();
  expect(save!.y + save!.height).toBeLessThanOrEqual(600);
  await capture(page, test.info().outputPath('settings-800.png'));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
});

test('rascunhos sobrevivem às abas, refresh e falhas', async ({ page }) => {
  const scenario = await mockApp(page); await page.goto('/');
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await page.getByLabel('Pasta padrão de download').fill('C:\\Uma pasta longa\\Arquivos');
  await page.getByLabel('Downloads simultâneos').selectOption('4');
  await page.getByRole('tab', { name: 'Acesso', exact: true }).click();
  await page.getByLabel('Autenticação', { exact: true }).selectOption('browser');
  await page.getByLabel('Navegador').selectOption('firefox');
  await page.getByRole('tab', { name: 'Ferramentas', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  scenario.refreshError = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ferramentas temporariamente indisponíveis');
  await page.getByRole('button', { name: 'OK', exact: true }).click(); scenario.refreshError = false;
  await page.getByRole('tab', { name: 'Downloads', exact: true }).click();
  await expect(page.getByLabel('Pasta padrão de download')).toHaveValue('C:\\Uma pasta longa\\Arquivos');
  await expect(page.getByLabel('Downloads simultâneos')).toHaveValue('4');
  scenario.folderError = true;
  await page.getByRole('button', { name: 'Abrir pasta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível acessar a pasta.');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('tab', { name: 'Acesso', exact: true }).click();
  await expect(page.getByLabel('Navegador')).toHaveValue('firefox');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferências salvas' })).toBeVisible();
  expect(scenario.saved).toEqual({ defaultDownloadDir: 'C:\\Uma pasta longa\\Arquivos', maxConcurrentDownloads: 4 });
});

test('logs paginados preservam leitura e copiam somente após sucesso', async ({ page }) => {
  const active = job();
  active.logs = Array.from({ length: 100 }, (_, index) => `Linha ${index + 1}: transferência em andamento.`);
  await mockApp(page, [active]); await page.goto('/');
  const opener = page.getByRole('button', { name: 'Ver logs' }); await opener.click();
  const logs = page.getByRole('region', { name: 'Conteúdo dos logs' });
  await expect(logs).toContainText('Linha 100');
  await page.getByRole('button', { name: 'Página anterior dos logs' }).click();
  const old = await logs.textContent();
  await emit(page, { type: 'LOG', sequence: 2, jobId: active.id, payload: { line: 'Nova linha 101', isError: false } });
  await expect(logs).toHaveText(old!);
  await page.getByRole('button', { name: 'Ir para o final' }).click();
  await expect(logs).toContainText('Nova linha 101');
  await emit(page, { type: 'LOG', sequence: 3, jobId: active.id, payload: { line: 'Nova linha 102 ' + 'á'.repeat(1500), isError: false } });
  await fits(page, '.ui-terminal');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Denied'); } }));
  await page.getByRole('button', { name: 'Copiar logs' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível copiar');
  await expect(page.getByRole('button', { name: 'Copiado', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => undefined }));
  await page.getByRole('button', { name: 'Copiar logs' }).click();
  await expect(page.getByRole('button', { name: 'Copiado', exact: true })).toBeVisible();
  await capture(page, test.info().outputPath('logs.png'));
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
});

test('fila contínua rola internamente e mantém ações integradas em cada estado', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const statuses = ['completed', 'error', 'cancelled', 'processing', 'cancelling', 'queued', 'downloading'] as const;
  const jobs = statuses.map((status, index) => job(status, `job-${index}`));
  jobs[1].error = 'Falha ao baixar a mídia.';
  jobs[6].progress.speed = 'N/A'; jobs[6].progress.eta = '--:--';
  await mockApp(page, jobs); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Downloads (7)' })).toBeVisible();
  for (let i = 0; i < jobs.length; i++) {
    const article = page.locator(`[data-job-id="${jobs[i].id}"] article`);
    await article.getByRole('button', { name: 'Ver logs' }).scrollIntoViewIfNeeded();
    await fits(page, `[data-job-id="${jobs[i].id}"] .ui-download`);
    const box = await article.getByRole('button', { name: 'Ver logs' }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(600);
    if (i === 0) {
      await expect(article).toContainText('1 arquivo salvo');
      await expect(article).not.toContainText(/Velocidade|ETA|N\/A|100\.0%/);
      await expect(article.getByRole('button', { name: 'Abrir pasta' })).toHaveText('');
      await expect(article.locator('.ui-download-actions')).toHaveCSS('border-top-width', '0px');
    }
    if (i === 3) await expect(article.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    if (i === 6) await expect(article).toContainText('Calculando…');
  }
  await expect(page.getByRole('article')).toHaveCount(7);
  await expect(page.getByLabel('Download exibido')).toHaveCount(0);
  expect(await page.locator('.ui-downloads-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('ui-test-disconnect')));
  await expect(page.getByRole('status').filter({ hasText: 'Reconectando' })).toBeVisible();
  await capture(page, test.info().outputPath('states.png'));
});

test('erro de prévia e diagnóstico paginado restauram foco entre modais', async ({ page }) => {
  const scenario = await mockApp(page, [job('completed')]); scenario.infoError = true;
  await page.goto('/'); await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
  await expect(page.getByRole('alert')).toContainText('Não há formato compatível');
  await page.getByRole('button', { name: 'Detalhes do erro' }).click();
  await page.getByRole('button', { name: 'Ver diagnóstico' }).click();
  await expect(page.getByRole('region', { name: 'Conteúdo do diagnóstico' })).toContainText('Detalhes redigidos');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Erro na tentativa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver diagnóstico' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Detalhes do erro' })).toBeFocused();
  await page.getByRole('button', { name: 'Ver logs' }).click();
  await expect(page.getByText('Nenhum log registrado nesta tentativa.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiar logs' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 800, height: 600 });
  scenario.infoError = false; scenario.downloadError = true;
  await page.getByRole('button', { name: 'Analisar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Novo download', exact: true }).getByRole('heading', { name: metadata.title })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar download' }).click();
  await expect(page.getByRole('alert')).toContainText('Não há formato compatível');
  await fits(page, '.ui-downloader');
});

test('falha de cancelar é visível no mobile e restaura o foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const scenario = await mockApp(page, [job()]); scenario.operationError = true;
  await page.goto('/');
  await page.getByRole('tab', { name: 'Downloads (1)', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancelar', exact: true });
  await cancel.click();
  await expect(page.getByRole('region', { name: 'Erro da operação' })).toContainText('Não foi possível cancelar');
  await fits(page, '.ui-terminal');
  await page.keyboard.press('Escape');
  await expect(cancel).toBeFocused();
});

test('falha de abrir pasta pelo ícone restaura foco após a operação assíncrona', async ({ page }) => {
  const scenario = await mockApp(page, [job('completed')]); scenario.folderError = true;
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Abrir pasta', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Não foi possível abrir a pasta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

for (const viewport of [{ width: 1200, height: 800 }, { width: 800, height: 600 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`sem rolagem em ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const scenario = await mockApp(page, [job('downloading')]); scenario.infoDelay = 800; await page.goto('/');
    if (viewport.width >= 700) await expect(page.getByRole('heading', { name: 'Downloads (1)' })).toBeVisible();
    await capture(page, test.info().outputPath('empty.png'));
    await page.getByLabel('Link do vídeo ou post').fill(mediaUrl);
    await expect(page.getByRole('button', { name: 'Analisando…' })).toBeVisible();
    await fits(page, '.ui-pane-body'); await capture(page, test.info().outputPath('analysis.png'));
    await media(page); await fits(page, '.ui-pane-body');
    await expect(page.getByRole('radio', { name: 'Vídeo', exact: true })).toBeVisible();
    await expect(page.getByLabel('Pasta de destino', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renomear arquivo', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Formato', exact: true })).toHaveCount(0);
    await capture(page, test.info().outputPath('media.png'));
    await fits(page, '.ui-pane-body'); await fits(page, '.ui-downloader'); await capture(page, test.info().outputPath('video.png'));
    await page.getByRole('radio', { name: 'Áudio', exact: true }).check();
    await fits(page, '.ui-pane-body'); await capture(page, test.info().outputPath('audio.png'));
    await page.getByRole('button', { name: 'Renomear arquivo', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nome do arquivo', exact: true }).fill('Nome extenso para conferir a leitura dos arquivos');
    await page.keyboard.press('Enter');
    await fits(page, '.ui-pane-body'); await capture(page, test.info().outputPath('destination.png'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const start = await page.getByRole('button', { name: 'Iniciar download' }).boundingBox();
    expect(start!.y + start!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width < 700) await page.getByRole('tab', { name: 'Downloads (1)', exact: true }).click();
    await fits(page, '.ui-download');
    await capture(page, test.info().outputPath('downloads.png'));
    await page.getByRole('button', { name: 'Abrir configurações' }).click();
    await fits(page, '.ui-settings-panel'); await capture(page, test.info().outputPath('settings.png'));
  });
}

test('coleção, reflow a 200% e movimento reduzido', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const scenario = await mockApp(page, [job('downloading'), job('processing', 'processing')]);
  scenario.metadata = VideoMetadataSchema.parse({ ...metadata, kind: 'collection', entries: [{ ...metadata, id: 'one' }, { ...metadata, id: 'two' }], warnings: ['Algumas mídias podem exigir autenticação.'] });
  await page.goto('/'); await media(page);
  await expect(page.getByRole('button', { name: 'Coleção com 2 mídias · detalhes' })).toBeVisible();
  const urlField = await page.getByLabel('Link do vídeo ou post').boundingBox();
  expect(urlField!.width).toBeGreaterThanOrEqual(100);
  await fits(page, '.ui-pane-body');
  await expect(page.getByLabel('Link do vídeo ou post')).toHaveCSS('transition-duration', '0s');
  await capture(page, test.info().outputPath('collection-200-percent.png'));
  const start = await page.getByRole('button', { name: 'Iniciar download' }).boundingBox();
  expect(start!.y + start!.height).toBeLessThanOrEqual(400);
  await page.getByRole('tab', { name: 'Opções', exact: true }).click();
  await fits(page, '.ui-pane-body');
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  for (const name of ['Downloads', 'Acesso', 'Ferramentas']) {
    await page.getByRole('dialog', { name: 'Configurações', exact: true }).getByRole('tab', { name, exact: true }).click();
    await fits(page, '.ui-settings-panel');
  }
  await page.getByRole('tab', { name: 'Acesso', exact: true }).click();
  for (const mode of ['browser', 'file']) {
    await page.getByLabel('Autenticação', { exact: true }).selectOption(mode);
    await fits(page, '.ui-settings-panel');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Downloads (2)', exact: true }).click();
  for (const id of ['job-1', 'processing']) {
    await page.locator(`[data-job-id="${id}"]`).scrollIntoViewIfNeeded();
    await fits(page, `[data-job-id="${id}"] .ui-download`);
  }
  await page.locator('[data-job-id="processing"]').getByRole('button', { name: 'Ver logs' }).click();
  await fits(page, '.ui-terminal');
});
