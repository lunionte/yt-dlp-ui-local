# yt-dlp GUI — contexto do projeto e regras para agentes

Leia este arquivo antes de tarefas não triviais. Execute comandos na raiz. A documentação Markdown do projeto fica em dois arquivos na raiz: `agents.md` é a fonte das regras arquiteturais/operacionais; `README.md` é apenas apresentação visual guiada, de fácil entendimento, para visitantes do GitHub. Não duplicar contratos ou regras técnicas no README nem recriar documentos paralelos; comportamento detalhado fica no código e nos testes.

## Produto e arquitetura

Interface local para yt-dlp e FFmpeg, disponível como navegador e aplicativo Electron exclusivamente Portable Windows x64. O mesmo React atende os dois ambientes. O Electron inicia Express no próprio processo e carrega a interface em `127.0.0.1`. FFprobe é opcional. O Portable usa `userData` para preferências; não é um modo com configuração junto ao executável.

```text
React → REST + SSE → Express → fila → runner → yt-dlp / FFmpeg
Electron preload → IPC mínimo: janela, pastas e notificações
```

Stack: Node.js 22+, TypeScript/NodeNext, Express 4, Zod, React 19, Vite 6, Tailwind CSS 4, Electron 35 e electron-builder 26. Workspaces npm: `shared`, `backend`, `frontend`; `desktop` possui instalação própria.

| Local | Responsabilidade |
|---|---|
| `shared/src/index.ts` | Fonte única dos schemas, tipos, URL, eventos e contratos públicos; sem imports de Node. |
| `backend/src/routes/` | Validação integral de HTTP, status e encaminhamento de falhas assíncronas. |
| `backend/src/services/error.service.ts` | Classificação de falhas e diagnósticos com dados sensíveis redigidos. |
| `backend/src/services/ytdlp.service.ts` | Extração validada, cache/deduplicação, contexto de acesso e builders puros. |
| `backend/src/services/runner.service.ts` | Processos, UTF-8, buffers, timeout, cancelamento e confirmação de encerramento. |
| `backend/src/services/queue.service.ts` | Admissão, concorrência, transições, arquivos finais e sequência SSE. |
| `backend/src/services/path.service.ts` | Caminhos absolutos, diretórios, permissões e referências de cookies. |
| `backend/src/config/paths.ts` | Preferências validadas, gravação atômica e origem/integridade dos binários. |
| `frontend/src/utils/api.ts`, `system.ts` | Respostas validadas, erros da API e acesso a pastas via REST/IPC. |
| `frontend/src/hooks/useDownloadEvents.ts` | Conexão SSE e reconciliação de snapshots com eventos novos. |
| `frontend/src/App.tsx` | URL autoritativa, invalidação de prévia e autenticação da sessão. |
| `desktop/src/main.ts`, `preload.cts` | Inicialização, porta real, isolamento, IPC e saída aguardando limpeza. |
| `tools-lock.json`, `scripts/tools-manifest.mjs` | Versões, SHA-256 e gate dos recursos da release. |

Os arquivos de tipos/URLs antigos apenas reexportam `@ytdlp/shared`. Não adicione contratos ou normalizadores nesses adaptadores.

## Instalação, execução e validação

Coloque os binários Windows `yt-dlp.exe` e `ffmpeg.exe` na raiz para desenvolvimento e distribuição; são ignorados pelo Git. No modo web Unix, ferramentas ausentes na raiz são resolvidas pelo PATH. A API informa a origem real: `resources`, `project` ou `path`.

```bash
npm install
npm --prefix desktop install
npm run dev                 # Express 3001 + Vite 5173; compila shared antes
npm run build               # shared → backend → frontend
npm start                   # web local; requer build
npm run desktop:dev         # build integrado + Electron
npm run desktop:build
npm run desktop:dist        # ferramentas → versão → build → Portable → remove Portables anteriores
npm test                    # regressões independentes de redes sociais
npm run test:ui             # Playwright: interação, teclado e capturas com API/SSE simuladas
npm run test:media          # integração real com mídia sintética e servidor local
npm run diagnose            # disponibilidade/integridade; exit code não zero em falha
npm run desktop:check-package # backend/recursos de release/audit-validation/win-unpacked
npm run tools:verify        # versão/hash dos binários devem corresponder ao manifesto
```

Depois de instalar, execute `npm run build:shared` antes de rodar tsc isoladamente. Tipagem: `node node_modules/typescript/bin/tsc --noEmit -p <shared|backend|frontend|desktop>/tsconfig.json`. Os testes que criam processos ou usam loopback precisam de um ambiente que permita essas operações; EPERM do sandbox não comprova erro da aplicação.

Para preparar os testes de UI: `npm exec --workspace=frontend -- playwright install chromium`. `npm run test:ui` compila shared e inicia seu próprio Vite em `127.0.0.1:5173` (porta deve estar livre), sem backend nem redes sociais. `frontend/test/ui` usa fixtures validadas pelos schemas shared e transporte SSE simulado; não incluir mocks no bundle do produto. Chromium é o padrão; `UI_BROWSER_CHANNEL=msedge` permite usar Edge instalado. Capturas/traces ficam em `frontend/test-results/`, ignorado pelo Git. Playwright é somente dependência de desenvolvimento.

### Distribuição e versão do Electron

`npm run desktop:dist` executa `tools:verify`, `scripts/electron-version.mjs`, `desktop:build`, o empacotamento `electron-builder --win portable` e `scripts/clean-portable-releases.mjs`, nessa ordem. A distribuição gera apenas `yt-dlp-GUI-Portable-<versão>.exe` (Windows x64); diretórios unpacked/validação são intermediários. Não reintroduzir targets de instalação nem variantes optimized. O Portable depende de componentes internos NSIS do electron-builder; eles não são um target de Setup e devem permanecer.

Após empacotamento bem-sucedido, a limpeza confirma que o Portable da versão atual existe, é um arquivo regular e possui cabeçalho Windows MZ; então exclui apenas outros arquivos `yt-dlp-GUI-Portable-<versão estável>.exe` diretamente em `release/`. Mantém a versão atual, arquivos alheios e intermediários; não percorre subpastas nem segue links/junctions. Se o build falhar, a limpeza não roda; se o novo executável estiver ausente/inválido, as versões anteriores são preservadas e o comando falha. Falha de exclusão é reportada com exit code não zero. A versão atual é autoritativa, inclusive em downgrade.

Em terminal interativo, o script mostra a versão atual e pergunta `Deseja alterar a versão? (y/N)`. Enter/n mantém; y/Y solicita `Nova versão:`. Aceita somente versão estável `MAJOR.MINOR.PATCH`, sem zeros iniciais, com cada campo entre 0 e 65535; entrada inválida é solicitada novamente. Ctrl+C/EOF interrompe a distribuição. Sem TTY ou em CI (exceto `CI=0/false`), informa e mantém a versão automaticamente.

A versão altera apenas `desktop/package.json` e as identidades do desktop em `desktop/package-lock.json`; pacotes web/backend/shared e versões de dependências permanecem independentes. Os dois arquivos são preparados antes da substituição e restaurados se houver falha de escrita. A escolha define `app.getVersion()` e o nome do Portable; falha posterior de build mantém a versão escolhida para nova tentativa. Não há commits/tags/publicação automática. `npm run build`, `desktop:build` e `desktop:dev` não perguntam sobre versão. O comando interno `npm --prefix desktop run dist` somente empacota; use o comando da raiz para o fluxo completo.

Para atualizar ferramentas: obtenha os binários da origem indicada no manifesto, verifique sua procedência e mantenha uma cópia recuperável da versão anterior; substitua-os explicitamente e execute `node scripts/tools-manifest.mjs --record`, confira o diff e rode os gates. Registrar hash local não autentica o fornecedor: os pins atuais identificam recursos fornecidos localmente (`local-provided`). Não atualizar ferramentas silenciosamente, não aceitar divergência de hash e não confundir versão da GUI com a do motor. A release inclui o manifesto; recursos divergentes são bloqueados antes do uso. Não há auto-update da GUI ou do yt-dlp.

## Regras de implementação

### Contratos e fronteiras

- Imports relativos TypeScript de backend/desktop terminam em `.js`. O preload é `.cts` e gera `preload.cjs`.
- Novas opções, estados, eventos, inputs e respostas começam em `shared`; tipos são inferidos dos schemas. Não duplicar enums, usar `payload: any` ou tratar JSON externo como validado por um cast.
- HTTP, IPC, preferências em disco e JSON de ferramentas precisam de validação de runtime. Rotas Express 4 assíncronas usam `asyncRoute`; o middleware mantém o mesmo envelope de erro.
- Builders recebem configuração/contexto/pasta/identidade e retornam argumentos. Eles não carregam preferências nem criam diretórios.
- Caminho absoluto, arquivo existente, diretório e permissão de escrita são condições distintas. Abrir pasta nunca cria diretórios nem executa arquivos; criar saída é responsabilidade específica do serviço de caminhos.
- Preferências persistidas são apenas `defaultDownloadDir` e `maxConcurrentDownloads` (1–5), com escrita serializada e atômica. Caminhos de ferramentas e dados de autenticação não são preferências.
- Fontes e ícones permanecem locais; componentes usam as superfícies Liquid Glass de `frontend/src/index.css`.

### Interface compartilhada web/Electron

- Área de trabalho limitada ao viewport, até 1440 px: com lista vazia, formulário centralizado nos dois eixos da área útil, com a mesma largura que terá no layout dividido. A partir de 700 px, o primeiro job recebido por snapshot/SSE desloca o formulário à esquerda e revela Downloads à direita; remover o último item executa a transição inversa. Jobs terminais retidos também contam. A animação de 320 ms combina deslocamento sem escala, opacidade e altura do cabeçalho, respeita movimento reduzido e não se repete em progresso/logs; snapshot inicial preenchido entra diretamente no layout dividido. Abaixo de 700 px, as abas Novo download/Downloads só aparecem com jobs, e iniciar abre Downloads; esvaziar retorna ao formulário. O formulário permanece montado, mantém altura natural e operações acessíveis sem rolagem da página; até 500 px de altura, vistas compactas preservam os controles. A fila ocupa a altura disponível, com cabeçalho fixo e lista contínua rolável apenas internamente, sem seletor/paginação de jobs. Ordenar por criação, antigos acima e novos abaixo; revelar uma vez o job iniciado pelo usuário, sem deslocar leitura/foco em atualizações SSE. URL e quantidade de jobs além da mudança vazio/preenchido não alteram o layout. Margens laterais 24 px, 16 px no desktop compacto e 12 px no mobile; vista de até 500 px de altura usa padding compacto de 8 px.
- No estado centralizado, o cabeçalho do formulário apresenta a logo local e “O que vamos baixar hoje?” em Instrument Serif regular local (licença OFL já incluída). Ao surgir a fila, cede espaço ao título Novo download; volta ao esvaziar. Logo/frase usam 48/32 px em largura ampla, 32/26 px no cartão estreito e 24/22 px até 500 px de altura. Controles e textos funcionais continuam em Inter. Configurações fica no canto inferior esquerdo, com botão 40×40 px e espaço inferior reservado nos dois ambientes. Controles Electron têm bordas opacas grafite e vermelho no fechar, mantendo foco, arraste e IPC.
- `frontend/src/index.css` centraliza tokens `--text`, `--muted`, `--primary`, `--focus`, bordas/superfícies, espaçamentos 4/8/12/16/24/32 e tipografia. Preservar fundo líquido suavizado, painéis de vidro translúcido com desfoque/reflexos, área de leitura mais opaca e campos translúcidos delimitados. A paleta é prata/grafite com acento discreto; não substituir o vidro por painéis brancos sólidos nem reintroduzir azul saturado como aparência padrão. Foco fica dentro do contorno para não ser cortado por containers. Não espalhar cores/opacidades nem sobrescritas `!` nos componentes (a exceção global é redução de movimento).
- Reutilizar `Button`, `Field`, `StatusBadge`, `Notice`, `Tabs`, `Modal` e `MediaTitle` de `components/ui.tsx`; `PagedText` pagina textos/diagnósticos/logs e `DownloadsPanel` controla a apresentação da fila. Button tem módulo próprio, reexportado por ui, para evitar ciclos de imports. Inter para interface; JetBrains Mono apenas para logs, caminhos e números. Títulos 22–24 px, seções 18 px, conteúdo 16 px, labels/controles 14 px e metadados 13 px. Controles de formulário têm 44 px; botões de ícone, 40×40 px. Lucide usa tamanho/traço compartilhado e cores com significado de estado/ação; não adicionar ícones ornamentais.
- Labels têm `htmlFor`/id, ajuda associada e foco visível. Vídeo/Áudio são rádios nativos; capa/legendas são checkboxes. Títulos longos abrem diálogo com texto completo paginado por teclado; caminhos ficam em campos consultáveis e nomes completos em detalhes. Respeitar `prefers-reduced-motion` e fallback sem backdrop-filter. Medir contraste sobre fundo composto: texto normal ≥4,5:1 e indicadores necessários dos controles ≥3:1; isso não constitui certificação WCAG integral.
- `Modal` usa `<dialog>`/portal, `showModal` para fundo inerte, contenção explícita de Tab/Shift+Tab, Escape e restauração de foco. Montar somente quando aberto; cabeçalho/ações ficam fixos, com conteúdo separado em abas/páginas. Capturar e passar `returnFocus` quando o botão de abertura é desabilitado durante uma operação assíncrona. Preservar `app-drag`/`app-no-drag` e controles/IPC do Electron.
- Formulário reúne mídia, formato e destino simultaneamente; não voltar a separar essas funções em três abas no desktop/mobile normal. Nome do arquivo é uma linha com lápis de renomeação inline: Enter/confirmar salva, Escape/cancelar descarta, restaurar usa o título original. Iniciar download também confirma o rascunho, passando o nome explicitamente para evitar corrida com setState; preserva URL, prévia, opções e nome escolhido após enfileirar e abre Downloads no mobile. Limpeza do link é explícita. Configurações usam abas Downloads/Acesso/Ferramentas; orientações de autenticação ficam em diálogo próprio. Textos longos em detalhes não devem aumentar o painel além do viewport.
- Progresso percentual é apenas do stream atual. Processamento tem indicador indeterminado; somente status terminal verificado mostra conclusão. Ocultar velocidade/ETA em terminais e normalizar NA/N/A na apresentação. Volume transferido não é tamanho final após conversão; em múltiplos arquivos, indicar última mídia. Ações integram o card sem divisor: somente Ver logs tem texto; pasta, remoção, cancelamento e detalhes usam ícones com nomes acessíveis/tooltip e alvo mínimo de 40×40 px. Detalhes mantém acesso às métricas/arquivos omitidos no resumo compacto; falhas de cancelar/remover abrem um modal visível também no mobile. Remover job não exclui arquivos salvos.
- Configurações inicializam rascunho uma vez por abertura; atualizar ferramentas não substitui alterações. Autenticação continua explícita e restrita à sessão. Mostrar falhas de pasta/cópia na UI; confirmar cópia somente após sucesso. Logs seguem a última página; selecionar uma página anterior preserva a leitura e oferece Ir para o final. PagedText mede fonte/largura/altura renderizadas antes de quebrar/paginar, inclusive texto Unicode; copiar mantém todas as linhas originais, sem as quebras visuais. Conteúdo estático começa na primeira página. Não adicionar rolagem interna a modais.

### Acesso, metadados e erros

- Prévia e download usam o mesmo contexto explícito: `none`, `browser` com navegador permitido, ou `file` com referência absoluta a cookies Netscape. A UI mantém a escolha apenas nesta sessão.
- Nunca ler cookies de navegador automaticamente. Não incluir autenticação em jobs públicos, SSE, preferências ou logs. A fila mantém referências em memória separadas do DTO e as remove ao finalizar o job.
- Todos os comandos yt-dlp usam `--ignore-config`, `--no-cache-dir` e argumentos em vetor com URL após `--`. Nenhuma configuração global ou mudança silenciosa de sessão/extractor.
- O cache distingue URL e contexto; referências a arquivo incluem tamanho/mtime. Resultados de navegador autenticado não são reutilizados entre consultas. Deduplicação preserva consumidores: cancelar um não cancela outro.
- Metadados distinguem `video` e `collection`, preservam entradas e warnings e rejeitam JSON inválido. Um job baixa todas as mídias acessíveis do post, até 100; falhas deixam o job em erro, com os arquivos já produzidos identificados.
- A resolução numérica limita a menor dimensão: altura em horizontal/quadrado e largura em vertical, tanto na prévia quanto na seleção. `buildVideoFormatSelector` aplica o teto aos streams separados e aos formatos com áudio/vídeo juntos. Orientação desconhecida mantém filtro conservador por altura; dimensões desconhecidas não passam no teto. Nunca usar só altura para Reels/Shorts/TikTok nem usar apenas `-S res:N`, que pode selecionar acima do teto quando não há formato inferior. Sem formato elegível, informar falha de formato. `best` não impõe teto. Container envolve merge/remux explícito, sem prometer recodificação de codecs incompatíveis.
- Nomes públicos usam título da mídia ou nome personalizado, com sanitização Windows e limite de 80 bytes UTF-8 em `shared/src/filename.ts`, reutilizado pela prévia e publicação. A extensão vem do arquivo pós-processado. Colisões recebem (2), (3), etc. UUID fica apenas no diretório temporário exclusivo criado por job; contador separa entradas da coleção. Templates escapam `%` de nomes e caminhos. Jobs diferentes não retomam parciais uns dos outros.
- `output.service.ts` publica sem sobrescrever: hard link exclusivo no mesmo filesystem ou cópia exclusiva quando não suportado, verifica o destino antes de remover a origem. Limpeza valida o diretório exclusivo e só roda após close. Falha de publicação preserva temporários recuperáveis e informa diagnóstico. Resultados completos anteriores a erro/cancelamento são publicados; parciais não viram arquivos finais. `outputPath` continua sendo a pasta; `outputFiles` só contém caminhos finais publicados/verificados, nunca temporários.
- Resoluções da UI vêm dos metadados, ordenadas da maior para a menor; não manter listas presumidas nem opção visível Melhor disponível. Nova URL/contexto seleciona o máximo; reanálise mantém escolha menor ainda disponível. Dimensões desconhecidas mostram aviso e usam `best` internamente. Sem prévia válida, vídeo aguarda análise; áudio permanece independente. Coleções usam a união das resoluções como teto, sem ampliar entradas menores. API mantém `best` por compatibilidade.
- Erros são classificados no backend: autenticação, rate limit, acesso negado, disponibilidade, formato, rede, timeout, extractor, ferramentas, filesystem, validação, conflito, capacidade, shutdown ou desconhecido. Nunca inferir privacidade pelo comprimento de uma mensagem, nem Cloudflare apenas por 403.
- Envelope HTTP: `{ error, details: { code, phase, message, retryable, diagnosticId } }`. Diagnósticos têm detalhes/contexto redigidos e são consultados em `GET /api/system/diagnostics/:id`.
- Não registrar cookies, autorização, credenciais, URLs assinadas completas ou linha de comando sem redação. Falha desconhecida permanece `UNKNOWN`. Abort intencional não é erro de rede.
- Não repetir automaticamente falhas de login/429. A UI oferece tentativa explícita; retries de transferência do yt-dlp são limitados a três. O prazo total de metadados é 45 s, incluindo espera por capacidade.

### Processos, fila e eventos

- Binários usam `spawn`/`execFile`, `shell: false` e argumentos separados. Nunca executar `/bin/sh -c` com input; fallbacks Unix invocam utilitários diretamente. PowerShell recebe texto de diálogo como dados base64; AppleScript tem escaping próprio.
- Somente a fila altera o estado global. Parser informa progresso/etapa. Estados terminais não voltam a ativos, e saída tardia não sobrescreve intenção de cancelamento.
- Transições: `queued → downloading → processing ↔ downloading → completed/error`; queued pode ser cancelado diretamente; estados ativos passam por `cancelling → cancelled`.
- Solicitar kill não equivale a terminar. Slots reservados pela fila só são liberados ao concluir a tarefa, após `close` e a limpeza em andamento. Falha de kill mantém rastreamento e não fabrica sucesso.
- Windows encerra a árvore com `taskkill /T /F`; Unix cria grupo no spawn e escalona SIGTERM para SIGKILL. Metadados e downloads compartilham essa política.
- Shutdown é idempotente e congela admissões/drenagem antes da limpeza. Cancela pendências e consultas, espera filhos e não perde handles nem dispara o próximo job.
- Progresso representa o stream atual, não a coleção inteira. Novo stream troca para downloading. Somente término verificado conclui o job. Throttle de 250 ms só é contornado por mudança real de etapa; marcadores estruturados não viram logs.
- `GET /api/downloads` retorna `{ sequence, jobs }`. SSE é união discriminada com `sequence`; jobs têm `revision`. Durante snapshot, o frontend guarda/reaplica eventos mais novos, incluindo remoções; não substituir eventos novos por estado antigo.
- Limites atuais: 100 jobs não terminais; 200 terminais retidos; 200 linhas por job/2.000 caracteres por linha publicada; linha do runner até 256 Ki caracteres; JSON de metadados até 20 Mi caracteres; 2 consultas de metadados ativas + 20 esperando; cache/diagnósticos até 100; até 20 clientes SSE. Cliente SSE sem capacidade de escrita é desconectado.
- A URL em App é autoritativa. Editar URL ou autenticação invalida imediatamente a prévia e aborta consulta anterior. Prévia só fornece título para a mesma URL/contexto. Falha pode ser repetida explicitamente.

### Rede e Electron

- Express sempre escuta em `127.0.0.1`. Origem/Host HTTP aceitam o próprio serviço local; Vite 5173 é permitido em desenvolvimento. Origem externa/cross-site é rejeitada; CORS não usa credenciais.
- Electron usa `contextIsolation: true`, `nodeIntegration: false`, sandbox e preload CommonJS mínimo. Preservar single-instance lock e bandeja/notificações.
- Porta efêmera é obtida do servidor depois de listening. Navegação fica na origem exata da aplicação; links HTTP/HTTPS externos abrem no navegador padrão.
- IPC aceita somente o frame principal da janela da aplicação e valida argumentos. O backend fornece a validação comum de diretório.
- A saída do Electron é adiada em `before-quit`, via `lifecycle.ts`, com `preventDefault()` e só chama `app.quit()` novamente depois da limpeza. Uma Promise retornada por listener não adia a saída por si só.

## Evidência e acompanhamento

- Apresentação inicial e controles em 2026-10-09: formulário centralizado com logo/Instrument Serif, transição reversível vazio/preenchido, Configurações no canto inferior esquerdo e contornos opacos nos controles Electron. Layout e foco preservam rascunhos, inclusive após remontagem por mudança de autenticação; mobile mostra abas somente com jobs. Sem mudanças de contratos públicos, dependências, versão ou Portable.
- Validação desta apresentação: 48 regressões Node, 25 testes UI e `desktop:build` passaram. Capturas Chromium inspecionadas em 1200×800, 800×600, 1440×900, 390×844 e 600×400, além do quadro intermediário da transição e controles com ponte Electron simulada. Cobertura inclui primeira entrada/última remoção, snapshot preenchido, falha de início, fonte local, rascunho/foco, movimento reduzido, redimensionamento e reversão durante animação. Amostragem da captura de controles em 1200×800: borda grafite 4,96:1 e vermelha 5,40:1 contra a superfície adjacente; frase 11,82:1 usando foreground CSS e fundo amostrado. Não constitui certificação de todos os estados/pixels. O smoke nativo iniciou o backend, mas a GPU encerrou antes de ready-to-show com -2147483645 e `GPU process isn't usable`; validação visual nativa continua pendente. Vite/Playwright exigiram execução fora das restrições do sandbox (realpath/servidor local); testes não dependem de redes sociais. Nenhum Portable foi recompilado/publicado.

- Correções complementares de 2026-10-08: títulos/nomes personalizados agora são nomes públicos, UUID é interno, publicação exclusiva resolve colisões e preserva resultados completos/falhas recuperáveis. Link/prévia/opções permanecem após enfileirar; resoluções são dinâmicas com máximo automático e fallback avisado para dimensões desconhecidas. Fila contínua ocupa a lateral direita com rolagem interna e ações compactas; substitui a paginação de jobs da revisão anterior. REST/SSE e schemas públicos preservados, sem novas dependências ou alteração de versão/release.
- Validação complementar: 48 regressões Node, 16 testes UI de resoluções/fila/rascunhos/teclado e capturas nos tamanhos existentes, `desktop:build` e duas integrações nativas (tetos de resolução; títulos originais, Unicode, `%` em nomes/caminhos, coleções MP3/MKV e colisões concorrentes) passaram. Cancelamento espera close antes da publicação/limpeza; falha simulada EACCES preserva o arquivo recuperável e não publica temporários. Testes UI usam API/SSE locais; integração usa mídia sintética e ferramentas reais, sem provar acesso a novas URLs sociais. Sandbox apresentou EPERM em realpath/loopback; gates passaram fora dessas restrições.
- Nova tentativa de smoke Electron iniciou o backend, mas a GPU encerrou com -2147483645 e `GPU process isn't usable` antes de ready-to-show; conferência visual nativa continua pendente. Capturas Chromium foram inspecionadas em 800×600 e com 30+ jobs, além dos testes de layout. Esta tarefa não recompilou Portable nem publicou release.

- Revisão visual de 2026-10-08, com direção ajustada pelo usuário: workspace sem rolagem, downloads à direita (confirmado pelo usuário), formulário integrado, renomeação inline, painéis com altura natural, vidro/reflexos e paleta prata/grafite, tokens/primitivos compartilhados, tipografia/contraste, rádios/checkboxes, estados específicos dos downloads, modais acessíveis e rascunhos/logs corrigidos. REST/SSE, schemas públicos, seleção de formatos e versão desktop preservados. Adicionado `@playwright/test` como dependência de desenvolvimento e comando `test:ui` isolado da suíte Node.
- Gates da revisão visual: 40 regressões Node, 13 testes UI no Chromium e `desktop:build` passaram. Capturas em 1200×800, 800×600, 1440×900 e 390×844, mais reflow de 600×400 equivalente a 200% de zoom numa janela 1200×800; estados de análise/vídeo/áudio/coleção/fila/progresso/processamento/cancelamento/erro/conclusão/desconexão. Testes conferem dimensões de conteúdo/viewport (não apenas ausência de scrollbar), formulário simultâneo em desktop/mobile, vistas compactas/configurações, teclado/foco/restauração, seleção automática do novo job, confirmação/cancelamento/restauração do nome e confirmação ao iniciar, payload dos controles, rascunhos, falhas de pasta/refresh/cancelamento/início e paginação/acompanhamento/cópia dos logs. O reflow compacto inclui formatos, destino, autenticação browser/file, processamento, fila e logs. Os testes usam dados locais, sem comprovar downloads novos em redes sociais.
- Contraste da revisão prata/grafite, por amostragem de superfícies efetivamente renderizadas em 1200×800: texto principal 11,43–12,30:1; secundário 6,20–6,50:1; branco no botão primário 7,42–9,67:1 (5,70:1 no extremo mais claro do gradiente definido); contornos de resolução/destino 3,45/3,42:1. Foregrounds de texto vêm do CSS; bordas e fundos foram amostrados na captura. Amostragem não certifica acessibilidade integral nem todos os pixels/estados.
- Validação visual nativa permanece pendente: tentativa com runtime Electron e janela oculta em modo smoke encerrou antes de renderizar, por `GPU process isn't usable` (exit code -2147483645). Não declarar sucesso visual do Electron com base no navegador ou no build. A revisão não gerou nem publicou novo Portable; `desktop:dist` continua sendo o fluxo para recompilar a distribuição.

A correção da auditoria de 2026-10-07 abrange diagnóstico social, autenticação opcional, coleções/formatos/arquivos, cancelamento/shutdown, shell Unix, contratos/validação, SSE, limites de recursos, lockfiles e manifesto das ferramentas. Padrões acima descrevem implementação, não apenas propostas.

- Validação em 2026-10-07: 39 regressões passaram em `npm test`; classificação/redação (inclusive HTTP 403 com wrapper genérico); auth/cache/deduplicação; carga de metadados; eventos/snapshot; cancelamento/kill/shutdown; parser; HTTP; arquivos; vetores dos diálogos; saída do Electron; versionamento guiado e limpeza de Portables em `scripts/test` (TTY, CI, entradas inválidas, cancelamento, restauração de manifests, preservação de versões quando novo executável é inválido e rejeição de junctions).
- Integração real: página local com duas mídias sintéticas, download de dois MKV e extração de dois MP3, com arquivos finais e coleção reconhecidos.
- Gates adicionais da auditoria passaram: `desktop:build`, `diagnose`, `tools:verify` e `desktop:check-package`. Interface conferida no navegador; pacote de validação Windows (`--dir`, sem assinatura) com contratos/Zod/preload e backend/recursos do ASAR carregados no runtime Node do Electron. O smoke test com janela encontrou falha de GPU no ambiente; não foi considerado sucesso visual do desktop.
- Distribuição Portable validada em 2026-10-07: `npm run desktop:dist` passou sem TTY, manteve 1.1.0 e gerou o Portable; Setup/blockmap/optimized e relatórios antigos foram removidos. `npm run desktop:check-package -- release/win-unpacked` confirmou backend, contratos e integridade dos recursos da distribuição atual. Essa verificação não substitui a validação visual da janela Electron.
- Correção de resolução vertical em 2026-10-08: o Reel `DeM7WlYxoAO` oferece 720×1280 e 1080×1920; filtro somente por altura rejeitava ambos em 1080p. Prévia/seleção agora usam orientação e menor dimensão. Download real desse Reel concluiu em 1080p/MP4 sem cookies; 40 regressões e duas integrações nativas passaram, incluindo formatos separados/combinados, tetos 720p/1080p e rejeição de dimensões desconhecidas/acima do limite. Portable 1.2.0 recompilado e backend empacotado verificado. Fixtures `--load-info-json` não incluem `webpage_url`, evitando reextração de rede após falha esperada de formato.
- Windows é o alvo de distribuição e da validação funcional atual. As execuções nativas Unix e sessões reais de Instagram/Twitter continuam dependentes de ambiente/conta/URL de reprodução; não declarar sucesso nessas condições apenas por testes locais.
- Conteúdo público pode exigir sessão ou ser limitado pelo site. Cookies válidos não garantem suporte a um extractor que mudou. Não afirmar que esta correção torna qualquer URL baixável.
- Manter testes específicos quando surgir uma nova falha; não substituir os gates isolados por testes dependentes das redes sociais.
- Ao concluir alterações, atualize este arquivo somente com decisões/padrões, mudanças de contratos/dependências e pendências reais, informando evidência e limites. Não marcar uma área como resolvida com base apenas em tipagem/build.
