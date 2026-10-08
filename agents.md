# yt-dlp GUI — contexto do projeto e regras para agentes

Leia este arquivo antes de tarefas não triviais. Execute comandos na raiz. Esta é a única documentação Markdown mantida pelo projeto; contratos e comportamento detalhado ficam no código e nos testes. Não recrie documentos paralelos com regras duplicadas.

## Produto e arquitetura

Interface local para yt-dlp e FFmpeg, disponível como navegador e aplicativo Electron Windows x64 (Setup NSIS e Portable). O mesmo React atende os dois ambientes. O Electron inicia Express no próprio processo e carrega a interface em `127.0.0.1`. FFprobe é opcional. O Portable usa `userData` para preferências; não é um modo com configuração junto ao executável.

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
npm run desktop:dist        # verifica ferramentas; gera Setup/Portable em release/
npm test                    # regressões independentes de redes sociais
npm run test:media          # integração real com mídia sintética e servidor local
npm run diagnose            # disponibilidade/integridade; exit code não zero em falha
npm run desktop:check-package # backend/recursos de release/audit-validation/win-unpacked
npm run tools:verify        # versão/hash dos binários devem corresponder ao manifesto
```

Depois de instalar, execute `npm run build:shared` antes de rodar tsc isoladamente. Tipagem: `node node_modules/typescript/bin/tsc --noEmit -p <shared|backend|frontend|desktop>/tsconfig.json`. Os testes que criam processos ou usam loopback precisam de um ambiente que permita essas operações; EPERM do sandbox não comprova erro da aplicação.

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

### Acesso, metadados e erros

- Prévia e download usam o mesmo contexto explícito: `none`, `browser` com navegador permitido, ou `file` com referência absoluta a cookies Netscape. A UI mantém a escolha apenas nesta sessão.
- Nunca ler cookies de navegador automaticamente. Não incluir autenticação em jobs públicos, SSE, preferências ou logs. A fila mantém referências em memória separadas do DTO e as remove ao finalizar o job.
- Todos os comandos yt-dlp usam `--ignore-config`, `--no-cache-dir` e argumentos em vetor com URL após `--`. Nenhuma configuração global ou mudança silenciosa de sessão/extractor.
- O cache distingue URL e contexto; referências a arquivo incluem tamanho/mtime. Resultados de navegador autenticado não são reutilizados entre consultas. Deduplicação preserva consumidores: cancelar um não cancela outro.
- Metadados distinguem `video` e `collection`, preservam entradas e warnings e rejeitam JSON inválido. Um job baixa todas as mídias acessíveis do post, até 100; falhas deixam o job em erro, com os arquivos já produzidos identificados.
- A resolução numérica é um teto em todos os fallbacks; quando não há formato elegível, informar falha de formato. `best` não impõe teto. Container envolve merge/remux explícito, sem prometer recodificação de codecs incompatíveis.
- Nomes incluem identidade do job, contador/índice e mídia. Prefixo customizado é sanitizado/limitado, `%` é escapado e nomes Windows são tratados. Jobs diferentes não retomam parciais uns dos outros. Arquivos existentes não são considerados sucesso sem resultado final verificável.
- `outputPath` continua sendo a pasta. `outputFiles` contém caminhos efetivos reportados após pós-processamento e verificados antes de concluir.
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

A correção da auditoria de 2026-10-07 abrange diagnóstico social, autenticação opcional, coleções/formatos/arquivos, cancelamento/shutdown, shell Unix, contratos/validação, SSE, limites de recursos, lockfiles e manifesto das ferramentas. Padrões acima descrevem implementação, não apenas propostas.

- Validação em 2026-10-07: 30 regressões passaram em `npm test`; classificação/redação (inclusive HTTP 403 com wrapper genérico); auth/cache/deduplicação; carga de metadados; eventos/snapshot; cancelamento/kill/shutdown; parser; HTTP; arquivos; vetores dos diálogos e saída do Electron.
- Integração real: página local com duas mídias sintéticas, download de dois MKV e extração de dois MP3, com arquivos finais e coleção reconhecidos.
- Gates adicionais passaram: `desktop:build`, `diagnose`, `tools:verify` e `desktop:check-package`. Interface conferida no navegador; pacote de validação Windows (`--dir`, sem assinatura) com contratos/Zod/preload e backend/recursos do ASAR carregados no runtime Node do Electron. O smoke test com janela encontrou falha de GPU no ambiente; não foi considerado sucesso visual do desktop nem validação do instalador NSIS.
- Windows é o alvo de distribuição e da validação funcional atual. As execuções nativas Unix e sessões reais de Instagram/Twitter continuam dependentes de ambiente/conta/URL de reprodução; não declarar sucesso nessas condições apenas por testes locais.
- Conteúdo público pode exigir sessão ou ser limitado pelo site. Cookies válidos não garantem suporte a um extractor que mudou. Não afirmar que esta correção torna qualquer URL baixável.
- Manter testes específicos quando surgir uma nova falha; não substituir os gates isolados por testes dependentes das redes sociais.
- Ao concluir alterações, atualize este arquivo somente com decisões/padrões, mudanças de contratos/dependências e pendências reais, informando evidência e limites. Não marcar uma área como resolvida com base apenas em tipagem/build.
