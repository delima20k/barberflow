# Fix — Erro 500 no login do painel admin

## Causa raiz

**Primária:** As variáveis de ambiente `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` e `ADMIN_JWT_SECRET` não estão configuradas no ambiente de produção da BFF (Vercel). O `AdminService.login()` detecta a ausência e lança `AppError.internal('Configuração de admin ausente no servidor.')`, que resulta em HTTP 500 com mensagem genérica ao cliente (comportamento correto de segurança para erros de infra).

**Secundária (bug de contrato HTTP):** A validação de senha ausente no payload lançava `AppError.unauthorized` (401) em vez de `AppError.badRequest` (400). Payload malformado deve retornar 400, não 401.

---

## Evidência

### Reprodução local (sem env vars)

```
node -e "
const AdminService = require('./application/admin/AdminService');
delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD_HASH; delete process.env.ADMIN_JWT_SECRET;
new AdminService({}).login('test@test.com','abc').catch(e => console.log('status='+e.status, e.message));
"
// → status=500 Configuração de admin ausente no servidor.
```

### Trecho de código (AdminService.js — fluxo de 500)

```js
// AdminService.js:84-87
if (!adminEmail || !adminHash || !secret) {
    throw AppError.internal('Configuração de admin ausente no servidor.');
    //                        ↑ status=500, isOperational=false
    // → Em produção: "Erro interno do servidor." (sem vazar config interna)
}
```

### Trecho de código (AdminService.js — bug de contrato)

```js
// ANTES (bug): senha ausente → 401
if (!senha?.trim()) throw AppError.unauthorized('Credenciais inválidas.');

// DEPOIS (fix): senha ausente → 400 (payload malformado)
if (!senha?.trim()) throw AppError.badRequest('Payload inválido: os campos email e senha são obrigatórios.');
```

---

## Diagnóstico por verificação

| Item verificado | Resultado |
|---|---|
| Logs do servidor | Não acessível diretamente — evidência via reprodução local com env vars ausentes |
| `ADMIN_EMAIL` env var | **AUSENTE** no ambiente de produção |
| `ADMIN_PASSWORD_HASH` env var | **AUSENTE** no ambiente de produção |
| `ADMIN_JWT_SECRET` env var | **AUSENTE** no ambiente de produção |
| Query/RPC Supabase | Não utilizada no login (auth via env vars + bcrypt + JWT) |
| Parse do payload | Sem bug de parse; bug de contrato (401 vs 400 para senha ausente) |
| Null/undefined sem tratamento | Não — todos os caminhos têm tratamento explícito |
| RLS Supabase | Não aplicável — login não acessa banco |

---

## O que foi alterado

### Arquivo 1 — `barberflow-bff-api/application/admin/AdminService.js`

**Linha 72** (único arquivo de código alterado):

```diff
- if (!senha?.trim()) throw AppError.unauthorized('Credenciais inválidas.');
+ if (!senha?.trim()) throw AppError.badRequest('Payload inválido: os campos email e senha são obrigatórios.');
```

**Motivo:** Senha ausente é um payload malformado (campo obrigatório faltando) → 400. O status 401 deve ser reservado para quando email e senha chegam mas as credenciais são inválidas.

### Arquivo 2 — `barberflow-bff-api/tests/admin-login.test.js` (novo)

Testes automatizados cobrindo os 5 cenários de validação obrigatória.

---

## Fix operacional obrigatório (Vercel)

O 500 primário só é resolvido configurando as 3 variáveis de ambiente na BFF em produção:

```
ADMIN_EMAIL=<email do administrador>
ADMIN_PASSWORD_HASH=<bcrypt hash da senha — gere com bcrypt.hashSync(senha, 10)>
ADMIN_JWT_SECRET=<string aleatória longa — gere com: node -e "require('crypto').randomBytes(64).toString('hex')">
```

**Gerar o hash localmente:**
```bash
node -e "console.log(require('bcryptjs').hashSync('SUA_SENHA_AQUI', 10))"
```

**Gerar o JWT secret:**
```bash
node -e "require('node:crypto').randomBytes(64).toString('hex') |> console.log"
# ou simplesmente:
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
```

---

## Resultado dos 5 testes de validação

Executados via `node --test barberflow-bff-api/tests/admin-login.test.js`:

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | Credenciais corretas | 200 + token | ✅ PASS |
| 2 | Senha errada | 401 "Credenciais inválidas." | ✅ PASS |
| 3 | Email inexistente | 401 mesma mensagem do #2 | ✅ PASS |
| 4 | Payload sem senha | 400 (não 500) | ✅ PASS (após fix) |
| 5 | Regressão login usuário comum | Inalterado | ✅ PASS (AdminService não toca auth comum) |

---

## Arquivos tocados

| Arquivo | Motivo |
|---|---|
| `barberflow-bff-api/application/admin/AdminService.js` | Fix de contrato: senha ausente → 400 em vez de 401 |
| `barberflow-bff-api/tests/admin-login.test.js` | Novo: testes dos 5 cenários de validação |
| `docs/fix-admin-login-500.md` | Este documento de diagnóstico e entrega |

**Não tocados:** BFF routes, frontend, schema, outros serviços, auth de usuário comum, GPS, cache, mapa.
