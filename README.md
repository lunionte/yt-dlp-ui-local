# yt-dlp GUI (Local Web Downloader + FFmpeg)

Interface gráfica moderna, limpa e responsiva para **yt-dlp** e **FFmpeg**, projetada especificamente para execução local e pessoal na sua máquina.

Inspirada no design minimalista do **Pillowcase** (tema claro com fundo branco, cantos arredondados, azul cobalto de destaque e foco total no conteúdo).

---

## 🚀 Como Executar

### Opção 1: Modo de Uso Direto (Recomendado)
Para iniciar a aplicação pronta para uso em uma única porta:
```bash
npm start
```
Acesse no navegador: **[http://localhost:3001](http://localhost:3001)**

### Opção 2: Modo de Desenvolvimento (com Hot Reloading / HMR)
Para editar o código com Fast Refresh no React e reinicialização automática do Express:
```bash
npm run dev
```
- Frontend (Vite): **[http://localhost:5173](http://localhost:5173)**
- Backend (Express): **[http://localhost:3001](http://localhost:3001)**

---

## 🛠️ Ferramentas Externas

Os executáveis colocados na raiz do projeto são detectados e priorizados automaticamente:
- `yt-dlp.exe`
- `ffmpeg.exe`
- `ffprobe.exe`

Caso queira alterar os caminhos ou a pasta padrão de downloads (`C:\Users\<Você>\Downloads`), basta clicar no botão **"Binários Prontos" / "Configurações"** no topo direito da tela.

---

## ✨ Funcionalidades

- **Hero Card Intuitivo**: Cole URLs diretamente da área de transferência ou digite para carregar metadados em tempo real (título, autor, duração, thumbnail e resoluções disponíveis).
- **Modo Vídeo**:
  - Resolução (Best, 4K, 2K, 1080p, 720p, etc.).
  - Container de mesclagem (MP4, MKV, WebM) via FFmpeg.
  - Opcional: Embutir capa/thumbnail e legendas.
- **Modo Somente Áudio**:
  - Extração automática para MP3, M4A, FLAC, WAV ou OPUS.
  - Seleção de qualidade / bitrate (320kbps, 256kbps, 192kbps, etc.).
  - Opcional: Embutir capa do álbum/vídeo no arquivo de áudio.
- **Acompanhamento em Tempo Real**:
  - Transmissão instantânea de progresso via **Server-Sent Events (SSE)**.
  - Velocidade de download (ex: `12.4 MiB/s`), tamanho baixado/total, porcentagem suave e ETA.
  - Indicador da etapa do FFmpeg (`Mesclando faixas`, `Extraindo áudio`).
  - Terminal de **Logs em tempo real** integrado com botão de cópia.
  - **Cancelamento seguro** com encerramento de processos em árvore (`taskkill /T /F` no Windows) para evitar processos zumbis.

---

## 🏗️ Arquitetura

```
yt-dlp-ui/
├── ffmpeg.exe                  # Binário local de processamento multimídia
├── ffprobe.exe                 # Binário local de análise de streams
├── yt-dlp.exe                  # Binário local de download
├── package.json                # Monorepo workspaces npm
├── backend/
│   ├── src/
│   │   ├── config/paths.ts     # Detecção automática de executáveis e pastas
│   │   ├── schemas/            # Validação tipada via Zod (CreateDownload, Config)
│   │   ├── services/
│   │   │   ├── runner.service.ts  # spawn() seguro sem shell + taskkill tree-kill
│   │   │   ├── parser.service.ts  # Parser determinístico com template do yt-dlp
│   │   │   ├── ytdlp.service.ts   # Consulta de metadados e montagem de args
│   │   │   └── queue.service.ts   # Gerenciamento de fila em memória e SSE
│   │   ├── routes/             # Rotas REST (/api/downloads, /api/info, /api/system)
│   │   └── server.ts           # Servidor Express com suporte a servir a build estática
└── frontend/
    ├── src/
    │   ├── components/         # Header, UrlHeroInput, OptionsPanel, DownloadItem, LogViewer
    │   ├── hooks/              # useDownloadEvents (SSE nativo)
    │   ├── types/              # Tipos TypeScript compartilhados
    │   └── App.tsx
    └── vite.config.ts
```
