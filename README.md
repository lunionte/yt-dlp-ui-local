# yt-dlp GUI (Local Web Downloader & Desktop Windows + FFmpeg)

Interface gráfica moderna, limpa e responsiva para **yt-dlp** e **FFmpeg**, projetada para rodar localmente no seu computador. Disponível tanto como **aplicativo Desktop nativo para Windows (.exe instalador e portátil)** quanto como **aplicação Web local**.

Inspirada no design minimalista do **Pillowcase** (tema claro com fundo suave, cantos arredondados, azul cobalto de destaque e foco total na usabilidade).

---

## 💻 Aplicativo Desktop para Windows

O projeto já inclui executáveis prontos para Windows de 64 bits com **yt-dlp e FFmpeg embutidos** (não é necessário instalar nada externamente). O FFprobe é opcional no Desktop e é usado apenas no diagnóstico; se estiver disponível no PATH, o aplicativo o detecta.

Os executáveis gerados ficam na pasta [`release/`](release/):

| Executável | Tipo | Como Usar |
|---|---|---|
| **`yt-dlp GUI Setup 1.0.0.exe`** | **Instalador Oficial (NSIS)** | Dá duplo clique para instalar. Cria atalhos na Área de Trabalho e no Menu Iniciar, com suporte a desinstalação pelo Painel de Controle do Windows. |
| **`yt-dlp-GUI-Portable-1.0.0.exe`** | **Executável Portátil Único** | **Não requer instalação!** Você pode copiar para a Área de Trabalho, pasta Documentos ou um Pen Drive e abrir com duplo clique direto de qualquer lugar. |

### Recursos Exclusivos do Modo Desktop
- **Bandeja do Sistema (System Tray)**: Ao fechar ou minimizar a janela, o app pode continuar na bandeja ao lado do relógio do Windows.
  - Clique simples ou duplo no ícone para restaurar a janela.
  - Clique com o botão direito no ícone para abrir o menu: permite ativar/desativar o comportamento de minimizar para a bandeja e sair do programa.
- **Diálogos Nativos Ultrarrápidos**: A seleção de pastas e executáveis abre instantaneamente (0ms) usando a API nativa do Windows.
- **Notificações do Windows**: Dispara notificações nativas no canto da tela quando qualquer download for concluído com sucesso.
- **Instância Única (Single-Instance)**: Impede a abertura acidental de várias instâncias simultâneas do programa.

---

## 🚀 Como Executar pelo Código-Fonte

### Modo Desktop Windows (Electron)
```bash
# 1. Instalar dependências
npm install

# 2. Executar o aplicativo desktop em modo de desenvolvimento
npm run desktop:dev

# 3. Compilar e gerar o Instalador e o Portátil na pasta release/
npm run desktop:dist
```

### Modo Web Local (Navegador)
```bash
# 1. Modo de Produção Web Local (porta 3001)
npm start
# Acesse: http://localhost:3001

# 2. Modo de Desenvolvimento Web (com Hot-Reloading / HMR)
npm run dev
# Frontend (Vite): http://localhost:5173
# Backend (Express): http://localhost:3001
```

---

## 🛠️ Ferramentas Externas Embutidas

O modo Web local utiliza os binários colocados na raiz do projeto:
- `yt-dlp.exe`: Motor de download e extração de metadados
- `ffmpeg.exe`: Processamento, muxing e extração de áudio
- `ffprobe.exe`: ferramenta opcional de diagnóstico (não empacotada no Desktop)

> **No Desktop (.exe)**: yt-dlp e FFmpeg vêm empacotados dentro do executável; FFprobe é opcional e pode ser detectado pelo PATH.
> **No modo Web local**: Os binários colocados na raiz do projeto são detectados e priorizados automaticamente.

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
   - Crie uma nova tag (por exemplo, `v1.0.0`) e dê um título (ex: `yt-dlp GUI v1.0.0 - Windows`).
   - Na caixa **"Attach binaries by dropping them here or selecting them"**, arraste os seguintes arquivos da sua pasta `release/`:
     - `yt-dlp GUI Setup 1.0.0.exe` (Instalador recomendado para a maioria dos usuários)
     - `yt-dlp-GUI-Portable-1.0.0.exe` (Versão portátil sem instalação)
     - `yt-dlp GUI Setup 1.0.0.exe.blockmap` (Opcional, usado caso utilize o sistema de auto-update diferencial)
   - Adicione uma descrição com as novidades e clique em **"Publish release"**.

---

## ❓ Perguntas Frequentes (FAQ)

### Qual a diferença entre o Setup e o Portable?
- **Setup (`yt-dlp GUI Setup 1.0.0.exe`)**: É o instalador tradicional. Ele instala os arquivos em `%LOCALAPPDATA%\Programs\yt-dlp GUI`, cria atalhos na Área de Trabalho e no Menu Iniciar, e adiciona um desinstalador limpo no Windows. Recomendado para uso diário.
- **Portable (`yt-dlp-GUI-Portable-1.0.0.exe`)**: É um executável único e independente. Não precisa instalar nada e não altera o Registro do Windows. Ideal para levar em um pen drive ou usar sem privilégios de instalação.

### O executável portátil precisa ficar dentro da pasta `release`?
**Não!** Você pode recortar ou copiar o `yt-dlp-GUI-Portable-1.0.0.exe` para qualquer lugar (sua Área de Trabalho, pasta Downloads, outro computador ou pen drive) e executá-lo diretamente com duplo clique.

### O que é o arquivo `.blockmap`?
O arquivo `.blockmap` (ex: `yt-dlp GUI Setup 1.0.0.exe.blockmap`) é gerado pelo `electron-builder` para suporte a **atualizações automáticas diferenciais** (delta updates). Ele mapeia o executável em pequenos blocos criptografados. Quando uma nova versão for lançada, o aplicativo baixa apenas as partes do arquivo que foram alteradas, em vez de baixar o instalador inteiro novamente.

---

## 🏗️ Estrutura do Monorepo

```
yt-dlp-ui/
├── ffmpeg.exe                  # Binário local do FFmpeg
├── ffprobe.exe                 # Binário local do FFprobe
├── yt-dlp.exe                  # Binário local do yt-dlp
├── package.json                # Monorepo workspaces & scripts
├── agents.md                   # Diretrizes para agentes de IA
├── README.md                   # Este arquivo
├── backend/                    # Orquestrador Express ESM (compartilhado Web e Desktop)
│   └── src/
│       ├── server.ts           # Servidor HTTP com export startServer()
│       ├── services/           # Queue, Runner (spawn seguro), Parser e Dialog
│       └── routes/             # Rotas REST (/api/downloads, /api/info, /api/system)
├── frontend/                   # Interface React 19 + Tailwind CSS v4
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
└── release/                    # Executáveis Windows finais gerados
    ├── yt-dlp GUI Setup 1.0.0.exe
    └── yt-dlp-GUI-Portable-1.0.0.exe
```
