import { useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, ExternalLink, RotateCw, Save } from 'lucide-react';
import { AuthContextSchema, BrowserSchema, DialogResultSchema, SystemStatusSchema, type AuthContext, type SystemStatus } from '@ytdlp/shared';
import { z } from 'zod';
import { openDownloadFolder, selectDownloadFolder } from '../utils/system.js';
import { apiRequest, errorMessage } from '../utils/api.js';
import { Button, Field, Modal, Notice, StatusBadge, Tabs } from './ui.js';
import { PagedText } from './PagedText.js';

const origins: Record<SystemStatus['tools']['ytdlp']['source'], string> = {
  resources: 'Incluída no aplicativo', project: 'Disponível no projeto', path: 'Disponível no sistema',
};
const toolNames = { ytdlp: 'yt-dlp', ffmpeg: 'FFmpeg', ffprobe: 'FFprobe' } as const;

export function SettingsModal({ isOpen, auth, onChangeAuth, onClose, systemStatus, onRefreshStatus }: {
  isOpen: boolean; auth: AuthContext; onChangeAuth: (auth: AuthContext) => void;
  onClose: () => void; systemStatus: SystemStatus | null; onRefreshStatus: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'preferences' | 'access' | 'tools'>('preferences');
  const [toolKey, setToolKey] = useState<keyof typeof toolNames>('ytdlp');
  const [showHelp, setShowHelp] = useState(false);
  const messageFocus = useRef<HTMLElement | null>(null);
  const [defaultDownloadDir, setDefaultDownloadDir] = useState('');
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(2);
  const [authMode, setAuthMode] = useState<AuthContext['mode']>('none');
  const [browser, setBrowser] = useState('edge');
  const [cookiesFile, setCookiesFile] = useState('');
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);
  const initialized = useRef(false);
  const formId = useId();
  // Initialize the draft once per opening. A tool refresh must not replace unsaved edits.
  useEffect(() => {
    if (!isOpen) { initialized.current = false; return; }
    if (initialized.current || !systemStatus) return;
    initialized.current = true;
    setMessage(null);
    setTab('preferences');
    setDefaultDownloadDir(systemStatus.config.defaultDownloadDir);
    setMaxConcurrentDownloads(systemStatus.config.maxConcurrentDownloads);
    setAuthMode(auth.mode);
    setBrowser(auth.mode === 'browser' ? auth.browser : 'edge');
    setCookiesFile(auth.mode === 'file' ? auth.cookiesFile : '');
  }, [isOpen, systemStatus, auth]);
  const showError = (error: unknown) => setMessage({ type: 'danger', text: errorMessage(error) });
  const browse = async () => {
    setBrowsing(true); setMessage(null);
    try { const path = await selectDownloadFolder(defaultDownloadDir); if (path) setDefaultDownloadDir(path); }
    catch (error) { showError(error); } finally { setBrowsing(false); }
  };
  const openFolder = async () => {
    setOpening(true); setMessage(null);
    try { await openDownloadFolder(defaultDownloadDir); }
    catch (error) { showError(error); } finally { setOpening(false); }
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await onRefreshStatus(); } catch (error) { showError(error); }
    finally { setRefreshing(false); }
  };
  const browseCookies = async () => {
    try {
      const result = await apiRequest('/api/system/browse', DialogResultSchema, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'file', title: 'Selecione seu arquivo de cookies', filter: 'Cookies (*.txt)|*.txt' }),
      });
      if (!result.cancelled && result.path) setCookiesFile(result.path);
    } catch (error) { showError(error); }
  };
  const save = async (event: React.FormEvent) => {
    messageFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    event.preventDefault(); setSaving(true); setMessage(null);
    try {
      const nextAuth = AuthContextSchema.safeParse(authMode === 'browser' ? { mode: authMode, browser } : authMode === 'file' ? { mode: authMode, cookiesFile } : { mode: authMode });
      if (!nextAuth.success) throw new Error('Selecione um navegador ou informe o caminho absoluto do arquivo de cookies.');
      await apiRequest('/api/system/config', z.object({ success: z.literal(true), config: SystemStatusSchema.shape.config }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDownloadDir: defaultDownloadDir.trim() || undefined, maxConcurrentDownloads }),
      });
      onChangeAuth(nextAuth.data);
      setMessage({ type: 'success', text: 'Preferências salvas. Autenticação aplicada somente nesta sessão.' });
      await onRefreshStatus();
    } catch (error) { showError(error); } finally { setSaving(false); }
  };
  if (!isOpen) return null;
  return <Modal fill title="Configurações" onClose={onClose}
    footer={<><Button onClick={onClose}>Fechar</Button><Button variant="primary" type="submit" form={formId} disabled={saving || !systemStatus}><Save />{saving ? 'Salvando…' : 'Salvar alterações'}</Button></>}>
    <form id={formId} onSubmit={save} className="ui-settings-form" onClickCapture={event => {
      if (event.target instanceof HTMLElement && event.target.closest('dialog') === event.currentTarget.closest('dialog')) messageFocus.current = event.target.closest('button');
    }}>
      <Tabs label="Seções das configurações" prefix="settings" value={tab} onChange={setTab} items={[{value:'preferences',label:'Downloads'},{value:'access',label:'Acesso'},{value:'tools',label:'Ferramentas'}]} />
      <div className="ui-settings-panel" role="tabpanel" id={`settings-${tab}-panel`} aria-labelledby={`settings-${tab}-tab`}>
      {tab === 'tools' && <section className="ui-group" aria-label="Ferramentas disponíveis">
        <div className="ui-tools-toolbar">
          <select className="glass-select" aria-label="Ferramenta exibida" value={toolKey} onChange={event => setToolKey(event.target.value as keyof typeof toolNames)}>
            {Object.entries(toolNames).map(([key, name]) => <option key={key} value={key}>{name}{key === 'ffprobe' ? ' — opcional' : ' — necessária'}</option>)}
          </select>
          <Button onClick={refresh} disabled={refreshing}><RotateCw className={refreshing ? 'animate-spin' : ''} />Atualizar</Button>
        </div>
        {(() => {
          const tool = systemStatus?.tools[toolKey];
          return <div className="ui-reading ui-tool">
            <span className="ui-tool-name">{toolNames[toolKey]}</span>
            <StatusBadge tone={!tool ? 'neutral' : tool.available ? 'success' : toolKey === 'ffprobe' ? 'neutral' : 'danger'}>{!tool ? 'Verificando' : tool.available ? 'Disponível' : toolKey === 'ffprobe' ? 'Opcional' : 'Indisponível'}</StatusBadge>
            <p className="ui-tool-info">{tool?.available ? <>{tool.version && <span className="font-mono">{tool.version} · </span>}{origins[tool.source]}</> : tool ? 'Não encontrada neste ambiente.' : 'Consultando disponibilidade…'}</p>
          </div>;
        })()}
      </section>}
      {tab === 'access' && <section className="ui-group ui-auth-options" aria-labelledby="auth-heading">
        <h3 id="auth-heading">Acesso ao site de origem</h3>
        <button className="ui-text-button ui-auth-help" type="button" onClick={() => setShowHelp(true)}>Orientações de acesso</button>
        <Field id="auth-mode" label="Autenticação">
          <select id="auth-mode" className="glass-select" value={authMode} onChange={event => setAuthMode(event.target.value as AuthContext['mode'])}>
            <option value="none">Sem autenticação</option><option value="browser">Usar sessão do navegador</option><option value="file">Usar arquivo de cookies</option>
          </select>
        </Field>
        {authMode === 'browser' && <Field id="auth-browser" label="Navegador">
          <select id="auth-browser" className="glass-select" value={browser} onChange={event => setBrowser(event.target.value)}>
            {BrowserSchema.options.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
          </select>
        </Field>}
        {authMode === 'file' && <Field id="cookies-file" label="Arquivo de cookies">
          <input id="cookies-file" className="ui-input font-mono" value={cookiesFile} onChange={event => setCookiesFile(event.target.value)} />
          <div className="ui-actions"><Button onClick={browseCookies}><FolderOpen />Procurar arquivo</Button></div>
        </Field>}
      </section>}
      {tab === 'preferences' && <section className="ui-group ui-preferences-options" aria-labelledby="preferences-heading">
        <h3 id="preferences-heading">Downloads</h3>
        <Field id="default-folder" label="Pasta padrão de download">
          <input id="default-folder" className="ui-input font-mono" value={defaultDownloadDir} onChange={event => setDefaultDownloadDir(event.target.value)} />
          <div className="ui-actions"><Button onClick={browse} disabled={browsing}><FolderOpen />{browsing ? 'Procurando…' : 'Procurar pasta'}</Button><Button onClick={openFolder} disabled={!defaultDownloadDir || opening}><ExternalLink />{opening ? 'Abrindo…' : 'Abrir pasta'}</Button></div>
        </Field>
        <Field id="concurrency" label="Downloads simultâneos">
          <select id="concurrency" className="glass-select" value={maxConcurrentDownloads} onChange={event => setMaxConcurrentDownloads(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} {count === 1 ? 'download por vez' : 'downloads por vez'}</option>)}
          </select>
        </Field>
      </section>}
      </div>
      {message && <Modal returnFocus={messageFocus.current} title={message.type === 'success' ? 'Preferências salvas' : 'Falha na operação'} onClose={() => setMessage(null)} footer={<Button onClick={() => setMessage(null)}>OK</Button>}><Notice tone={message.type}>{message.text}</Notice></Modal>}
      {showHelp && <Modal fill title="Orientações de acesso" onClose={() => setShowHelp(false)} footer={<Button onClick={() => setShowHelp(false)}>Fechar</Button>}><PagedText dark={false} prose label="Orientações de autenticação" lines={[
        'A autenticação é opcional e vale para prévia e download nesta sessão. Não é salva em disco e não garante acesso a todo conteúdo.',
        'Navegador: faça login no site nesse navegador. Se a leitura for bloqueada, use um arquivo de cookies Netscape exportado por você.',
        'Arquivo de cookies: informe um caminho absoluto para um arquivo no formato Netscape.',
      ]} /></Modal>}
    </form>
  </Modal>;
}
