# AGENTS.md — yt-dlp GUI

Guia de arquitetura, workflow e restrições para agentes que trabalham neste repositório. Execute comandos sempre a partir da raiz do monorepo.

## Visão geral

Aplicação local de download/conversão de mídia com interface React servida pelo Express ou pelo Electron. O backend coordena yt-dlp e FFmpeg por subprocessos; a interface recebe progresso e logs via Server-Sent Events (SSE). O desktop distribuído é Windows x64, com instalador NSIS e executável portátil.

```text
Browser ou Electron renderer (React + Vite + Tailwind)
  ├─ REST /api/* e SSE /api/downloads/events
  └─ Electron preload/IPC para seletor de pasta e notificações
       ↓
Express (servidor web ou iniciado no processo principal Electron)
  ├─ QueueService em memória
  ├─ YtdlpService: metadados, cache TTL e limite de concorrência
  ├─ RunnerService: spawn e progresso do yt-dlp
  └─ DialogService
       ↓
yt-dlp.exe e ffmpeg.exe (extraResources no Electron)
```

## Stack e diretórios reais

- Monorepo npm com workspaces `backend` e `frontend`; `desktop/` tem package e dependências próprios.
- Backend: Node.js 22+, TypeScript 5.7, ESM NodeNext, Express 4, Zod, CORS e dotenv.
- Frontend: React 19, TypeScript, Vite 6, Tailwind CSS 4 e Lucide React.
- Desktop: Electron 35, TypeScript e electron-builder 26.
- `backend/src/`: servidor, rotas, schemas, configuração de caminhos/binários, fila, execução de subprocessos, metadados, parser e diálogos.
- `frontend/src/`: `App.tsx`, componentes, hook SSE, tipos e utilitários. `frontend/public/assets/` contém imagens e fontes WOFF2 locais; as fontes têm licenças OFL junto aos arquivos.
- `desktop/src/`: processo principal, preload e bandeja do sistema. `desktop/electron-builder.yml` monta os alvos Windows.
- `backend/dist/`, `frontend/dist/`, `desktop/dist/` e `release/` são resultados gerados/ignorados, não devem ser tratados como fonte versionada.
- Binários de desenvolvimento ficam na raiz e são ignorados pelo Git. Nunca os apague nem sobrescreva.

## Execução e builds

Execute os comandos a partir da raiz:

```bash
npm install
npm run dev
npm run build
npm start
npm run desktop:dev
npm run desktop:build
npm run desktop:dist
```

`npm run desktop:build` compila backend, frontend e processo Electron. `npm run desktop:dist` gera Setup e Portable na pasta `release/`. Após mudanças relevantes em backend, frontend, contratos ou empacotamento, valide ambos os comandos desktop e confira os dois artefatos. Não commite executáveis, `release/`, `config.json`, `.env` ou dependências.

## Fluxos e invariantes atuais

- O backend web inicia na porta `PORT` ou 3001; Electron escolhe uma porta disponível e carrega o servidor local.
- Configuração de usuário contém `defaultDownloadDir` e `maxConcurrentDownloads`. No Electron empacotado, `config.json` fica em `app.getPath('userData')`; no modo web/desenvolvimento fica na raiz do projeto.
- yt-dlp e FFmpeg são necessários e empacotados via `extraResources`. FFprobe permanece na raiz para desenvolvimento/web, não é usado no fluxo de download e não é empacotado no Electron; é uma ferramenta opcional de diagnóstico, detectável pelo PATH.
- O backend encontra binários primeiro nos recursos do Electron, depois em `APP_ROOT`, raiz do projeto, CWD/pasta pai e finalmente no PATH.
- Metadados usam cache de 15 minutos com limite de 100 entradas e remoção pela ordem de inserção (FIFO, não LRU). Consultas iguais compartilham processo; há no máximo duas consultas ativas. O cancelamento HTTP chega ao processo somente quando não restam consumidores da consulta compartilhada; cancelar/remover um job também cancela sua busca de título.
- A fila e o histórico de downloads vivem em memória e são perdidos quando o processo termina. Os logs são limitados a 200 linhas por job.
- O frontend e backend mantêm interfaces TypeScript separadas para alguns contratos de API; alinhe as duas ao alterar payloads ou respostas.
- Não existe script `npm test` configurado. `backend/src/test-runner.ts` é um roteiro manual antigo, não uma suíte automatizada nem uma validação completa.

## Regras de implementação

### Backend e processos

1. Imports relativos de TypeScript no backend e desktop devem terminar em `.js` (NodeNext).
2. Execute yt-dlp e outras ferramentas com `spawn`/`execFile`, `shell: false` e argumentos em array. Nunca interpole entrada do usuário em comandos de shell.
3. Operações de rede, arquivos e sistema devem ser assíncronas sempre que possível; não bloqueie o event loop com trabalho longo.
4. Preserve o encerramento de árvores de processo no Windows para que FFmpeg não fique órfão. Ao alterar runner/cancelamento, aguarde o encerramento antes de liberar capacidade da fila.
5. Endpoints que recebem URLs devem normalizar e validar usando `normalizeMediaUrl()` e Zod.
6. `embedThumbnail` começa como `false` no schema e no estado inicial React.
7. Configuração persistida deve conter somente preferências do usuário, não caminhos configuráveis de binários.

### Electron

1. Mantenha `contextIsolation: true`, `nodeIntegration: false` e APIs mínimas no preload via `contextBridge`.
2. Crie `BrowserWindow` com `show: false` e exiba em `ready-to-show`; preserve single-instance lock e encerramento do servidor/tray.
3. Mantenha Setup e Portable em paridade e empacote apenas ferramentas efetivamente necessárias. FFprobe é opcional e sua ausência não deve bloquear o app.

### Frontend

1. As fontes Inter, Instrument Serif e JetBrains Mono são servidas localmente. Não reintroduza requisições a Google Fonts.
2. Preserve o comportamento de debounce e cancelamento de metadados sem permitir respostas antigas atualizarem a URL atual.
3. Preserve a seleção de pastas por IPC no Electron e o endpoint `/api/system/browse` no modo web.

## Pendências conhecidas — não presumir que já foram corrigidas

- A fila é volátil e não tem limite global de jobs; avaliar retenção/persistência separadamente antes de mudar o comportamento do histórico.
- SSE não tem replay de eventos ou reconciliação garantida na reconexão; clientes podem precisar atualizar a lista após reconectar.
- Os tipos de API são duplicados entre frontend e backend; considerar pacote/geração compartilhada em trabalho próprio.
- O listener Express e a política CORS precisam de revisão para garantir isolamento estrito ao loopback e às origens locais esperadas.
- Fallbacks de diálogo macOS/Linux ainda precisam ser revistos para evitar comandos de shell construídos com dados da requisição.
- O custo de `backdrop-filter`, imagem de fundo e frequência de renderização deve ser medido em máquinas modestas; não reduzir efeitos sem uma comparação visual/performance.
- O README pode conter exemplos de nomes/versões de releases gerados. Confira os arquivos e a versão atual antes de atualizar instruções de distribuição.

## Segurança e arquivos protegidos

- Nunca use `shell: true` para executar yt-dlp/FFmpeg ou comandos que recebam dados do usuário.
- Nunca apague ou sobrescreva `yt-dlp.exe`, `ffmpeg.exe` ou `ffprobe.exe` na raiz.
- Nunca desative isolamento do renderer do Electron.
- Não use caminhos absolutos específicos do Windows sem `path.join`/`path.resolve`.
- Não versione credenciais, configuração pessoal, `node_modules/` nem artefatos em `release/`.
