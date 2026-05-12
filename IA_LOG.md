# IA_LOG

Registro de uso de IA durante o desafio. Os prompts abaixo são os que mais mexeram em decisões reais; muitos outros foram triviais (renomear, formatar) e estão omitidos.

## 1. Anti-cheat: como calcular o teto?

**Prompt** — "O desafio diz que o anti-cheat não pode ser apenas `elapsed × constante`. Para uma simulação 1Hz onde a cada tick eu adiciono `rate` ao carry e converto carry inteiro em peças (boas ou defeito por RNG), qual é a melhor forma de calcular um teto teórico? Quero margem documentada."

**O que veio** — sugestão de calcular o `rate` máximo com `improvements` informados, multiplicar pelo tempo, e adicionar margem fixa.

**O que ajustei** — a heurística ingênua erra quando o `rate` é fracionário (ex.: 1.7) porque o carry encadeado pode liberar 2 peças num tick eventualmente. Implementei `maxGoodPiecesPerSecondTick` varrendo `carry ∈ [0, 1)` em 500 amostras e pegando o máximo de peças num único tick com RNG favorável. A margem ficou `+2% + 15` para cobrir arredondamentos e a oscilação do carry. Tudo em `api/src/scores/anticheat.service.ts` e `game-simulation.ts`.

## 2. Rate-limit sem race condition

**Prompt** — "No NestJS com Mongoose, eu tenho um `findOne` que checa se passaram 10s desde o último save de um jogador, e depois um `findOneAndUpdate` que registra a nova tentativa. Como faço isso atômico?"

**O que veio** — proposta de transação Mongo com sessão.

**O que ajustei** — descartei transação (custo alto, escopo do desafio é uma collection). Usei um único `findOneAndUpdate` com filtro `$or: [{ lastSaveAttemptAt: { $exists: false } }, { lastSaveAttemptAt: null }, { lastSaveAttemptAt: { $lte: now − 10s } }]` e `upsert: true`. Quando o filtro casa, o documento é atualizado e devolvido; quando não, retorna `null` e eu calculo o `Retry-After` lendo o documento separadamente. Está em `acquireSaveSlot` (`scores.service.ts`).

## 3. Tickrate independente do FPS

**Prompt** — "Como garantir tick 1Hz mesmo se a aba tiver 5 FPS ou minimizar? Já li sobre delta time, mas como integro isso com Zustand?"

**O que veio** — pseudocódigo correto com `Date.now()`, acumulador e laço `while (acc >= MS_PER_TICK)`.

**O que ajustei** — adicionei a parte de catch-up offline truncada em 8h (regra 2 do PDF), a separação entre `lastProcessedAtMs` (em ms epoch) e o histórico de produção, e descobri tarde que estava gravando em `localStorage` a cada frame mesmo sem produção — fix no `tickWithNow` em `web/src/store/gameStore.ts`.

## 4. Detecção de tampering: HMAC ou checksum?

**Prompt** — "Para detectar edição do localStorage num jogo idle web, faz sentido HMAC ou um checksum bobo é suficiente? O PDF do desafio diz 'estratégia à sua escolha, justifique'."

**O que veio** — recomendação de HMAC com chave do servidor (cliente solicita um nonce assinado).

**O que ajustei** — discordei. HMAC com chave embutida no bundle é equivalente a checksum (a chave vaza). HMAC com nonce do servidor adicionaria round-trip a cada save e o servidor já é a fonte da verdade para o ranking. Fui de FNV-1a + validação de schema/ranges, documentando que cobre "edição manual" e não promete bloquear usuário que reverter o JS. Justificativa expandida no README.

## 5. Investigar race em idempotência e save-if-higher

**Prompt** — "Audite `scores.service` para race entre `create` idempotente e dois `POST` com o mesmo `requestId`, e entre `findOne` + `save` no melhor score. Proponha correção atômica com Mongoose."

**O que veio** — sugestão de transações ou padrão upsert/`findOneAndUpdate` com `$max`.

**O que ajustei** — implementei `findOneAndUpdate` com `$setOnInsert` na coleção de idempotência, fallback em `E11000`, e `findOneAndUpdate` condicional no agregado do jogador; testes com mocks de repositório cobrindo concorrência simulada.

## 6. Política global `prefers-reduced-motion`

**Prompt** — "Onde o app tem animação contínua (Framer Motion, LEDs, glow) e como respeitar `prefers-reduced-motion` sem quebrar o layout?"

**O que veio** — lista de componentes e uso de `useReducedMotion` do Framer ou `matchMedia`.

**O que ajustei** — criei `useReducedMotion` com `matchMedia`, desliguei animações pesadas no `ProductionStage`, tokens de tema para glow, e regra global em `GlobalStyle` para reduzir `animation`/`transition` quando o SO pede.

## 7. Hardening CORS + observabilidade no bootstrap

**Prompt** — "Em NestJS com Socket.IO e `credentials: true` no cliente, como evitar `origin: true` em produção e ainda propagar correlation id no Pino?"

**O que veio** — checklist com `helmet`, lista explícita de origins, `genReqId` no `pino-http`, header `x-request-id`.

**O que ajustei** — falha de bootstrap se `NODE_ENV=production` sem `CORS_ORIGIN`; gateway WS lê a mesma env; `AllExceptionsFilter` padroniza erros com `requestId` do header.

## 8. CI paralelo e cobertura Vitest ≥80%

**Prompt** — "Quero jobs paralelos no GitHub Actions (lint, typecheck, test, coverage) e threshold de cobertura no frontend sem flakies."

**O que veio** — matrix de jobs, `@vitest/coverage-v8`, artefatos `coverage/`.

**O que ajustei** — jobs separados `web-lint`, `web-typecheck`, `web-test`, `web-coverage` + upload de artefato; thresholds em arquivos excluindo bootstrap/`GlobalStyle`; teste dedicado em `useAutosave` para subir linhas dos hooks.

## 9. Container Docker non-root + healthcheck sem curl

**Prompt** — "Adicione usuário não-root na imagem da API e HEALTHCHECK que funcione em `node:20-alpine` sem instalar curl."

**O que veio** — `USER node` + `wget` ou instalar `curl`.

**O que ajustei** — `adduser`/`addgroup` Alpine, `chown`, `USER app`, e `HEALTHCHECK` com `node -e` + `fetch` interno; o mesmo padrão no `docker-compose` para `depends_on` com saúde da API.

## 10. Onde *não* usei IA

- Estrutura de pastas por feature (componentes com `index.tsx` + `styles.ts` + `utils.ts` + `types.ts`): preferência pessoal, vinha pronta da minha cabeça.
- Tema visual (paleta lilás/rosa industrial em fundo escuro): escolha autoral; pedi à IA só uma checagem de contraste WCAG.
- Decisão de **não** usar Postgres ou Redis: avaliação direta do escopo (2 coleções, sem joins, sem fila). Não pedi opinião à IA porque a resposta seria genérica.
- Conventional Commits e ordem dos PRs: gerência humana de fluxo.
