# Skill Mapping — Mapeamento de Intenções para Skills

> **Leia este arquivo SEMPRE que receber um prompt.**
> Identifique a intenção do usuário pelas palavras-chave e carregue as skills correspondentes
> antes de executar qualquer tarefa.
> Referência completa: `skill-index.md`

---

## Como Usar

1. Leia o prompt do usuário
2. Identifique as palavras-chave na tabela abaixo
3. Carregue as skills de segurança listadas (pasta `skills/<dominio>/`)
4. Execute a tarefa usando as skills como guia junto com as skills do projeto (`skill-01` a `skill-09`)

---

## Mapeamento de Intenções → Skills

---

### BFF / API / Endpoints

**Palavras-chave:** BFF, API, endpoint, rota, route, request, response, REST, GraphQL, gRPC, webhook, middleware, controller, handler, CORS, rate limit, throttle, payload, schema

**Skills de segurança obrigatórias:**
- `skills/api-security/conducting-api-security-testing/`
- `skills/api-security/implementing-api-gateway-security-controls/`
- `skills/api-security/implementing-api-rate-limiting-and-throttling/`
- `skills/api-security/implementing-api-schema-validation-security/`
- `skills/identity-and-access-management/implementing-jwt-signing-and-verification/`
- `skills/identity-and-access-management/testing-jwt-token-security/`

**Skills do projeto obrigatórias:** `skill-03-backend.md` + `skill-04-seguranca.md`

**Acao:** Valide schema, rate limiting e JWT antes de qualquer implementação de endpoint.

---

### Refatoração / Código

**Palavras-chave:** refatorar, refactoring, melhorar código, otimizar, limpar código, clean code, OOP, classe, modularizar, arquitetura, design pattern, SOLID, DRY, acoplamento, coesão, separação de responsabilidades

**Skills de segurança obrigatórias:**
- `skills/web-application-security/performing-cryptographic-audit-of-application/`
- `skills/web-application-security/performing-security-headers-audit/`
- `skills/code-quality/implementing-semgrep-for-custom-sast-rules/`
- `skills/code-quality/integrating-sast-into-github-actions-pipeline/`
- `skills/code-quality/performing-threat-modeling-with-owasp-threat-dragon/`
- `skills/devsecops/implementing-github-advanced-security-for-code-scanning/`

**Skills do projeto obrigatórias:** `skill-09-refatoracao.md` + `skill-01-base.md`

**Acao:** Analise o código com SAST antes de refatorar. Garanta que nenhuma refatoração introduza vulnerabilidade. Consulte CLASS_REGISTRY.md.

---

### Segurança

**Palavras-chave:** segurança, security, vulnerabilidade, vulnerability, ataque, attack, proteção, brecha, CVE, OWASP, pentest, auditoria, hardening, XSS, CSRF, SQLi, injeção, injection, autorização, autenticação

**Skills de segurança obrigatórias:**
- `skills/api-security/testing-api-security-with-owasp-top-10/`
- `skills/web-application-security/performing-web-application-penetration-test/`
- `skills/security-operations/implementing-siem-use-cases-for-detection/`
- `skills/cloud-security/implementing-cloud-security-posture-management/`
- `skills/identity-and-access-management/detecting-anomalous-authentication-patterns/`

**Skills do projeto obrigatórias:** `skill-04-seguranca.md`

**Acao:** Rode análise de segurança completa antes de qualquer mudança em endpoints ou autenticação.

---

### Testes

**Palavras-chave:** teste, test, testar, validar, verificar, TDD, unit test, integration test, mock, spy, assert, cobertura, coverage, red-green-refactor, edge case, node:test

**Skills de segurança obrigatórias:**
- `skills/code-quality/implementing-semgrep-for-custom-sast-rules/`
- `skills/code-quality/integrating-dast-with-owasp-zap-in-pipeline/`
- `skills/code-quality/performing-fuzzing-with-aflplusplus/`
- `skills/web-application-security/performing-web-application-vulnerability-triage/`
- `skills/devsecops/performing-sca-dependency-scanning-with-snyk/`

**Skills do projeto obrigatórias:** `skill-07-testes.md` + `skill-01-base.md`

**Acao:** Use fuzzing e SAST para cobrir edge cases de segurança. Nunca commite com testes falhando.

---

### Escalabilidade

**Palavras-chave:** escalar, escalabilidade, escale, scale, performance, milhares de usuários, carga, load, throughput, latência, latency, bottleneck, concurrent, concorrência, filas, queue, cache, Redis, N+1

**Skills de segurança obrigatórias:**
- `skills/code-quality/implementing-pci-dss-compliance-controls/`
- `skills/cloud-security/securing-kubernetes-on-cloud/`
- `skills/cloud-security/implementing-zero-trust-network-access/`
- `skills/devsecops/building-devsecops-pipeline-with-gitlab-ci/`
- `skills/security-operations/implementing-network-traffic-baselining/`

**Skills do projeto obrigatórias:** `skill-08-performance.md` + `skill-03-backend.md`

**Acao:** Valide segurança de infra antes de escalar. Cache e filas não devem expor dados sensíveis.

---

### GPS / Geolocalização

**Palavras-chave:** GPS, geolocalização, localização, location, maps, mapa, coordenadas, lat, lng, PostGIS, ST_DWithin, nearby, proximidade, raio, radius

**Skills de segurança obrigatórias:**
- `skills/api-security/implementing-api-schema-validation-security/`
- `skills/api-security/exploiting-server-side-request-forgery/`
- `skills/security-operations/detecting-insider-data-exfiltration-via-dlp/`
- `skills/identity-and-access-management/detecting-anomalous-authentication-patterns/`

**Skills do projeto obrigatórias:** `skill-05-banco.md` + `skill-04-seguranca.md`

**Acao:** Valide coordenadas como inputs de boundary (lat -90 a 90, lng -180 a 180). Nunca exponha localização sem RLS.

---

### Deploy / Pipeline

**Palavras-chave:** deploy, pipeline, CI/CD, subir código, produção, prod, staging, migration, supabase push, vercel, build, artifact, release, container, Docker, Kubernetes

**Skills de segurança obrigatórias:**
- `skills/devsecops/building-devsecops-pipeline-with-gitlab-ci/`
- `skills/devsecops/implementing-secrets-scanning-in-ci-cd/`
- `skills/devsecops/implementing-secret-scanning-with-gitleaks/`
- `skills/cloud-security/securing-github-actions-workflows/`
- `skills/devsecops/scanning-containers-with-trivy-in-cicd/`
- `skills/devsecops/implementing-supply-chain-security-with-in-toto/`

**Skills do projeto obrigatórias:** `skill-09-refatoracao.md`

**Acao:** Nunca faça deploy sem secrets scan. Valide migrations antes do push. Rode testes com 0 falhas.

---

### Incidente / Erro Crítico

**Palavras-chave:** incidente, incident, erro crítico, brecha, breach, vazamento, leak, ataque detectado, comprometido, compromised, ransomware, DDoS, exfiltração

**Skills de segurança obrigatórias:**
- `skills/incident-response/containing-active-breach/`
- `skills/incident-response/conducting-phishing-incident-response/`
- `skills/incident-response/triaging-security-incident-with-ir-playbook/`
- `skills/threat-intelligence/analyzing-indicators-of-compromise/`
- `skills/threat-intelligence/collecting-indicators-of-compromise/`
- `skills/security-operations/triaging-security-incident/`

**Skills do projeto obrigatórias:** `skill-04-seguranca.md`

**Acao:** Contenha primeiro, analise depois. Siga o playbook. Não delete evidências.

---

### IA / Modelos

**Palavras-chave:** IA, AI, modelo, model, Claude, ChatGPT, OpenAI, Anthropic, prompt, LLM, embedding, fine-tuning, RAG, vector, inteligência artificial, machine learning

**Skills de segurança obrigatórias:**
- `skills/ai-security/detecting-ai-model-prompt-injection-attacks/`
- `skills/ai-security/implementing-llm-guardrails-for-security/`
- `skills/ai-security/detecting-business-email-compromise-with-ai/`
- `skills/security-operations/detecting-insider-threat-with-ueba/`
- `skills/api-security/implementing-api-schema-validation-security/`

**Skills do projeto obrigatórias:** `skill-04-seguranca.md` + `skill-03-backend.md`

**Acao:** Implemente guardrails antes de integrar qualquer LLM. Valide outputs antes de renderizar no frontend.

---

## Tabela de Referência Rápida

| Intenção | Domínios de skill | Skills do projeto |
|---|---|---|
| BFF / API / Endpoints | `api-security` + `identity-and-access-management` | `skill-03` + `skill-04` |
| Refatoração / Código | `web-application-security` + `code-quality` + `devsecops` | `skill-09` + `skill-01` |
| Segurança geral | `api-security` + `security-operations` + `cloud-security` | `skill-04` |
| Testes | `code-quality` + `web-application-security` + `devsecops` | `skill-07` + `skill-01` |
| Escalabilidade | `code-quality` + `cloud-security` + `devsecops` | `skill-08` + `skill-03` |
| GPS / Geolocalização | `api-security` + `security-operations` | `skill-05` + `skill-04` |
| Deploy / Pipeline | `devsecops` + `cloud-security` | `skill-09` |
| Incidente / Erro crítico | `incident-response` + `threat-intelligence` | `skill-04` |
| IA / Modelos | `ai-security` + `security-operations` | `skill-04` + `skill-03` |
| Banco / Migrations | `devsecops` + `cloud-security` | `skill-05` + `skill-07` |
| Mensagens / Chat / P2P | `api-security` + `identity-and-access-management` | `skill-06` + `skill-04` |
| Autenticação / JWT | `identity-and-access-management` | `skill-04` + `skill-03` |

---

## Referências

- `skill-index.md` — índice completo com todas as 565 skills
- `skill.md` — regras globais do agente DELIMA
- `skills/` — pasta com todos os domínios de segurança
