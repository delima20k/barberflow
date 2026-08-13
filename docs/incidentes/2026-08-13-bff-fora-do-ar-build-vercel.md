# Incidente 2026-08-13 — BFF fora do ar após rebuild na Vercel

**Status:** mitigado (produção fixada em deployment antigo saudável; auto-deploy da BFF desligado)
**Causa raiz:** não confirmada — evidências apontam para mudança no empacotamento/build da Vercel
**Impacto:** total na API (login, perfil, fila, chat, gate de assinatura) enquanto durou

---

## Linha do tempo

| Deployment | Commit | Horário | Estado |
|---|---|---|---|
| `oji2zfzpo` | `b87ae0dd` | 12/08 12:44 | ✅ saudável (é o que está em produção agora) |
| `9nktm6x1z` | `2ef670cf` | 12/08 23:48 | ❌ trava |
| `b99bygfom` | `8a33a780` | 13/08 00:33 | ❌ trava (com `npm ci` + deps fixas) |
| `hldwdhx6x` | local + Node 22 | 13/08 10:48 | ❌ trava |

O commit `2ef670cf` **não alterou nenhum arquivo da BFF** (só `?v=` de assets em
`apps/cliente` e `apps/profissional`). Ele apenas disparou o rebuild — todo push
na main reconstrói todos os projetos Vercel.

Entre o build bom (12:44) e o primeiro ruim (23:48) há **11 horas** e nenhuma
alteração no código da BFF.

## Sintoma

A função serverless aceita a conexão e **nunca responde** — timeout mesmo com 90s
de espera. Não é cold start lento nem 5xx: a requisição entra e morre.

Nos logs, a diferença é visível no marcador da invocação:

```
# deployment saudável
23:50:03  λ GET /api/external/cron/queue-presence-nudge  →  200 (1132ms)

# deployments quebrados
00:10:04  ◇ GET /api/health
[startup] patchProcessEnv falhou (continua): this[#db].from is not a function
TypeError: RedisStore is not a constructor
    at _criarRedisStore (/var/task/barberflow-bff-api/middlewares/rateLimiter.cjs:37:18)
    at /var/task/_virtual/rolldown_runtime.cjs:2:48
```

## Por que apontamos para o build, não para o código

1. **Mesmo código-fonte, artefatos diferentes:** bundle 46,56MB (bom) vs 46,32MB
   (quebrado), sem nenhuma mudança na BFF.
2. **Os erros são de interop de módulo, não de lógica:**
   - `require('rate-limit-redis')` não devolve o construtor
   - `createClient()` do `@supabase/supabase-js` devolve objeto **sem `.from`** —
     note que o erro é `this[#db].from is not a function`, **não**
     "Cannot read properties of undefined": o objeto existe, mas veio malformado.
3. Os stack traces passam por `/var/task/_virtual/rolldown_runtime.cjs`.

## Hipóteses testadas e descartadas

| Hipótese | Como foi testada | Resultado |
|---|---|---|
| Conteúdo do commit | `git show --stat` | Só tocou frontend |
| Dependência divergente | `npm ci` + 6 deps em versão exata (629 pacotes resolvidos idênticos) | **não resolveu** |
| Versão do Node (24 → 22) | `engines.node: "22.x"` + deploy real | **não resolveu** |
| Env var alterada | `vercel env ls` | Supabase é de 90 dias; nada recente |
| Bundle acima do limite | comparação de tamanho | quebrado é **menor** |
| Rede/DNS local | `curl` + fetch externo + `pro.barberflow.live` OK | descartado |

## Mitigação aplicada

1. `vercel promote` do deployment `oji2zfzpo` (`dpl_Af4T7H7ZwgVcpjKkbKZqTepJbWth`).
2. **Auto-deploy do projeto da BFF desligado** (`vercel git disconnect` no
   projeto `barberflow-q5c4`, ID `prj_qnU8hBdi7ynqJTbfekKcoiuLMPkX`), para que
   pushes na main não derrubem a API de novo.

Os projetos de frontend (`barberflow-cliente`, `barberflow-profissional`,
`barberflow`, `barberflow-adimin`) **não foram alterados** e seguem com
auto-deploy normal.

## Como reverter a mitigação (quando a causa raiz for resolvida)

```bash
# 1. Reconectar o auto-deploy da BFF
cd barberflow-bff-api
vercel link --project barberflow-q5c4 --yes
vercel git connect https://github.com/delima20k/barberflow.git

# 2. Limpar os artefatos locais que o link cria (contêm token)
rm -f .env.local && rm -rf .vercel
git checkout -- ../.gitignore

# 3. Disparar um deploy e VALIDAR DE VERDADE (não confiar no "Ready")
curl -s -w " HTTP:%{http_code}" --max-time 30 https://bff.barberflow.live/api/health

# 4. Se travar de novo, rollback imediato:
vercel promote https://barberflow-q5c4-oji2zfzpo-delima20ks-projects.vercel.app --yes
```

> **Atenção:** "Ready" no dashboard **não** significa que a API funciona. Os três
> deployments quebrados subiram como `Ready`. Só o teste HTTP real vale.

## Pendências relacionadas (não são a causa, mas apareceram)

1. `middlewares/rateLimiter.js:32` — `require('rate-limit-redis')` na v4 retorna
   `{ default: RedisStore }`, não a classe. O `try/catch` mascara e o rate limiter
   cai **sempre** para MemoryStore em produção.
2. `patchProcessEnv falhou: this[#db].from is not a function` — cliente Supabase
   chegando malformado no boot; investigar após a causa raiz.
3. `workers/worker.js` — `const { BarbeariaRepository } = require(...)` com export
   default: derrubaria o worker, mas ele não roda nesta hospedagem (serverless).
