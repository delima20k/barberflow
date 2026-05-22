# Release Readiness — BFF Canônica BarberFlow

> Documento de prontidão para produção. Todos os critérios abaixo devem estar ✅ antes de qualquer deploy em produção.

---

## 1. Status dos Testes

| Suite | Total | Passando | Pendente |
|---|---|---|---|
| Unit (`tests/*.test.js` + `tests/unit/`) | 96 | ✅ 96 | — |
| E2E (`tests/e2e/`) | 51 | ✅ 51 | — |
| Contract (`tests/contract/`) | 12 | ✅ 12 | — |
| **Total** | **159** | **✅ 159** | **—** |

### Cobertura estimada por domínio

- **Auth**: login, refresh, me, logout, guards JWT — cobertura via E2E + unit
- **Agendamentos**: listar, criar (RPC atômico), cancelar, validação de conflito — cobertura via E2E + unit
- **Chat**: listar mensagens, enviar, bloquear, silenciar, attachments — cobertura via E2E
- **Upload/Media**: presigned URL, confirmar, acesso, variantes, contextos válidos — cobertura via E2E + contract
- **Notificações**: push-barbeiro, health/live, health/ready — cobertura via E2E
- **Infraestrutura**: middlewares, CORS, rate-limit, error handler — cobertura via unit

### Executar todos os testes

```bash
# Unit
npm run test:unit

# E2E
npm run test:e2e

# Contract
npm run test:contract

# Todos
npm run test:all

# Cobertura (experimental)
npm run test:coverage
```

---

## 2. SLOs de Performance

Referência completa: [load-tests/SLO.md](../load-tests/SLO.md)

| Endpoint | p95 | Taxa de erro |
|---|---|---|
| `POST /api/auth/login` | < 800 ms | < 1% |
| `POST /api/agendamentos` | < 1000 ms | < 1% |
| `GET /api/agendamentos` | < 500 ms | < 1% |
| `GET /api/v1/chat/conversations/:id/messages` | < 400 ms | < 1% |
| `POST /api/v1/chat/conversations/:id/messages` | < 600 ms | < 1% |
| `POST /api/v1/media/presigned` | < 500 ms | < 1% |
| `GET /health/live` | < 100 ms | 0% |

### Executar load tests (requer k6)

```bash
k6 run load-tests/k6/auth.load.js -e BASE_URL=https://api.barberflow.app
k6 run load-tests/k6/agendamento.load.js -e BASE_URL=https://api.barberflow.app
k6 run load-tests/k6/chat.load.js -e BASE_URL=https://api.barberflow.app
```

---

## 3. Segurança

### Checklist de segurança

- [x] **Helmet.js** — headers de segurança HTTP (CSP, HSTS, X-Frame-Options)
- [x] **Rate limiting** — `express-rate-limit` configurado por rota
- [x] **JWT HS256** — tokens validados em todos os endpoints protegidos
- [x] **CORS** — lista branca de origens configurada via env
- [x] **Sanitização de inputs** — validadores em `validators/` com Joi/Zod
- [x] **SQL injection** — uso exclusivo de Supabase client (parameterized queries)
- [x] **npm audit** — 0 vulnerabilidades (verificado em 2025)
- [x] **eslint-plugin-security** — 12 regras OWASP ativas (ver `eslint.config.js`)
- [x] **Dependabot** — atualizações automáticas semanais (ver `.github/dependabot.yml`)
- [x] **Secrets** — nenhuma credencial em código; uso de variáveis de ambiente

### Variáveis de ambiente obrigatórias em produção

```
SUPA_URL=
SUPA_SERVICE_KEY=
SUPA_SECRET=
JWT_SECRET=
REDIS_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
ALLOWED_ORIGINS=
NODE_ENV=production
```

---

## 4. CI/CD

Pipeline completo: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

| Job | Descrição | Ordem |
|---|---|---|
| `lint` | ESLint + eslint-security | 1 |
| `unit-test` | 96 testes unitários | 2 |
| `e2e-test` | 51 testes E2E | 3 (paralelo) |
| `contract-test` | 12 testes de contrato | 3 (paralelo) |
| `security` | npm audit + eslint-security | 3 (paralelo) |
| `build` | Validação de módulos | 4 |

---

## 5. Checklist Pré-Deploy

```bash
# Executar verificação automática
npm run predeploy
```

O script `scripts/pre-deploy.js` verifica:

- [ ] Todas as variáveis de ambiente obrigatórias presentes
- [ ] Node.js ≥ 18
- [ ] `npm audit` sem vulnerabilidades críticas/altas
- [ ] Módulo principal carrega sem erros
- [ ] `/health/live` responde HTTP 200
- [ ] Migrations pendentes aplicadas

---

## 6. Procedimento de Rollback

Referência completa: [docs/rollback.md](rollback.md)

**Resumo rápido:**

```bash
# Rollback via Vercel CLI
vercel rollback --token $VERCEL_TOKEN

# Rollback via git
git revert HEAD --no-edit
git push origin main
```

Gatilhos para rollback imediato:
- Taxa de erro HTTP > 5% por mais de 2 minutos
- p95 > 3× o SLO definido
- Falhas no `/health/ready`
- Erro crítico reportado por usuários

---

## 7. Mutation Testing

Configuração: [stryker.config.mjs](../stryker.config.mjs)

| Threshold | Valor |
|---|---|
| High | ≥ 80% |
| Low | ≥ 60% |
| Break (bloqueia CI) | < 50% |

```bash
# Executar mutation testing (demora ~5–10 min)
npm run test:mutation
```

---

## 8. Limitações Conhecidas / Tech Debt

| Item | Severidade | Plano |
|---|---|---|
| Cobertura de mutation não medida em produção ainda | Média | Executar no próximo sprint |
| Load tests k6 requerem k6 instalado separadamente | Baixa | Adicionar ao Dockerfile |
| `test:coverage` usa flag experimental do Node | Baixa | Monitorar estabilidade |
| Workers BullMQ não têm testes E2E dedicados | Média | Próximo sprint |
| Feed endpoint não tem contrato formal | Baixa | Adicionar em `schemas.js` |

---

## 9. Critérios de Sign-off para Produção

Todos os itens abaixo devem ser ✅:

- [ ] CI pipeline verde (todos os jobs passando)
- [ ] `npm run predeploy` retorna exit 0
- [ ] Load test smoke (1 VU) passou nos 3 cenários
- [ ] `npm audit` sem vulnerabilidades altas/críticas
- [ ] Variáveis de ambiente de produção configuradas
- [ ] Migrations aplicadas no banco de produção
- [ ] Rollback testado no ambiente de staging
- [ ] Revisão de código por pelo menos 1 desenvolvedor

---

*Última atualização: 2025 — BFF Canônica v1.0.0*
