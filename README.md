# yt-dlp GUI (Local Web Downloader & Desktop Windows + FFmpeg)

Interface gráfica moderna, limpa e responsiva para **yt-dlp** e **FFmpeg**, projetada para rodar localmente no seu computador. Disponível tanto como **aplicativo Desktop nativo para Windows (.exe instalador e portátil)** quanto como **aplicação Web local**.

Inspirada no design minimalista do **Pillowcase**, com tema claro, superfícies Liquid Glass e azul suave como cor de destaque.

---

## 💻 Aplicativo Desktop para Windows

O desktop é distribuído para Windows x64 em dois formatos: instalador NSIS e executável Portable. Os pacotes são gerados localmente com `electron-builder`; o repositório não contém os executáveis de release nem os binários de ferramentas. Para empacotar, coloque os binários oficiais `yt-dlp.exe` e `ffmpeg.exe` na raiz do projeto. Eles são copiados para o pacote. O FFprobe é opcional, usado somente no diagnóstico e não é empacotado.

Os executáveis gerados ficam na pasta [`release/`](release/):

| Executável | Tipo | Como Usar |
|---|---|---|
| **`yt-dlp GUI Setup <versão>.exe`** | **Instalador NSIS** | Instala o app, cria atalhos na Área de Trabalho e no Menu Iniciar e oferece desinstalação pelo Windows. |
| **`yt-dlp-GUI-Portable-<versão>.exe`** | **Executável Portable** | Não requer instalador e pode ser iniciado de outra pasta ou unidade. As preferências continuam sendo gravadas em `userData` do Windows. |

### Recursos Exclusivos do Modo Desktop
- **Bandeja do Sistema (System Tray)**: Ao fechar ou minimizar a janela, o app pode continuar na bandeja ao lado do relógio do Windows.
  - Clique simples ou duplo no ícone para restaurar a janela.
  - Clique com o botão direito no ícone para abrir o menu: permite ativar/desativar o comportamento de minimizar para a bandeja e sair do programa.
- **Diálogos Nativos**: A seleção de pasta no Electron usa o diálogo do sistema; a interface web usa o fallback do backend.
- **Notificações do Windows**: Dispara notificações nativas no canto da tela quando qualquer download for concluído com sucesso.
- **Instância Única (Single-Instance)**: Impede a abertura acidental de várias instâncias simultâneas do programa.

---

## 🚀 Como Executar pelo Código-Fonte

### Modo Desktop Windows (Electron)
```bash
# 1. Instalar dependências
npm install

# O desktop tem dependências próprias e não é workspace da raiz
npm --prefix desktop install

# Executar o aplicativo desktop em modo de desenvolvimento
npm run desktop:dev

# Compilar e gerar o Instalador e o Portable na pasta release/
npm run desktop:dist
```

Os binários `yt-dlp.exe` e `ffmpeg.exe` precisam estar na raiz antes de compilar/empacotar. Eles e os artefatos de `release/` são ignorados pelo Git.

### Modo Web Local (Navegador)
```bash
# 1. Modo de Produção Web Local (porta 3001)
npm run build
npm start
# Acesse: http://localhost:3001

# 2. Modo de Desenvolvimento Web (com Hot-Reloading / HMR)
npm run dev
# Frontend (Vite): http://localhost:5173
# Backend (Express): http://localhost:3001
```

---

## 🛠️ Ferramentas externas e binários locais

Os binários não são versionados. Coloque-os na raiz do projeto para rodar/empacotar:
- `yt-dlp.exe`: Motor de download e extração de metadados
- `ffmpeg.exe`: Processamento, muxing e extração de áudio
- `ffprobe.exe`: ferramenta opcional de diagnóstico (não empacotada no Desktop)

> **No Desktop distribuído**: yt-dlp e FFmpeg são incluídos como recursos do aplicativo; FFprobe é opcional e pode ser detectado pelo PATH.
> **No modo Web e Electron de desenvolvimento**: os binários da raiz são detectados e priorizados automaticamente.

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
  - **Cancelamento de downloads** encerra a árvore de processos (`taskkill /T /F` no Windows) para limitar processos filhos órfãos.

---

## 📦 Como Publicar uma Release no GitHub

Para disponibilizar os executáveis para download na página do seu repositório no GitHub:

1. **Gere os executáveis**:
   ```bash
   npm run desktop:dist
   ```
   Os arquivos estarão na pasta `release/`.

2. **No GitHub**:
   - Acesse o seu repositório no GitHub pelo navegador.
   - Na barra lateral direita, clique em **Releases** (ou acesse `https://github.com/SEU_USUARIO/SEU_REPO/releases`).
   - Clique no botão **"Draft a new release"**.
   - Crie uma tag compatível com a versão que será publicada e dê um título para a release.
   - Na caixa **"Attach binaries by dropping them here or selecting them"**, arraste os seguintes arquivos da sua pasta `release/`:
     - O instalador Setup gerado em `release/`.
     - O executável Portable gerado em `release/`.
   - O app ainda não configura atualização automática. Publique `.blockmap` apenas se o processo de release passar a usar um atualizador compatível.
   - Adicione uma descrição com as novidades e publique a release.

---

## ❓ Perguntas Frequentes (FAQ)

### Qual a diferença entre o Setup e o Portable?
- **Setup**: É o instalador tradicional. Instala os arquivos, cria atalhos na Área de Trabalho e no Menu Iniciar e adiciona o desinstalador do Windows.
- **Portable**: É o alvo Portable do electron-builder e não requer instalador. As preferências do app são armazenadas na pasta `userData` do Windows.

### O executável portátil precisa ficar dentro da pasta `release`?
**Não!** Você pode copiar o executável Portable gerado para outra pasta ou unidade e iniciá-lo diretamente.

### O que é o arquivo `.blockmap`?
O arquivo `.blockmap` pode ser gerado pelo `electron-builder` para atualizações diferenciais de um atualizador compatível. O aplicativo ainda não configura esse fluxo; gerar o arquivo, por si só, não ativa auto-update.

---

## 🏗️ Estrutura do Monorepo

```
yt-dlp-ui/
├── ffmpeg.exe                  # Binário local, ignorado pelo Git
├── ffprobe.exe                 # Binário local opcional, ignorado pelo Git
├── yt-dlp.exe                  # Binário local, ignorado pelo Git
├── package.json                # Monorepo workspaces & scripts
├── agents.md                   # Arquitetura, invariantes e workflow para agentes de IA
├── README.md                   # Este arquivo
├── backend/                    # Orquestrador Express ESM (compartilhado Web e Desktop)
│   └── src/
│       ├── server.ts           # Servidor HTTP com export startServer()
│       ├── services/           # Queue, Runner (spawn seguro), Parser e Dialog
│       └── routes/             # Rotas REST (/api/downloads, /api/info, /api/system)
├── frontend/                   # Interface React 19 + Tailwind CSS v4
│   ├── public/assets/          # Imagens e fontes locais com licenças
│   └── src/
│       ├── App.tsx             # Orquestrador de estado e notificações
│       └── components/         # Header, UrlHeroInput, OptionsPanel, DownloadItem, LogViewer
├── desktop/                    # Processo Principal do Electron Windows
│   ├── src/
│   │   ├── main.ts             # Janela anti-flash, Express embutido e ciclo de vida
│   │   ├── preload.ts          # Bridge contextIsolation segura para notificações
│   │   └── tray.ts             # Bandeja do sistema com menu toggle de minimizar
│   ├── resources/icon.ico      # Ícone oficial do yt-dlp
│   └── electron-builder.yml    # Configuração de empacotamento NSIS e Portable
└── release/                    # Setup/Portable gerados localmente; ignorados pelo Git
    ├── yt-dlp GUI Setup <versão>.exe
    └── yt-dlp-GUI-Portable-<versão>.exe
```
