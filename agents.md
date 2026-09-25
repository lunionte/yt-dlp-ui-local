# agents.md — Guia de trabalho do yt-dlp GUI

Instruções para agentes que alteram este monorepo. Execute comandos a partir da raiz e leia este arquivo antes de tarefas não triviais. Se existir, leia também `.agents/rules/ler-agents.md`.

## Modelo mental da aplicação

O mesmo frontend React atende o navegador e o renderer do Electron. No modo web, o usuário abre o Express/Vite; no desktop, o processo principal inicia o Express no próprio processo Node e carrega a interface por `localhost`. O preload fornece somente operações que exigem integração nativa.

```text
Navegador ou renderer Electron (frontend React)
  ├─ REST /api/* e SSE /api/downloads/events
  └─ electronAPI via preload/IPC (pastas, notificações e versão)
       ↓
Express (standalone ou iniciado pelo Electron)
  ├─ routes: validação e contratos HTTP
  ├─ QueueService: estado de jobs e concorrência de downloads
  ├─ YtdlpService: metadados, cache, deduplicação e limite de consultas
  ├─ RunnerService: processos yt-dlp e atualização de progresso/logs
  └─ DialogService: fallback de diálogos/abertura de pasta no modo web
       ↓
yt-dlp + FFmpeg (necessários) | FFprobe (diagnóstico opcional)
```

## Stack e mapa do código-fonte

- Monorepo npm com workspaces `backend` e `frontend`. `desktop/` tem `package.json` e instalação de dependências próprios; não é workspace da raiz.
- Backend: Node.js 22+ como alvo operacional, TypeScript 5.7, ESM `NodeNext`, Express 4, Zod, CORS e dotenv. `package.json` ainda não declara `engines`.
- Frontend: React 19, TypeScript, Vite 6, Tailwind CSS 4 e Lucide React.
- Desktop: Electron 35, TypeScript e electron-builder 26; os alvos configurados são Windows x64 Setup/NSIS e Portable.

| Diretório/arquivo | Responsabilidade |
|---|---|
| `backend/src/server.ts` | Montagem Express, middleware, rotas e servidor standalone |
| `backend/src/routes/` | Contratos HTTP de metadados, downloads, SSE e sistema |
| `backend/src/services/queue.service.ts` | Jobs em memória, estados, limite de downloads ativos e eventos |
| `backend/src/services/ytdlp.service.ts` | Argumentos yt-dlp, metadados, cache e deduplicação |
| `backend/src/services/runner.service.ts` | Spawn, streams, encerramento de processos e árvore Windows |
| `backend/src/config/paths.ts` | Resolução dos binários e persistência das preferências |
| `frontend/src/App.tsx` | Estado de tela, chamadas HTTP e integração dos componentes |
| `frontend/src/hooks/useDownloadEvents.ts` | Conexão SSE e atualização dos jobs |
| `frontend/src/components/` | Interface de URL, opções, downloads, configurações e logs |
| `frontend/src/index.css` | Tipografia, superfícies/efeitos glass e estilos compartilhados de controles |
| `frontend/public/assets/` | Imagens, fontes WOFF2 e licenças locais |
| `desktop/src/main.ts` | Ciclo de vida, janela, Express, IPC e single-instance lock |
| `desktop/src/preload.ts` | Superfície mínima de APIs expostas ao renderer |
| `desktop/src/tray.ts` | Bandeja e preferência de minimizar para a bandeja |
| `desktop/electron-builder.yml` | Conteúdo e alvos de distribuição |

Os arquivos-fonte são a referência. `backend/dist/`, `frontend/dist/`, `desktop/dist/` e `release/` são saídas de build; não edite bundles como se fossem código-fonte. Atenção: `frontend/dist/index.html` ainda está rastreado pelo Git apesar de `frontend/dist/` estar no `.gitignore`; ele é gerado e pode mudar os hashes de assets em um build. Não inclua esse diff incidental sem uma alteração deliberada no fluxo de artefatos.

## Contratos e comportamento atual

- Metadados: `POST /api/info` recebe `{ url }`. URLs devem passar por `normalizeMediaUrl()` e Zod. O frontend aplica debounce de 450 ms, aborta requisições substituídas e ignora resultados obsoletos.
- `YtdlpService` mantém cache em memória por 15 minutos (máximo 100 entradas, FIFO, não LRU), compartilha consultas em andamento pela URL normalizada e limita a duas consultas ativas. Os consumidores têm cancelamento individual; o processo é abortado quando não há mais consumidores. O retry sem `youtube:skip=dash` só ocorre em erros que indiquem incompatibilidade dessa opção.
- `POST /api/downloads` cria um job; `GET /api/downloads` e `GET /api/downloads/:id` consultam estado; `POST /api/downloads/:id/cancel` cancela; `DELETE /api/downloads/:id` remove. Sem título inicial, o backend busca metadados em background para preencher o job.
- `embedThumbnail` tem padrão `false` no schema e no estado inicial React.
- `QueueService` mantém jobs/histórico somente em memória. O limite de downloads ativos vem de `maxConcurrentDownloads` (1–5, padrão 2); cada job conserva no máximo 200 linhas de log.
- `GET /api/downloads/events` envia eventos SSE e heartbeat a cada 20 s, sem snapshot/replay. Uma reconexão não garante recuperação dos eventos perdidos; considere reconciliar com `GET /api/downloads` se alterar esse fluxo.
- Sistema: `GET /api/system/check`, `POST /api/system/config`, `POST /api/system/browse` e `POST /api/system/open-folder`.
- Backend e frontend mantêm alguns tipos de API em arquivos separados (`backend/src/schemas/` e `frontend/src/types/`). Atualize os dois lados quando mudar um payload; não há geração/validação compartilhada hoje.

## Binários, configuração e persistência

- `yt-dlp.exe` e `ffmpeg.exe` são necessários e copiados para `extraResources` pelo empacotador. Não são versionados: `*.exe` está no `.gitignore`; builds/distribuições precisam que os arquivos oficiais estejam disponíveis na raiz do projeto.
- `ffprobe.exe` da raiz não deve ser removido nem sobrescrito. Não é empacotado nem necessário para downloads; é opcional no diagnóstico e pode ser detectado no PATH.
- A resolução procura primeiro `process.resourcesPath` no Electron empacotado, depois `APP_ROOT`, raiz do projeto, CWD, pasta pai e PATH.
- `config.json` contém apenas `defaultDownloadDir` e `maxConcurrentDownloads`. Na distribuição Electron, fica em `app.getPath('userData')`; no modo web e Electron de desenvolvimento, fica na raiz do projeto. A preferência da bandeja fica separadamente em `desktop-preferences.json` no `userData`.
- `paths.ts` usa operações síncronas para ler/gravar configuração e detectar arquivos. Antes de torná-las assíncronas, mapeie os chamadores de `loadConfig()` e as fronteiras de inicialização; meça o custo antes de adicionar cache global.

## Regras de implementação

### Backend e subprocessos

1. Imports relativos TypeScript em backend/desktop terminam em `.js` (`NodeNext`).
2. Execute yt-dlp e FFmpeg por `spawn`/`execFile`, com argumentos separados e sem shell. Preserve `shell: false` e nunca concatene entrada do usuário em comandos. Ao alterar cancelamento, preserve o encerramento da árvore Windows e aguarde o processo sair antes de devolver capacidade à fila.
3. Normalize/valide URLs e caminhos nos limites da API; não confie em validação feita apenas no frontend.
4. Prefira operações assíncronas para I/O de rede, arquivos e sistema; evite trabalho longo no event loop. A leitura/gravação atual da configuração é síncrona e está registrada como pendência.
5. Persistência deve conter preferências do usuário, nunca caminhos customizáveis de ferramentas.

### Electron

1. Preserve `contextIsolation: true`, `nodeIntegration: false` e a API mínima de `contextBridge`; não exponha Node.js ao renderer.
2. Preserve janela `show: false`/`ready-to-show`, single-instance lock, cleanup do Express/bandeja e paridade entre Setup e Portable.
3. Empacote somente recursos necessários. Yt-dlp e FFmpeg são essenciais; FFprobe é opcional.

### Frontend

1. Inter, Instrument Serif e JetBrains Mono são assets locais; não reintroduza Google Fonts ou dependência de rede para renderizar a interface.
2. Web e Electron usam os mesmos componentes React. Faça alterações visuais no frontend compartilhado, sem duplicar implementação no processo principal.
3. Preserve debounce, abortamento e proteção contra respostas antigas de metadados; preserve seleção de pasta por IPC no Electron e `/api/system/browse` no modo web.
4. Use os utilitários de `frontend/src/index.css` para superfícies Liquid Glass (`glass-card`, `glass-pill`, `glass-input`) e controles (`liquid-button`, `glass-button`, variantes de ícone/perigo/escuro). Mantenha contraste, foco visível e estado desabilitado. Blur, sombras e fundo fixo podem custar GPU; alterações de efeitos devem considerar máquinas modestas.

## Pendências técnicas verificadas

- **Prioridade de segurança local:** `server.ts` usa `app.listen(port)` sem host explícito (Node aceita conexões em interfaces além de loopback) e CORS permite qualquer origem com credenciais. Não presuma que a API esteja isolada ao computador; revisar bind e origens permitidas, especialmente no modo web.
- `dialog.service.ts` ainda constrói comandos de shell para diálogos macOS/Linux com título/caminho interpolados; substituir por argumentos seguros e evitar shell antes de ampliar o suporte multiplataforma.
- Em Windows, `RunnerService.kill()` aguarda o callback de `taskkill`, mas não aguarda explicitamente o evento `close` do processo filho; `QueueService.cancelJob()` remove o handle em seguida. Verifique o ciclo de vida para garantir que o slot não seja liberado antes de o processo terminar.
- A fila não limita o número total de jobs e perde estado ao encerrar o processo; avaliar retenção/persistência separadamente, sem mudar silenciosamente o histórico.
- SSE não recupera eventos perdidos ao reconectar. A UI deve reconciliar estado se o protocolo ou a reconexão forem alterados.
- Contratos TypeScript duplicados entre backend/frontend podem divergir; compartilhar ou gerar tipos é trabalho separado.
- Não há script `npm test`; `backend/src/test-runner.ts` é um utilitário manual antigo de verificação de binários, não uma suíte automatizada. Não o trate como cobertura dos fluxos.
- Testar impacto de `backdrop-filter`, fundo fixo e frequência de renderização em hardware modesto antes de otimizações visuais.
- README deve usar nomes/versionamento de artefatos observados no build atual; builds em `release/` e executáveis não são fonte versionada.

## Comandos e validação

Rode a partir da raiz do monorepo:

```bash
npm install                       # workspaces backend/frontend
npm --prefix desktop install      # dependências Electron; desktop não é workspace
npm run dev                       # web dev: backend + Vite
npm run build                     # backend + frontend
npm start                         # Express standalone; frontend requer build prévio
npm run desktop:dev               # build integrado + Electron em desenvolvimento
npm run desktop:build             # backend + frontend + TypeScript do Electron
npm run desktop:dist              # Windows x64 Setup + Portable em release/
```

`npm run build` não compila `desktop/src`; use `desktop:build` para isso. Para mudanças em empacotamento, recursos ou Electron, confira Setup e Portable. Não afirme validações que não executou; não há suíte de testes configurada.

## Higiene e proteção

- Não apague nem sobrescreva `yt-dlp.exe`, `ffmpeg.exe` ou `ffprobe.exe` na raiz.
- Não versione executáveis, `release/`, `node_modules/`, configuração pessoal, `.env` ou credenciais.
- Não desative isolamento do renderer nem use shell com argumentos vindos de requisições.
- Prefira `path.join`/`path.resolve` a caminhos absolutos específicos da máquina.
