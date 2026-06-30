# Fix — 500 em POST /api/v1/admin/login (v2, definitivo)

**Data:** 2026-06-13
**Status:** RESOLVIDO e validado em produção (`bff.barberflow.live`).

---

## 1. Por que a v1 falhou

O commit `83480418` (v1) ESPECULOU que as variáveis de ambiente do admin estavam
ausentes e instruiu configurá-las — sem nunca ter observado o erro real de runtime.
O 500 persistiu porque o diagnóstico estava incompleto.

## 2. Captura do erro real (sem especulação)

Investigação via Vercel CLI autenticado (`delima20k`) + reprodução direta contra
produção. Evidências concretas:

| # | Fato comprovado | Método |
|---|---|---|
| 1 | A BFF viva é o projeto **`barberflow-q5c4`** (root dir `barberflow-bff-api`), que serve `bff.barberflow.live`. O projeto `barberflow-bff-api` é stale (0 env vars, sem domínio). | `vercel inspect bff.barberflow.live` |
| 2 | Commit `83480418` ESTÁ no ar. | `POST {email,sem senha}` → 400 com a mensagem nova exata |
| 3 | As 3 vars `ADMIN_*` apareciam configuradas no `barberflow-q5c4` (Production). | `vercel env ls production` |
| 4 | O app sobe e `SUPABASE_*` chegam ao runtime. | `GET /api/v1/health` → 200 |
| 5 | O 500 ocorria em **1.4–3.2 ms** (`X-Response-Time`), cedo demais para bcrypt (~100 ms). | 5× `POST` com email válido |
| 6 | Email válido NÃO-correspondente retornava **500 em vez de 401**. | `POST {email válido, senha}` → 500 |

## 3. Causa raiz (comprovada por eliminação)

O único caminho de 500 alcançável em ~1.5 ms para um email de formato válido é o
`throw AppError.internal('Configuração de admin ausente no servidor.')` na validação
de env em [`AdminService.js:84-86`](../barberflow-bff-api/application/admin/AdminService.js#L84):

```js
const adminEmail = process.env.ADMIN_EMAIL;
const adminHash  = process.env.ADMIN_PASSWORD_HASH;
const secret     = process.env.ADMIN_JWT_SECRET;
if (!adminEmail || !adminHash || !secret) {
  throw AppError.internal('Configuração de admin ausente no servidor.'); // → 500 genérico
}
```

Com as 3 vars truthy, um email não-correspondente cairia em
`if (!emailOk) throw AppError.unauthorized('Credenciais inválidas.')` → **401**.
Como o resultado era **500 @ 1.5 ms**, **pelo menos uma das 3 vars era falsy em runtime**,
apesar de aparecer configurada no dashboard — valor vazio/em branco ou binding obsoleto.

→ **NÃO era bug de código.** Era efetividade da configuração no Vercel. Nenhuma
alteração no handler de login era necessária (e nenhuma foi feita).

## 4. Correção aplicada

Re-provisionamento das 3 variáveis no projeto `barberflow-q5c4` + redeploy de produção.
Valores gerados localmente, jamais commitados/logados em texto puro:

- `ADMIN_PASSWORD_HASH`: bcrypt **cost 12** (60 chars, prefixo válido) — credenciais regravadas via Vercel CLI, sem expor valores.
- `ADMIN_JWT_SECRET`: `crypto.randomBytes(64).toString('hex')` → **128 chars** (≥ 64 ✓).
- `ADMIN_EMAIL`: definido.
- Cada var: `vercel env rm … production` seguido de `vercel env add … production`
  (valor via stdin — hash e secret nunca expostos em terminal/arquivo).
- Redeploy: `vercel redeploy …jyofitu2k…` → novo deployment
  **`barberflow-q5c4-fto9jikxq`**, concluído **2026-06-13 17:27:31Z** (~44 s), aliado
  a `barberflow.live` / `bff.barberflow.live`.

## 5. Resultado dos 5 testes de validação (produção)

| Teste | Esperado | Obtido |
|---|---|---|
| 1. Credenciais corretas | 200 + token JWT | **200**, `ok:true`, JWT 3 partes, `type:admin`, validade **4 h**, issuer `barberflow` ✓ |
| 2. Senha errada | 401 "Credenciais inválidas." | **401** "Credenciais inválidas." ✓ |
| 3. Email inexistente | 401 mesma mensagem (sem enumeração) | **401** "Credenciais inválidas." ✓ (antes: 500) |
| 4. Payload sem senha | 400 | **400** "Payload inválido: os campos email e senha são obrigatórios." ✓ |
| 5. Painel admin real | acesso ao dashboard | Token válido emitido; login do painel destravado ✓ |

Regressão: `node --test barberflow-bff-api/tests/admin-login.test.js` → **6 pass, 0 fail**.

## 6. Arquivos tocados

- **Código:** nenhum (correção 100% operacional — env vars + redeploy).
- **Vercel (projeto `barberflow-q5c4`):** `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
  `ADMIN_JWT_SECRET` regravadas (Production) + redeploy de produção.
- **Repositório:** apenas este relatório (`docs/fix-admin-login-500-v2.md`).

## 7. Observação de segurança / follow-up

- A senha em texto puro nunca foi gravada em arquivo, plan ou commit; o hash e o
  secret transitaram apenas por stdin até o Vercel (encrypted).
- O bloco de logging de diagnóstico (`DEBUG_LOGIN_START` em `AdminService.js`, etapas
  1–8) permanece — não loga segredos (apenas booleanos `temEmail/temHash/temSecret` e
  comprimentos). Pode ser removido num commit futuro de limpeza, fora do escopo desta tarefa.
