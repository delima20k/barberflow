# SKILL INDEX — AGENTE DELIMA

> Indice geral — skills do projeto BarberFlow + biblioteca de seguranca.
> **Ultima atualizacao:** 2026-05-31 | **565 skills de seguranca** + **9 skills do projeto**
> Leia **skill-mapping.md** para mapear intencoes a skills antes de qualquer tarefa.

---

## Tabela de Conteudo

### Skills do Projeto (Arquitetura BarberFlow)
- [Skill 01 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 02 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 03 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 04 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 05 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 06 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 07 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 08 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)
- [Skill 09 — ver tabela abaixo](#skills-do-projeto-arquitetura-barberflow-1)

### Skills de Seguranca e Qualidade (Biblioteca)
- [API Security](#api-security)
- [Web Application Security (Secure Code Review)](#web-application-security)
- [Identity & Access Management (JWT Security)](#identity-and-access-management)
- [DevSecOps](#devsecops)
- [Security Operations (Threat Detection)](#security-operations)
- [Cloud Security](#cloud-security)
- [Incident Response](#incident-response)
- [Threat Intelligence](#threat-intelligence)
- [AI Security](#ai-security)
- [Code Quality (Refactoring, Architecture, Testing)](#code-quality)

---

## Skills do Projeto (Arquitetura BarberFlow)

| # | Arquivo | Responsabilidade | Quando usar |
|---|---|---|---|
| 01 | [`skills/skill-01-base.md`](skills/skill-01-base.md) | Identidade, SOLID, Design Patterns, arquitetura, fallback | Qualquer tarefa — ler sempre como base |
| 02 | [`skills/skill-02-frontend.md`](skills/skill-02-frontend.md) | Router, animacoes, navegacao, CSS, cards, componentes UI | Telas, layout, animacoes, UI, modal |
| 03 | [`skills/skill-03-backend.md`](skills/skill-03-backend.md) | Services, controllers, repositories, BFF, APIs | Backend, BFF, rotas, controllers, services |
| 04 | [`skills/skill-04-seguranca.md`](skills/skill-04-seguranca.md) | OWASP, JWT, CSP, autenticacao, criptografia | Seguranca, auth, tokens, headers, inputs |
| 05 | [`skills/skill-05-banco.md`](skills/skill-05-banco.md) | Supabase, PostgreSQL, RLS, migrations, storage | Banco, queries, migrations, storage |
| 06 | [`skills/skill-06-p2p-mensagens.md`](skills/skill-06-p2p-mensagens.md) | WebRTC, P2P, chat BFF, E2E, MediaP2P | Mensagens, chat, video, midia P2P |
| 07 | [`skills/skill-07-testes.md`](skills/skill-07-testes.md) | TDD, node:test, red-green-refactor, cobertura | Testes, TDD, validacoes, edge cases |
| 08 | [`skills/skill-08-performance.md`](skills/skill-08-performance.md) | Cache, paginacao, custo, debounce, N+1 | Performance, otimizacao, custo de infra |
| 09 | [`skills/skill-09-refatoracao.md`](skills/skill-09-refatoracao.md) | Escopo, checklist, check final, commit | Refatoracao, revisao final, limpeza |

---

## Mapa Rapido por Tipo de Tarefa (Projeto)

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Qualquer tarefa (base obrigatoria) | `skill-01-base.md` |
| Nova funcionalidade completa | `skill-01-base.md`, `skill-07-testes.md`, `skill-09-refatoracao.md` |
| Front-end / nova tela / layout / CSS | `skill-02-frontend.md` |
| Backend / BFF / services / controllers / rotas | `skill-03-backend.md` |
| Seguranca / OWASP / autenticacao / JWT | `skill-04-seguranca.md` |
| Banco / queries / migrations / storage / Supabase | `skill-05-banco.md` |
| Mensagens / chat / WebRTC / P2P / criptografia E2E | `skill-06-p2p-mensagens.md` |
| Testes / TDD / validacoes / edge cases | `skill-07-testes.md` |
| Performance / cache / custo / paginacao | `skill-08-performance.md` |
| Refatoracao / revisao / check final / commit | `skill-09-refatoracao.md` |
| **Mapeamento por intencao de usuario** | **Ver `skill-mapping.md`** |

---

## Skills de Seguranca e Qualidade (Biblioteca)

> **Fonte:** `.claude/skills/` copiadas para `.github/agents/workflows/skills/<dominio>/`
> **Estrutura:** `SKILL.md` + `references/` + `scripts/` + `LICENSE`

---

## API Security

**Pasta:** `skills/api-security/` | **Total:** 38 skills
**Quando usar:** BFF, endpoints, REST, GraphQL, rate limiting, validacao de entrada, OWASP API Top 10

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `analyzing-api-gateway-access-logs` | [`SKILL.md`](skills/api-security/analyzing-api-gateway-access-logs/SKILL.md) | - | Parses API Gateway access logs (AWS API Gateway, Kong, Nginx) to detect BOLA/IDOR ... |
| 2 | `conducting-api-security-testing` | [`SKILL.md`](skills/api-security/conducting-api-security-testing/SKILL.md) | L47 | Conducts security testing of REST, GraphQL, and gRPC APIs to identify vulnerabilit... |
| 3 | `detecting-api-enumeration-attacks` | [`SKILL.md`](skills/api-security/detecting-api-enumeration-attacks/SKILL.md) | - | Detect and prevent API enumeration attacks including BOLA and IDOR exploitation by... |
| 4 | `detecting-broken-object-property-level-authorization` | [`SKILL.md`](skills/api-security/detecting-broken-object-property-level-authorization/SKILL.md) | - | Detect and test for OWASP API3:2023 Broken Object Property Level Authorization vul... |
| 5 | `detecting-shadow-api-endpoints` | [`SKILL.md`](skills/api-security/detecting-shadow-api-endpoints/SKILL.md) | - | Discover and inventory shadow API endpoints that operate outside documented specif... |
| 6 | `detecting-sql-injection-via-waf-logs` | [`SKILL.md`](skills/api-security/detecting-sql-injection-via-waf-logs/SKILL.md) | - | Analyze WAF (ModSecurity/AWS WAF/Cloudflare) logs to detect SQL injection attack c... |
| 7 | `exploiting-api-injection-vulnerabilities` | [`SKILL.md`](skills/api-security/exploiting-api-injection-vulnerabilities/SKILL.md) | L53 | Tests APIs for injection vulnerabilities including SQL injection, NoSQL injection,... |
| 8 | `exploiting-broken-function-level-authorization` | [`SKILL.md`](skills/api-security/exploiting-broken-function-level-authorization/SKILL.md) | L49 | Tests APIs for Broken Function Level Authorization (BFLA) vulnerabilities where re... |
| 9 | `exploiting-excessive-data-exposure-in-api` | [`SKILL.md`](skills/api-security/exploiting-excessive-data-exposure-in-api/SKILL.md) | L51 | Tests APIs for excessive data exposure where endpoints return more data than the c... |
| 10 | `exploiting-http-request-smuggling` | [`SKILL.md`](skills/api-security/exploiting-http-request-smuggling/SKILL.md) | L43 | Detecting and exploiting HTTP request smuggling vulnerabilities caused by Content-... |
| 11 | `exploiting-mass-assignment-in-rest-apis` | [`SKILL.md`](skills/api-security/exploiting-mass-assignment-in-rest-apis/SKILL.md) | L45 | Discover and exploit mass assignment vulnerabilities in REST APIs to escalate priv... |
| 12 | `exploiting-nosql-injection-vulnerabilities` | [`SKILL.md`](skills/api-security/exploiting-nosql-injection-vulnerabilities/SKILL.md) | L42 | Detect and exploit NoSQL injection vulnerabilities in MongoDB, CouchDB, and other ... |
| 13 | `exploiting-sql-injection-vulnerabilities` | [`SKILL.md`](skills/api-security/exploiting-sql-injection-vulnerabilities/SKILL.md) | L47 | Identifies and exploits SQL injection vulnerabilities in web applications during a... |
| 14 | `exploiting-sql-injection-with-sqlmap` | [`SKILL.md`](skills/api-security/exploiting-sql-injection-with-sqlmap/SKILL.md) | L43 | Detecting and exploiting SQL injection vulnerabilities using sqlmap to extract dat... |
| 15 | `exploiting-websocket-vulnerabilities` | [`SKILL.md`](skills/api-security/exploiting-websocket-vulnerabilities/SKILL.md) | L43 | Testing WebSocket implementations for authentication bypass, cross-site hijacking,... |
| 16 | `implementing-api-abuse-detection-with-rate-limiting` | [`SKILL.md`](skills/api-security/implementing-api-abuse-detection-with-rate-limiting/SKILL.md) | - | Implement API abuse detection using token bucket, sliding window, and adaptive rat... |
| 17 | `implementing-api-gateway-security-controls` | [`SKILL.md`](skills/api-security/implementing-api-gateway-security-controls/SKILL.md) | L49 | Implements security controls at the API gateway layer including authentication enf... |
| 18 | `implementing-api-key-security-controls` | [`SKILL.md`](skills/api-security/implementing-api-key-security-controls/SKILL.md) | L55 | Implements secure API key generation, storage, rotation, and revocation controls t... |
| 19 | `implementing-api-rate-limiting-and-throttling` | [`SKILL.md`](skills/api-security/implementing-api-rate-limiting-and-throttling/SKILL.md) | L48 | Implements API rate limiting and throttling controls using token bucket, sliding w... |
| 20 | `implementing-api-schema-validation-security` | [`SKILL.md`](skills/api-security/implementing-api-schema-validation-security/SKILL.md) | - | Implement API schema validation using OpenAPI specifications and JSON Schema to en... |
| 21 | `implementing-api-security-posture-management` | [`SKILL.md`](skills/api-security/implementing-api-security-posture-management/SKILL.md) | - | Implement API Security Posture Management to continuously discover, classify, and ... |
| 22 | `implementing-api-security-testing-with-42crunch` | [`SKILL.md`](skills/api-security/implementing-api-security-testing-with-42crunch/SKILL.md) | - | Implement comprehensive API security testing using the 42Crunch platform to perfor... |
| 23 | `implementing-api-threat-protection-with-apigee` | [`SKILL.md`](skills/api-security/implementing-api-threat-protection-with-apigee/SKILL.md) | - | Implement API threat protection using Google Apigee policies including JSON/XML th... |
| 24 | `performing-api-fuzzing-with-restler` | [`SKILL.md`](skills/api-security/performing-api-fuzzing-with-restler/SKILL.md) | L49 | Uses Microsoft RESTler to perform stateful REST API fuzzing by automatically gener... |
| 25 | `performing-api-inventory-and-discovery` | [`SKILL.md`](skills/api-security/performing-api-inventory-and-discovery/SKILL.md) | L49 | Performs API inventory and discovery to identify all API endpoints in an organizat... |
| 26 | `performing-api-rate-limiting-bypass` | [`SKILL.md`](skills/api-security/performing-api-rate-limiting-bypass/SKILL.md) | L49 | Tests API rate limiting implementations for bypass vulnerabilities by manipulating... |
| 27 | `performing-api-security-testing-with-postman` | [`SKILL.md`](skills/api-security/performing-api-security-testing-with-postman/SKILL.md) | L48 | Uses Postman to perform structured API security testing by building collections th... |
| 28 | `performing-graphql-depth-limit-attack` | [`SKILL.md`](skills/api-security/performing-graphql-depth-limit-attack/SKILL.md) | - | Execute and test GraphQL depth limit attacks using deeply nested recursive queries... |
| 29 | `performing-graphql-introspection-attack` | [`SKILL.md`](skills/api-security/performing-graphql-introspection-attack/SKILL.md) | L51 | Performs GraphQL introspection attacks to extract the full API schema including ty... |
| 30 | `performing-graphql-security-assessment` | [`SKILL.md`](skills/api-security/performing-graphql-security-assessment/SKILL.md) | L44 | Assessing GraphQL API endpoints for introspection leaks, injection attacks, author... |
| 31 | `performing-soap-web-service-security-testing` | [`SKILL.md`](skills/api-security/performing-soap-web-service-security-testing/SKILL.md) | - | Perform security testing of SOAP web services by analyzing WSDL definitions and te... |
| 32 | `securing-api-gateway-with-aws-waf` | [`SKILL.md`](skills/api-security/securing-api-gateway-with-aws-waf/SKILL.md) | L48 | Securing API Gateway endpoints with AWS WAF by configuring managed rule groups for... |
| 33 | `testing-api-authentication-weaknesses` | [`SKILL.md`](skills/api-security/testing-api-authentication-weaknesses/SKILL.md) | L49 | Tests API authentication mechanisms for weaknesses including broken token validati... |
| 34 | `testing-api-for-broken-object-level-authorization` | [`SKILL.md`](skills/api-security/testing-api-for-broken-object-level-authorization/SKILL.md) | L51 | Tests REST and GraphQL APIs for Broken Object Level Authorization (BOLA/IDOR) vuln... |
| 35 | `testing-api-for-mass-assignment-vulnerability` | [`SKILL.md`](skills/api-security/testing-api-for-mass-assignment-vulnerability/SKILL.md) | L48 | Tests APIs for mass assignment (auto-binding) vulnerabilities where clients can mo... |
| 36 | `testing-api-security-with-owasp-top-10` | [`SKILL.md`](skills/api-security/testing-api-security-with-owasp-top-10/SKILL.md) | L45 | Systematically assessing REST and GraphQL API endpoints against the OWASP API Secu... |
| 37 | `testing-mobile-api-authentication` | [`SKILL.md`](skills/api-security/testing-mobile-api-authentication/SKILL.md) | L48 | Tests authentication and authorization mechanisms in mobile application APIs to id... |
| 38 | `testing-websocket-api-security` | [`SKILL.md`](skills/api-security/testing-websocket-api-security/SKILL.md) | L50 | Tests WebSocket API implementations for security vulnerabilities including missing... |

---

## Web Application Security (Secure Code Review)

**Pasta:** `skills/web-application-security/` | **Total:** 46 skills
**Quando usar:** XSS, CSRF, SSRF, injecoes, revisao de codigo seguro, OWASP Web Top 10

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `analyzing-heap-spray-exploitation` | [`SKILL.md`](skills/web-application-security/analyzing-heap-spray-exploitation/SKILL.md) | - | Detect and analyze heap spray attacks in memory dumps using Volatility3 plugins to... |
| 2 | `bypassing-authentication-with-forced-browsing` | [`SKILL.md`](skills/web-application-security/bypassing-authentication-with-forced-browsing/SKILL.md) | L43 | Discovering and accessing unprotected pages, APIs, and administrative interfaces b... |
| 3 | `deobfuscating-javascript-malware` | [`SKILL.md`](skills/web-application-security/deobfuscating-javascript-malware/SKILL.md) | L48 | Deobfuscates malicious JavaScript code used in web-based attacks, phishing pages, ... |
| 4 | `exploiting-broken-link-hijacking` | [`SKILL.md`](skills/web-application-security/exploiting-broken-link-hijacking/SKILL.md) | L45 | Discover and exploit broken link hijacking vulnerabilities by identifying referenc... |
| 5 | `exploiting-deeplink-vulnerabilities` | [`SKILL.md`](skills/web-application-security/exploiting-deeplink-vulnerabilities/SKILL.md) | L47 | Tests and exploits deep link (URL scheme and App Link) vulnerabilities in Android ... |
| 6 | `exploiting-idor-vulnerabilities` | [`SKILL.md`](skills/web-application-security/exploiting-idor-vulnerabilities/SKILL.md) | L43 | Identifying and exploiting Insecure Direct Object Reference vulnerabilities to acc... |
| 7 | `exploiting-insecure-deserialization` | [`SKILL.md`](skills/web-application-security/exploiting-insecure-deserialization/SKILL.md) | L44 | Identifying and exploiting insecure deserialization vulnerabilities in Java, PHP, ... |
| 8 | `exploiting-prototype-pollution-in-javascript` | [`SKILL.md`](skills/web-application-security/exploiting-prototype-pollution-in-javascript/SKILL.md) | L46 | Detect and exploit JavaScript prototype pollution vulnerabilities on both client-s... |
| 9 | `exploiting-race-condition-vulnerabilities` | [`SKILL.md`](skills/web-application-security/exploiting-race-condition-vulnerabilities/SKILL.md) | L45 | Detect and exploit race condition vulnerabilities in web applications using Turbo ... |
| 10 | `exploiting-server-side-request-forgery` | [`SKILL.md`](skills/web-application-security/exploiting-server-side-request-forgery/SKILL.md) | L43 | Identifying and exploiting SSRF vulnerabilities to access internal services, cloud... |
| 11 | `exploiting-template-injection-vulnerabilities` | [`SKILL.md`](skills/web-application-security/exploiting-template-injection-vulnerabilities/SKILL.md) | L43 | Detecting and exploiting Server-Side Template Injection (SSTI) vulnerabilities acr... |
| 12 | `exploiting-type-juggling-vulnerabilities` | [`SKILL.md`](skills/web-application-security/exploiting-type-juggling-vulnerabilities/SKILL.md) | L45 | Exploit PHP type juggling vulnerabilities caused by loose comparison operators to ... |
| 13 | `implementing-cloud-waf-rules` | [`SKILL.md`](skills/web-application-security/implementing-cloud-waf-rules/SKILL.md) | L47 | This skill covers deploying and tuning Web Application Firewall rules on AWS WAF, ... |
| 14 | `implementing-runtime-application-self-protection` | [`SKILL.md`](skills/web-application-security/implementing-runtime-application-self-protection/SKILL.md) | - | Deploy Runtime Application Self-Protection (RASP) agents to detect and block attac... |
| 15 | `implementing-web-application-logging-with-modsecurity` | [`SKILL.md`](skills/web-application-security/implementing-web-application-logging-with-modsecurity/SKILL.md) | - | Configure ModSecurity WAF with OWASP Core Rule Set (CRS) for web application loggi... |
| 16 | `intercepting-mobile-traffic-with-burpsuite` | [`SKILL.md`](skills/web-application-security/intercepting-mobile-traffic-with-burpsuite/SKILL.md) | L48 | Intercepts and analyzes HTTP/HTTPS traffic from mobile applications using Burp Sui... |
| 17 | `performing-blind-ssrf-exploitation` | [`SKILL.md`](skills/web-application-security/performing-blind-ssrf-exploitation/SKILL.md) | L42 | Detect and exploit blind Server-Side Request Forgery vulnerabilities using out-of-... |
| 18 | `performing-clickjacking-attack-test` | [`SKILL.md`](skills/web-application-security/performing-clickjacking-attack-test/SKILL.md) | L52 | Testing web applications for clickjacking vulnerabilities by assessing frame embed... |
| 19 | `performing-content-security-policy-bypass` | [`SKILL.md`](skills/web-application-security/performing-content-security-policy-bypass/SKILL.md) | L42 | Analyze and bypass Content Security Policy implementations to achieve cross-site s... |
| 20 | `performing-cryptographic-audit-of-application` | [`SKILL.md`](skills/web-application-security/performing-cryptographic-audit-of-application/SKILL.md) | - | A cryptographic audit systematically reviews an application's use of cryptographic... |
| 21 | `performing-csrf-attack-simulation` | [`SKILL.md`](skills/web-application-security/performing-csrf-attack-simulation/SKILL.md) | L46 | Testing web applications for Cross-Site Request Forgery vulnerabilities by craftin... |
| 22 | `performing-directory-traversal-testing` | [`SKILL.md`](skills/web-application-security/performing-directory-traversal-testing/SKILL.md) | L43 | Testing web applications for path traversal vulnerabilities that allow reading or ... |
| 23 | `performing-http-parameter-pollution-attack` | [`SKILL.md`](skills/web-application-security/performing-http-parameter-pollution-attack/SKILL.md) | L44 | Execute HTTP Parameter Pollution attacks to bypass input validation, WAF rules, an... |
| 24 | `performing-second-order-sql-injection` | [`SKILL.md`](skills/web-application-security/performing-second-order-sql-injection/SKILL.md) | L42 | Detect and exploit second-order SQL injection vulnerabilities where malicious inpu... |
| 25 | `performing-security-headers-audit` | [`SKILL.md`](skills/web-application-security/performing-security-headers-audit/SKILL.md) | L44 | Auditing HTTP security headers including CSP, HSTS, X-Frame-Options, and cookie at... |
| 26 | `performing-ssl-stripping-attack` | [`SKILL.md`](skills/web-application-security/performing-ssl-stripping-attack/SKILL.md) | L49 | Simulates SSL stripping attacks using sslstrip, Bettercap, and mitmproxy in author... |
| 27 | `performing-ssl-tls-security-assessment` | [`SKILL.md`](skills/web-application-security/performing-ssl-tls-security-assessment/SKILL.md) | - | Assess SSL/TLS server configurations using the sslyze Python library to evaluate c... |
| 28 | `performing-ssrf-vulnerability-exploitation` | [`SKILL.md`](skills/web-application-security/performing-ssrf-vulnerability-exploitation/SKILL.md) | - | Test for Server-Side Request Forgery vulnerabilities by probing cloud metadata end... |
| 29 | `performing-thick-client-application-penetration-test` | [`SKILL.md`](skills/web-application-security/performing-thick-client-application-penetration-test/SKILL.md) | - | Conduct a thick client application penetration test to identify insecure local sto... |
| 30 | `performing-web-application-firewall-bypass` | [`SKILL.md`](skills/web-application-security/performing-web-application-firewall-bypass/SKILL.md) | L42 | Bypass Web Application Firewall protections using encoding techniques, HTTP method... |
| 31 | `performing-web-application-penetration-test` | [`SKILL.md`](skills/web-application-security/performing-web-application-penetration-test/SKILL.md) | L47 | Performs systematic security testing of web applications following the OWASP Web S... |
| 32 | `performing-web-application-scanning-with-nikto` | [`SKILL.md`](skills/web-application-security/performing-web-application-scanning-with-nikto/SKILL.md) | L64 | Nikto is an open-source web server and web application scanner that tests against ... |
| 33 | `performing-web-application-vulnerability-triage` | [`SKILL.md`](skills/web-application-security/performing-web-application-vulnerability-triage/SKILL.md) | - | Triage web application vulnerability findings from DAST/SAST scanners using OWASP ... |
| 34 | `performing-web-cache-deception-attack` | [`SKILL.md`](skills/web-application-security/performing-web-cache-deception-attack/SKILL.md) | L45 | Execute web cache deception attacks by exploiting path normalization discrepancies... |
| 35 | `performing-web-cache-poisoning-attack` | [`SKILL.md`](skills/web-application-security/performing-web-cache-poisoning-attack/SKILL.md) | L46 | Exploiting web cache mechanisms to serve malicious content to other users by poiso... |
| 36 | `testing-cors-misconfiguration` | [`SKILL.md`](skills/web-application-security/testing-cors-misconfiguration/SKILL.md) | L43 | Identifying and exploiting Cross-Origin Resource Sharing misconfigurations that al... |
| 37 | `testing-for-broken-access-control` | [`SKILL.md`](skills/web-application-security/testing-for-broken-access-control/SKILL.md) | L43 | Systematically testing web applications for broken access control vulnerabilities ... |
| 38 | `testing-for-business-logic-vulnerabilities` | [`SKILL.md`](skills/web-application-security/testing-for-business-logic-vulnerabilities/SKILL.md) | L43 | Identifying flaws in application business logic that allow price manipulation, wor... |
| 39 | `testing-for-email-header-injection` | [`SKILL.md`](skills/web-application-security/testing-for-email-header-injection/SKILL.md) | L42 | Test web application email functionality for SMTP header injection vulnerabilities... |
| 40 | `testing-for-host-header-injection` | [`SKILL.md`](skills/web-application-security/testing-for-host-header-injection/SKILL.md) | L45 | Test web applications for HTTP Host header injection vulnerabilities to identify p... |
| 41 | `testing-for-open-redirect-vulnerabilities` | [`SKILL.md`](skills/web-application-security/testing-for-open-redirect-vulnerabilities/SKILL.md) | L45 | Identify and test open redirect vulnerabilities in web applications by analyzing U... |
| 42 | `testing-for-sensitive-data-exposure` | [`SKILL.md`](skills/web-application-security/testing-for-sensitive-data-exposure/SKILL.md) | L53 | Identifying sensitive data exposure vulnerabilities including API key leakage, PII... |
| 43 | `testing-for-xml-injection-vulnerabilities` | [`SKILL.md`](skills/web-application-security/testing-for-xml-injection-vulnerabilities/SKILL.md) | L42 | Test web applications for XML injection vulnerabilities including XXE, XPath injec... |
| 44 | `testing-for-xss-vulnerabilities` | [`SKILL.md`](skills/web-application-security/testing-for-xss-vulnerabilities/SKILL.md) | L50 | Tests web applications for Cross-Site Scripting (XSS) vulnerabilities by injecting... |
| 45 | `testing-for-xss-vulnerabilities-with-burpsuite` | [`SKILL.md`](skills/web-application-security/testing-for-xss-vulnerabilities-with-burpsuite/SKILL.md) | L43 | Identifying and validating cross-site scripting vulnerabilities using Burp Suite's... |
| 46 | `testing-for-xxe-injection-vulnerabilities` | [`SKILL.md`](skills/web-application-security/testing-for-xxe-injection-vulnerabilities/SKILL.md) | L43 | Discovering and exploiting XML External Entity injection vulnerabilities to read s... |

---

## Identity & Access Management (JWT Security)

**Pasta:** `skills/identity-and-access-management/` | **Total:** 71 skills
**Quando usar:** JWT, OAuth2, SAML, RBAC, MFA, tokens, sessoes, Active Directory

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `auditing-azure-active-directory-configuration` | [`SKILL.md`](skills/identity-and-access-management/auditing-azure-active-directory-configuration/SKILL.md) | L47 | Auditing Microsoft Entra ID (Azure Active Directory) configuration to identify ris... |
| 2 | `auditing-gcp-iam-permissions` | [`SKILL.md`](skills/identity-and-access-management/auditing-gcp-iam-permissions/SKILL.md) | L46 | Auditing Google Cloud Platform IAM permissions to identify overly permissive bindi... |
| 3 | `building-identity-federation-with-saml-azure-ad` | [`SKILL.md`](skills/identity-and-access-management/building-identity-federation-with-saml-azure-ad/SKILL.md) | L94 | Establish SAML 2.0 identity federation between on-premises Active Directory and Az... |
| 4 | `building-identity-governance-lifecycle-process` | [`SKILL.md`](skills/identity-and-access-management/building-identity-governance-lifecycle-process/SKILL.md) | L54 | Builds comprehensive identity governance and lifecycle management processes includ... |
| 5 | `building-role-mining-for-rbac-optimization` | [`SKILL.md`](skills/identity-and-access-management/building-role-mining-for-rbac-optimization/SKILL.md) | L75 | Apply bottom-up and top-down role mining techniques to discover optimal RBAC roles... |
| 6 | `conducting-domain-persistence-with-dcsync` | [`SKILL.md`](skills/identity-and-access-management/conducting-domain-persistence-with-dcsync/SKILL.md) | L71 | Perform DCSync attacks to replicate Active Directory credentials and establish dom... |
| 7 | `conducting-pass-the-ticket-attack` | [`SKILL.md`](skills/identity-and-access-management/conducting-pass-the-ticket-attack/SKILL.md) | L61 | Pass-the-Ticket (PtT) is a lateral movement technique that uses stolen Kerberos ti... |
| 8 | `configuring-active-directory-tiered-model` | [`SKILL.md`](skills/identity-and-access-management/configuring-active-directory-tiered-model/SKILL.md) | - | Implement Microsoft's Enhanced Security Admin Environment (ESAE) tiered administra... |
| 9 | `configuring-aws-verified-access-for-ztna` | [`SKILL.md`](skills/identity-and-access-management/configuring-aws-verified-access-for-ztna/SKILL.md) | - | Configure AWS Verified Access to provide VPN-less zero trust network access to int... |
| 10 | `configuring-identity-aware-proxy-with-google-iap` | [`SKILL.md`](skills/identity-and-access-management/configuring-identity-aware-proxy-with-google-iap/SKILL.md) | L49 | Configuring Google Cloud Identity-Aware Proxy (IAP) to enforce per-request identit... |
| 11 | `configuring-ldap-security-hardening` | [`SKILL.md`](skills/identity-and-access-management/configuring-ldap-security-hardening/SKILL.md) | - | Harden LDAP directory services against common attacks including credential harvest... |
| 12 | `configuring-multi-factor-authentication-with-duo` | [`SKILL.md`](skills/identity-and-access-management/configuring-multi-factor-authentication-with-duo/SKILL.md) | L75 | Deploy Cisco Duo multi-factor authentication across enterprise applications, VPN, ... |
| 13 | `configuring-oauth2-authorization-flow` | [`SKILL.md`](skills/identity-and-access-management/configuring-oauth2-authorization-flow/SKILL.md) | L74 | Configure secure OAuth 2.0 authorization flows including Authorization Code with P... |
| 14 | `detecting-anomalous-authentication-patterns` | [`SKILL.md`](skills/identity-and-access-management/detecting-anomalous-authentication-patterns/SKILL.md) | L56 | Detects anomalous authentication patterns using UEBA analytics, statistical baseli... |
| 15 | `detecting-dcsync-attack-in-active-directory` | [`SKILL.md`](skills/identity-and-access-management/detecting-dcsync-attack-in-active-directory/SKILL.md) | L49 | Detect DCSync attacks where adversaries abuse Active Directory replication privile... |
| 16 | `detecting-golden-ticket-attacks-in-kerberos-logs` | [`SKILL.md`](skills/identity-and-access-management/detecting-golden-ticket-attacks-in-kerberos-logs/SKILL.md) | L41 | Detect Golden Ticket attacks in Active Directory by analyzing Kerberos TGT anomali... |
| 17 | `detecting-golden-ticket-forgery` | [`SKILL.md`](skills/identity-and-access-management/detecting-golden-ticket-forgery/SKILL.md) | - | Detect Kerberos Golden Ticket forgery by analyzing Windows Event ID 4769 for RC4 e... |
| 18 | `detecting-kerberoasting-attacks` | [`SKILL.md`](skills/identity-and-access-management/detecting-kerberoasting-attacks/SKILL.md) | L49 | Detect Kerberoasting attacks by monitoring for anomalous Kerberos TGS requests tar... |
| 19 | `detecting-oauth-token-theft` | [`SKILL.md`](skills/identity-and-access-management/detecting-oauth-token-theft/SKILL.md) | L52 | Detects and responds to OAuth token theft and replay attacks in cloud environments... |
| 20 | `detecting-pass-the-hash-attacks` | [`SKILL.md`](skills/identity-and-access-management/detecting-pass-the-hash-attacks/SKILL.md) | L48 | Detect Pass-the-Hash attacks by analyzing NTLM authentication patterns, identifyin... |
| 21 | `detecting-pass-the-ticket-attacks` | [`SKILL.md`](skills/identity-and-access-management/detecting-pass-the-ticket-attacks/SKILL.md) | - | Detect Kerberos Pass-the-Ticket (PtT) attacks by analyzing Windows Event IDs 4768,... |
| 22 | `detecting-service-account-abuse` | [`SKILL.md`](skills/identity-and-access-management/detecting-service-account-abuse/SKILL.md) | L48 | Detect abuse of service accounts through anomalous interactive logons, privilege e... |
| 23 | `detecting-suspicious-oauth-application-consent` | [`SKILL.md`](skills/identity-and-access-management/detecting-suspicious-oauth-application-consent/SKILL.md) | - | Detect risky OAuth application consent grants in Azure AD / Microsoft Entra ID usi... |
| 24 | `exploiting-active-directory-certificate-services-esc1` | [`SKILL.md`](skills/identity-and-access-management/exploiting-active-directory-certificate-services-esc1/SKILL.md) | L67 | Exploit misconfigured Active Directory Certificate Services (AD CS) ESC1 vulnerabi... |
| 25 | `exploiting-active-directory-with-bloodhound` | [`SKILL.md`](skills/identity-and-access-management/exploiting-active-directory-with-bloodhound/SKILL.md) | L72 | BloodHound is a graph-based Active Directory reconnaissance tool that uses graph t... |
| 26 | `exploiting-constrained-delegation-abuse` | [`SKILL.md`](skills/identity-and-access-management/exploiting-constrained-delegation-abuse/SKILL.md) | L70 | Exploit Kerberos Constrained Delegation misconfigurations in Active Directory to i... |
| 27 | `exploiting-jwt-algorithm-confusion-attack` | [`SKILL.md`](skills/identity-and-access-management/exploiting-jwt-algorithm-confusion-attack/SKILL.md) | L51 | Exploits JWT algorithm confusion vulnerabilities where the server''s token verific... |
| 28 | `exploiting-kerberoasting-with-impacket` | [`SKILL.md`](skills/identity-and-access-management/exploiting-kerberoasting-with-impacket/SKILL.md) | - | Perform Kerberoasting attacks using Impacket's GetUserSPNs to extract and crack Ke... |
| 29 | `exploiting-nopac-cve-2021-42278-42287` | [`SKILL.md`](skills/identity-and-access-management/exploiting-nopac-cve-2021-42278-42287/SKILL.md) | L70 | Exploit the noPac vulnerability chain (CVE-2021-42278 sAMAccountName spoofing and ... |
| 30 | `exploiting-oauth-misconfiguration` | [`SKILL.md`](skills/identity-and-access-management/exploiting-oauth-misconfiguration/SKILL.md) | L43 | Identifying and exploiting OAuth 2.0 and OpenID Connect misconfigurations includin... |
| 31 | `exploiting-zerologon-vulnerability-cve-2020-1472` | [`SKILL.md`](skills/identity-and-access-management/exploiting-zerologon-vulnerability-cve-2020-1472/SKILL.md) | - | Exploit the Zerologon vulnerability (CVE-2020-1472) in the Netlogon Remote Protoco... |
| 32 | `implementing-azure-ad-privileged-identity-management` | [`SKILL.md`](skills/identity-and-access-management/implementing-azure-ad-privileged-identity-management/SKILL.md) | L86 | Configure Microsoft Entra Privileged Identity Management to enforce just-in-time r... |
| 33 | `implementing-beyondcorp-zero-trust-access-model` | [`SKILL.md`](skills/identity-and-access-management/implementing-beyondcorp-zero-trust-access-model/SKILL.md) | L49 | Implementing Google''s BeyondCorp zero trust access model to eliminate implicit tr... |
| 34 | `implementing-cisa-zero-trust-maturity-model` | [`SKILL.md`](skills/identity-and-access-management/implementing-cisa-zero-trust-maturity-model/SKILL.md) | - | Implement the CISA Zero Trust Maturity Model v2.0 across the five pillars of ident... |
| 35 | `implementing-conditional-access-policies-azure-ad` | [`SKILL.md`](skills/identity-and-access-management/implementing-conditional-access-policies-azure-ad/SKILL.md) | - | Configure Microsoft Entra ID (Azure AD) Conditional Access policies for zero trust... |
| 36 | `implementing-delinea-secret-server-for-pam` | [`SKILL.md`](skills/identity-and-access-management/implementing-delinea-secret-server-for-pam/SKILL.md) | L50 | Implements Delinea Secret Server for privileged access management (PAM) including ... |
| 37 | `implementing-google-workspace-sso-configuration` | [`SKILL.md`](skills/identity-and-access-management/implementing-google-workspace-sso-configuration/SKILL.md) | L80 | Configure SAML 2.0 single sign-on for Google Workspace with a third-party identity... |
| 38 | `implementing-hardware-security-key-authentication` | [`SKILL.md`](skills/identity-and-access-management/implementing-hardware-security-key-authentication/SKILL.md) | L57 | Implements FIDO2/WebAuthn hardware security key authentication including registrat... |
| 39 | `implementing-identity-governance-with-sailpoint` | [`SKILL.md`](skills/identity-and-access-management/implementing-identity-governance-with-sailpoint/SKILL.md) | - | Deploy SailPoint IdentityNow or IdentityIQ for identity governance and administrat... |
| 40 | `implementing-identity-verification-for-zero-trust` | [`SKILL.md`](skills/identity-and-access-management/implementing-identity-verification-for-zero-trust/SKILL.md) | L123 | Implement continuous identity verification for zero trust using phishing-resistant... |
| 41 | `implementing-just-in-time-access-provisioning` | [`SKILL.md`](skills/identity-and-access-management/implementing-just-in-time-access-provisioning/SKILL.md) | L66 | Implement Just-In-Time (JIT) access provisioning to eliminate standing privileges ... |
| 42 | `implementing-jwt-signing-and-verification` | [`SKILL.md`](skills/identity-and-access-management/implementing-jwt-signing-and-verification/SKILL.md) | - | JSON Web Tokens (JWT) defined in RFC 7519 are compact, URL-safe tokens used for au... |
| 43 | `implementing-passwordless-auth-with-microsoft-entra` | [`SKILL.md`](skills/identity-and-access-management/implementing-passwordless-auth-with-microsoft-entra/SKILL.md) | L50 | Implements passwordless authentication using Microsoft Entra ID with FIDO2 securit... |
| 44 | `implementing-passwordless-authentication-with-fido2` | [`SKILL.md`](skills/identity-and-access-management/implementing-passwordless-authentication-with-fido2/SKILL.md) | - | Deploy FIDO2/WebAuthn passwordless authentication using security keys and platform... |
| 45 | `implementing-privileged-access-management-with-cyberark` | [`SKILL.md`](skills/identity-and-access-management/implementing-privileged-access-management-with-cyberark/SKILL.md) | L75 | Deploy CyberArk Privileged Access Management to discover, vault, rotate, and monit... |
| 46 | `implementing-privileged-access-workstation` | [`SKILL.md`](skills/identity-and-access-management/implementing-privileged-access-workstation/SKILL.md) | - | Design and implement Privileged Access Workstations (PAWs) with device hardening, ... |
| 47 | `implementing-privileged-session-monitoring` | [`SKILL.md`](skills/identity-and-access-management/implementing-privileged-session-monitoring/SKILL.md) | L52 | Implements privileged session monitoring and recording using Privileged Access Man... |
| 48 | `implementing-rsa-key-pair-management` | [`SKILL.md`](skills/identity-and-access-management/implementing-rsa-key-pair-management/SKILL.md) | - | RSA (Rivest-Shamir-Adleman) is the most widely deployed asymmetric cryptographic a... |
| 49 | `implementing-saml-sso-with-okta` | [`SKILL.md`](skills/identity-and-access-management/implementing-saml-sso-with-okta/SKILL.md) | L72 | Implement SAML 2.0 Single Sign-On (SSO) using Okta as the Identity Provider (IdP).... |
| 50 | `implementing-scim-provisioning-with-okta` | [`SKILL.md`](skills/identity-and-access-management/implementing-scim-provisioning-with-okta/SKILL.md) | L81 | Implement automated user provisioning and deprovisioning using SCIM 2.0 protocol w... |
| 51 | `implementing-zero-knowledge-proof-for-authentication` | [`SKILL.md`](skills/identity-and-access-management/implementing-zero-knowledge-proof-for-authentication/SKILL.md) | - | Zero-Knowledge Proofs (ZKPs) allow a prover to demonstrate knowledge of a secret (... |
| 52 | `implementing-zero-standing-privilege-with-cyberark` | [`SKILL.md`](skills/identity-and-access-management/implementing-zero-standing-privilege-with-cyberark/SKILL.md) | L94 | Deploy CyberArk Secure Cloud Access to eliminate standing privileges in hybrid and... |
| 53 | `managing-cloud-identity-with-okta` | [`SKILL.md`](skills/identity-and-access-management/managing-cloud-identity-with-okta/SKILL.md) | L45 | This skill covers implementing Okta as a centralized identity provider for cloud e... |
| 54 | `performing-access-recertification-with-saviynt` | [`SKILL.md`](skills/identity-and-access-management/performing-access-recertification-with-saviynt/SKILL.md) | L91 | Configure and execute access recertification campaigns in Saviynt Enterprise Ident... |
| 55 | `performing-access-review-and-certification` | [`SKILL.md`](skills/identity-and-access-management/performing-access-review-and-certification/SKILL.md) | L75 | Conduct systematic access reviews and certifications to ensure users have appropri... |
| 56 | `performing-active-directory-bloodhound-analysis` | [`SKILL.md`](skills/identity-and-access-management/performing-active-directory-bloodhound-analysis/SKILL.md) | - | Use BloodHound and SharpHound to enumerate Active Directory relationships and iden... |
| 57 | `performing-active-directory-compromise-investigation` | [`SKILL.md`](skills/identity-and-access-management/performing-active-directory-compromise-investigation/SKILL.md) | - | Investigate Active Directory compromise by analyzing authentication logs, replicat... |
| 58 | `performing-active-directory-forest-trust-attack` | [`SKILL.md`](skills/identity-and-access-management/performing-active-directory-forest-trust-attack/SKILL.md) | - | Enumerate and audit Active Directory forest trust relationships using impacket for... |
| 59 | `performing-active-directory-penetration-test` | [`SKILL.md`](skills/identity-and-access-management/performing-active-directory-penetration-test/SKILL.md) | - | Conduct a focused Active Directory penetration test to enumerate domain objects, d... |
| 60 | `performing-active-directory-vulnerability-assessment` | [`SKILL.md`](skills/identity-and-access-management/performing-active-directory-vulnerability-assessment/SKILL.md) | - | Assess Active Directory security posture using PingCastle, BloodHound, and Purple ... |
| 61 | `performing-entitlement-review-with-sailpoint-iiq` | [`SKILL.md`](skills/identity-and-access-management/performing-entitlement-review-with-sailpoint-iiq/SKILL.md) | L50 | Performs entitlement review and access certification campaigns using SailPoint Ide... |
| 62 | `performing-jwt-none-algorithm-attack` | [`SKILL.md`](skills/identity-and-access-management/performing-jwt-none-algorithm-attack/SKILL.md) | - | Execute and test the JWT none algorithm attack to bypass signature verification by... |
| 63 | `performing-kerberoasting-attack` | [`SKILL.md`](skills/identity-and-access-management/performing-kerberoasting-attack/SKILL.md) | L60 | Kerberoasting is a post-exploitation technique that targets service accounts in Ac... |
| 64 | `performing-oauth-scope-minimization-review` | [`SKILL.md`](skills/identity-and-access-management/performing-oauth-scope-minimization-review/SKILL.md) | L49 | Performs OAuth 2.0 scope minimization review to identify over-permissioned third-p... |
| 65 | `performing-privileged-account-access-review` | [`SKILL.md`](skills/identity-and-access-management/performing-privileged-account-access-review/SKILL.md) | L78 | Conduct systematic reviews of privileged accounts to validate access rights, ident... |
| 66 | `performing-privileged-account-discovery` | [`SKILL.md`](skills/identity-and-access-management/performing-privileged-account-discovery/SKILL.md) | - | Discover and inventory all privileged accounts across enterprise infrastructure in... |
| 67 | `performing-service-account-audit` | [`SKILL.md`](skills/identity-and-access-management/performing-service-account-audit/SKILL.md) | L68 | Audit service accounts across enterprise infrastructure to identify orphaned, over... |
| 68 | `performing-service-account-credential-rotation` | [`SKILL.md`](skills/identity-and-access-management/performing-service-account-credential-rotation/SKILL.md) | L93 | Automate credential rotation for service accounts across Active Directory, cloud p... |
| 69 | `testing-for-json-web-token-vulnerabilities` | [`SKILL.md`](skills/identity-and-access-management/testing-for-json-web-token-vulnerabilities/SKILL.md) | L46 | Test JWT implementations for critical vulnerabilities including algorithm confusio... |
| 70 | `testing-jwt-token-security` | [`SKILL.md`](skills/identity-and-access-management/testing-jwt-token-security/SKILL.md) | L44 | Assessing JSON Web Token implementations for cryptographic weaknesses, algorithm c... |
| 71 | `testing-oauth2-implementation-flaws` | [`SKILL.md`](skills/identity-and-access-management/testing-oauth2-implementation-flaws/SKILL.md) | L49 | Tests OAuth 2.0 and OpenID Connect implementations for security flaws including au... |

---

## DevSecOps

**Pasta:** `skills/devsecops/` | **Total:** 39 skills
**Quando usar:** CI/CD, pipelines, SAST/DAST, secrets scanning, supply chain, containers

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `analyzing-sbom-for-supply-chain-vulnerabilities` | [`SKILL.md`](skills/devsecops/analyzing-sbom-for-supply-chain-vulnerabilities/SKILL.md) | L61 | Parses Software Bill of Materials (SBOM) in CycloneDX and SPDX JSON formats to ide... |
| 2 | `building-devsecops-pipeline-with-gitlab-ci` | [`SKILL.md`](skills/devsecops/building-devsecops-pipeline-with-gitlab-ci/SKILL.md) | - | Design and implement a comprehensive DevSecOps pipeline in GitLab CI/CD integratin... |
| 3 | `building-patch-tuesday-response-process` | [`SKILL.md`](skills/devsecops/building-patch-tuesday-response-process/SKILL.md) | L85 | Establish a structured operational process to triage, test, and deploy Microsoft P... |
| 4 | `building-vulnerability-aging-and-sla-tracking` | [`SKILL.md`](skills/devsecops/building-vulnerability-aging-and-sla-tracking/SKILL.md) | L78 | Implement a vulnerability aging dashboard and SLA tracking system to measure remed... |
| 5 | `building-vulnerability-dashboard-with-defectdojo` | [`SKILL.md`](skills/devsecops/building-vulnerability-dashboard-with-defectdojo/SKILL.md) | - | Deploy DefectDojo as a centralized vulnerability management dashboard with scanner... |
| 6 | `building-vulnerability-exception-tracking-system` | [`SKILL.md`](skills/devsecops/building-vulnerability-exception-tracking-system/SKILL.md) | - | Build a vulnerability exception and risk acceptance tracking system with approval ... |
| 7 | `building-vulnerability-scanning-workflow` | [`SKILL.md`](skills/devsecops/building-vulnerability-scanning-workflow/SKILL.md) | L49 | Builds a structured vulnerability scanning workflow using tools like Nessus, Qualy... |
| 8 | `detecting-supply-chain-attacks-in-ci-cd` | [`SKILL.md`](skills/devsecops/detecting-supply-chain-attacks-in-ci-cd/SKILL.md) | - | Scans GitHub Actions workflows and CI/CD pipeline configurations for supply chain ... |
| 9 | `detecting-typosquatting-packages-in-npm-pypi` | [`SKILL.md`](skills/devsecops/detecting-typosquatting-packages-in-npm-pypi/SKILL.md) | L50 | Detects typosquatting attacks in npm and PyPI package registries by analyzing pack... |
| 10 | `hunting-for-supply-chain-compromise` | [`SKILL.md`](skills/devsecops/hunting-for-supply-chain-compromise/SKILL.md) | L48 | Hunt for supply chain compromise indicators including trojanized software updates,... |
| 11 | `implementing-code-signing-for-artifacts` | [`SKILL.md`](skills/devsecops/implementing-code-signing-for-artifacts/SKILL.md) | L46 | This skill covers implementing code signing for build artifacts to ensure integrit... |
| 12 | `implementing-devsecops-security-scanning` | [`SKILL.md`](skills/devsecops/implementing-devsecops-security-scanning/SKILL.md) | L56 | Integrates Static Application Security Testing (SAST), Dynamic Application Securit... |
| 13 | `implementing-fuzz-testing-in-cicd-with-aflplusplus` | [`SKILL.md`](skills/devsecops/implementing-fuzz-testing-in-cicd-with-aflplusplus/SKILL.md) | L94 | Integrate AFL++ coverage-guided fuzz testing into CI/CD pipelines to discover memo... |
| 14 | `implementing-gcp-binary-authorization` | [`SKILL.md`](skills/devsecops/implementing-gcp-binary-authorization/SKILL.md) | - | Implement GCP Binary Authorization to enforce deploy-time security controls that e... |
| 15 | `implementing-github-advanced-security-for-code-scanning` | [`SKILL.md`](skills/devsecops/implementing-github-advanced-security-for-code-scanning/SKILL.md) | L62 | Configure GitHub Advanced Security with CodeQL to perform automated static analysi... |
| 16 | `implementing-image-provenance-verification-with-cosign` | [`SKILL.md`](skills/devsecops/implementing-image-provenance-verification-with-cosign/SKILL.md) | - | Sign and verify container image provenance using Sigstore Cosign with keyless OIDC... |
| 17 | `implementing-infrastructure-as-code-security-scanning` | [`SKILL.md`](skills/devsecops/implementing-infrastructure-as-code-security-scanning/SKILL.md) | L48 | This skill covers implementing automated security scanning for Infrastructure as C... |
| 18 | `implementing-patch-management-workflow` | [`SKILL.md`](skills/devsecops/implementing-patch-management-workflow/SKILL.md) | L72 | Patch management is the systematic process of identifying, testing, deploying, and... |
| 19 | `implementing-rapid7-insightvm-for-scanning` | [`SKILL.md`](skills/devsecops/implementing-rapid7-insightvm-for-scanning/SKILL.md) | L85 | Deploy and configure Rapid7 InsightVM Security Console and Scan Engines for authen... |
| 20 | `implementing-secret-scanning-with-gitleaks` | [`SKILL.md`](skills/devsecops/implementing-secret-scanning-with-gitleaks/SKILL.md) | L46 | This skill covers implementing Gitleaks for detecting and preventing hardcoded sec... |
| 21 | `implementing-secrets-management-with-vault` | [`SKILL.md`](skills/devsecops/implementing-secrets-management-with-vault/SKILL.md) | L46 | This skill covers deploying HashiCorp Vault for centralized secrets management acr... |
| 22 | `implementing-secrets-scanning-in-ci-cd` | [`SKILL.md`](skills/devsecops/implementing-secrets-scanning-in-ci-cd/SKILL.md) | - | Integrate gitleaks and trufflehog into CI/CD pipelines to detect leaked secrets be... |
| 23 | `implementing-semgrep-for-custom-sast-rules` | [`SKILL.md`](skills/devsecops/implementing-semgrep-for-custom-sast-rules/SKILL.md) | - | Write custom Semgrep SAST rules in YAML to detect application-specific vulnerabili... |
| 24 | `implementing-sigstore-for-software-signing` | [`SKILL.md`](skills/devsecops/implementing-sigstore-for-software-signing/SKILL.md) | L51 | Implements Sigstore-based software signing and verification using Cosign keyless s... |
| 25 | `implementing-supply-chain-security-with-in-toto` | [`SKILL.md`](skills/devsecops/implementing-supply-chain-security-with-in-toto/SKILL.md) | - | Implement software supply chain integrity verification for container builds using ... |
| 26 | `implementing-vulnerability-management-with-greenbone` | [`SKILL.md`](skills/devsecops/implementing-vulnerability-management-with-greenbone/SKILL.md) | - | Deploy and operate Greenbone/OpenVAS vulnerability management using the python-gvm... |
| 27 | `implementing-vulnerability-remediation-sla` | [`SKILL.md`](skills/devsecops/implementing-vulnerability-remediation-sla/SKILL.md) | L69 | Vulnerability remediation SLAs define mandatory timeframes for patching or mitigat... |
| 28 | `implementing-vulnerability-sla-breach-alerting` | [`SKILL.md`](skills/devsecops/implementing-vulnerability-sla-breach-alerting/SKILL.md) | L120 | Build automated alerting for vulnerability remediation SLA breaches with severity-... |
| 29 | `integrating-dast-with-owasp-zap-in-pipeline` | [`SKILL.md`](skills/devsecops/integrating-dast-with-owasp-zap-in-pipeline/SKILL.md) | L46 | This skill covers integrating OWASP ZAP (Zed Attack Proxy) for Dynamic Application... |
| 30 | `integrating-sast-into-github-actions-pipeline` | [`SKILL.md`](skills/devsecops/integrating-sast-into-github-actions-pipeline/SKILL.md) | L47 | This skill covers integrating Static Application Security Testing (SAST) tools—Cod... |
| 31 | `performing-agentless-vulnerability-scanning` | [`SKILL.md`](skills/devsecops/performing-agentless-vulnerability-scanning/SKILL.md) | L85 | Configure and execute agentless vulnerability scanning using network protocols, cl... |
| 32 | `performing-authenticated-scan-with-openvas` | [`SKILL.md`](skills/devsecops/performing-authenticated-scan-with-openvas/SKILL.md) | - | Configure and execute authenticated vulnerability scans using OpenVAS/Greenbone Vu... |
| 33 | `performing-authenticated-vulnerability-scan` | [`SKILL.md`](skills/devsecops/performing-authenticated-vulnerability-scan/SKILL.md) | L80 | Authenticated (credentialed) vulnerability scanning uses valid system credentials ... |
| 34 | `performing-endpoint-vulnerability-remediation` | [`SKILL.md`](skills/devsecops/performing-endpoint-vulnerability-remediation/SKILL.md) | L47 | Performs vulnerability remediation on endpoints by prioritizing CVEs based on risk... |
| 35 | `performing-fuzzing-with-aflplusplus` | [`SKILL.md`](skills/devsecops/performing-fuzzing-with-aflplusplus/SKILL.md) | - | Perform coverage-guided fuzzing of compiled binaries using AFL++ (American Fuzzy L... |
| 36 | `performing-sca-dependency-scanning-with-snyk` | [`SKILL.md`](skills/devsecops/performing-sca-dependency-scanning-with-snyk/SKILL.md) | L47 | This skill covers implementing Software Composition Analysis (SCA) using Snyk to d... |
| 37 | `performing-supply-chain-attack-simulation` | [`SKILL.md`](skills/devsecops/performing-supply-chain-attack-simulation/SKILL.md) | - | Simulate and detect software supply chain attacks including typosquatting detectio... |
| 38 | `scanning-containers-with-trivy-in-cicd` | [`SKILL.md`](skills/devsecops/scanning-containers-with-trivy-in-cicd/SKILL.md) | L47 | This skill covers integrating Aqua Security''s Trivy scanner into CI/CD pipelines ... |
| 39 | `securing-github-actions-workflows` | [`SKILL.md`](skills/devsecops/securing-github-actions-workflows/SKILL.md) | L45 | This skill covers hardening GitHub Actions workflows against supply chain attacks,... |

---

## Security Operations (Threat Detection)

**Pasta:** `skills/security-operations/` | **Total:** 115 skills
**Quando usar:** SIEM, deteccao de ameacas, threat hunting, SOC, correlacao de eventos

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `analyzing-security-logs-with-splunk` | [`SKILL.md`](skills/security-operations/analyzing-security-logs-with-splunk/SKILL.md) | L67 | Leverages Splunk Enterprise Security and SPL (Search Processing Language) to inves... |
| 2 | `building-cloud-siem-with-sentinel` | [`SKILL.md`](skills/security-operations/building-cloud-siem-with-sentinel/SKILL.md) | L54 | This skill covers deploying Microsoft Sentinel as a cloud-native SIEM and SOAR pla... |
| 3 | `building-detection-rule-with-splunk-spl` | [`SKILL.md`](skills/security-operations/building-detection-rule-with-splunk-spl/SKILL.md) | - | Build effective detection rules using Splunk Search Processing Language (SPL) corr... |
| 4 | `building-detection-rules-with-sigma` | [`SKILL.md`](skills/security-operations/building-detection-rules-with-sigma/SKILL.md) | L54 | Builds vendor-agnostic detection rules using the Sigma rule format for threat dete... |
| 5 | `building-incident-response-dashboard` | [`SKILL.md`](skills/security-operations/building-incident-response-dashboard/SKILL.md) | L47 | Builds real-time incident response dashboards in Splunk, Elastic, or Grafana to pr... |
| 6 | `building-soc-escalation-matrix` | [`SKILL.md`](skills/security-operations/building-soc-escalation-matrix/SKILL.md) | - | Build a structured SOC escalation matrix defining severity tiers, response SLAs, e... |
| 7 | `building-soc-metrics-and-kpi-tracking` | [`SKILL.md`](skills/security-operations/building-soc-metrics-and-kpi-tracking/SKILL.md) | L57 | Builds SOC performance metrics and KPI tracking dashboards measuring Mean Time to ... |
| 8 | `building-soc-playbook-for-ransomware` | [`SKILL.md`](skills/security-operations/building-soc-playbook-for-ransomware/SKILL.md) | L58 | Builds a structured SOC incident response playbook for ransomware attacks covering... |
| 9 | `configuring-host-based-intrusion-detection` | [`SKILL.md`](skills/security-operations/configuring-host-based-intrusion-detection/SKILL.md) | L47 | Configures host-based intrusion detection systems (HIDS) to monitor endpoint file ... |
| 10 | `configuring-snort-ids-for-intrusion-detection` | [`SKILL.md`](skills/security-operations/configuring-snort-ids-for-intrusion-detection/SKILL.md) | L45 | Installs, configures, and tunes Snort 3 intrusion detection system to monitor netw... |
| 11 | `configuring-suricata-for-network-monitoring` | [`SKILL.md`](skills/security-operations/configuring-suricata-for-network-monitoring/SKILL.md) | L45 | Deploys and configures Suricata IDS/IPS with Emerging Threats rulesets, EVE JSON l... |
| 12 | `configuring-windows-event-logging-for-detection` | [`SKILL.md`](skills/security-operations/configuring-windows-event-logging-for-detection/SKILL.md) | L45 | Configures Windows Event Logging with advanced audit policies to generate high-fid... |
| 13 | `correlating-security-events-in-qradar` | [`SKILL.md`](skills/security-operations/correlating-security-events-in-qradar/SKILL.md) | L47 | Correlates security events in IBM QRadar SIEM using AQL (Ariel Query Language), cu... |
| 14 | `deploying-edr-agent-with-crowdstrike` | [`SKILL.md`](skills/security-operations/deploying-edr-agent-with-crowdstrike/SKILL.md) | L57 | Deploys and configures CrowdStrike Falcon EDR agents across enterprise endpoints t... |
| 15 | `deploying-osquery-for-endpoint-monitoring` | [`SKILL.md`](skills/security-operations/deploying-osquery-for-endpoint-monitoring/SKILL.md) | L52 | Deploys and configures osquery for real-time endpoint monitoring using SQL-based q... |
| 16 | `detecting-beaconing-patterns-with-zeek` | [`SKILL.md`](skills/security-operations/detecting-beaconing-patterns-with-zeek/SKILL.md) | - | Performs statistical analysis of Zeek conn.log connection intervals to detect C2 b... |
| 17 | `detecting-credential-dumping-techniques` | [`SKILL.md`](skills/security-operations/detecting-credential-dumping-techniques/SKILL.md) | - | Detect LSASS credential dumping, SAM database extraction, and NTDS.dit theft using... |
| 18 | `detecting-dll-sideloading-attacks` | [`SKILL.md`](skills/security-operations/detecting-dll-sideloading-attacks/SKILL.md) | L49 | Detect DLL side-loading attacks where adversaries place malicious DLLs alongside l... |
| 19 | `detecting-evasion-techniques-in-endpoint-logs` | [`SKILL.md`](skills/security-operations/detecting-evasion-techniques-in-endpoint-logs/SKILL.md) | L53 | Detects defense evasion techniques used by adversaries in endpoint logs including ... |
| 20 | `detecting-fileless-attacks-on-endpoints` | [`SKILL.md`](skills/security-operations/detecting-fileless-attacks-on-endpoints/SKILL.md) | L45 | Detects fileless malware and in-memory attacks that execute entirely in RAM withou... |
| 21 | `detecting-fileless-malware-techniques` | [`SKILL.md`](skills/security-operations/detecting-fileless-malware-techniques/SKILL.md) | L54 | Detects and analyzes fileless malware that operates entirely in memory using Power... |
| 22 | `detecting-insider-data-exfiltration-via-dlp` | [`SKILL.md`](skills/security-operations/detecting-insider-data-exfiltration-via-dlp/SKILL.md) | - | Detects insider data exfiltration by analyzing DLP policy violations, file access ... |
| 23 | `detecting-insider-threat-behaviors` | [`SKILL.md`](skills/security-operations/detecting-insider-threat-behaviors/SKILL.md) | L48 | Detect insider threat behavioral indicators including unusual data access, off-hou... |
| 24 | `detecting-insider-threat-with-ueba` | [`SKILL.md`](skills/security-operations/detecting-insider-threat-with-ueba/SKILL.md) | - | Implement User and Entity Behavior Analytics using Elasticsearch/OpenSearch to bui... |
| 25 | `detecting-lateral-movement-in-network` | [`SKILL.md`](skills/security-operations/detecting-lateral-movement-in-network/SKILL.md) | L50 | Identifies lateral movement techniques in enterprise networks by analyzing authent... |
| 26 | `detecting-lateral-movement-with-splunk` | [`SKILL.md`](skills/security-operations/detecting-lateral-movement-with-splunk/SKILL.md) | L49 | Detect adversary lateral movement across networks using Splunk SPL queries against... |
| 27 | `detecting-lateral-movement-with-zeek` | [`SKILL.md`](skills/security-operations/detecting-lateral-movement-with-zeek/SKILL.md) | L55 | Detect lateral movement in network traffic using Zeek (formerly Bro) log analysis.... |
| 28 | `detecting-living-off-the-land-attacks` | [`SKILL.md`](skills/security-operations/detecting-living-off-the-land-attacks/SKILL.md) | L56 | Detect abuse of legitimate Windows binaries (LOLBins) used for living off the land... |
| 29 | `detecting-living-off-the-land-with-lolbas` | [`SKILL.md`](skills/security-operations/detecting-living-off-the-land-with-lolbas/SKILL.md) | - | Detect Living Off the Land Binaries (LOLBins/LOLBAS) abuse including certutil, reg... |
| 30 | `detecting-malicious-scheduled-tasks-with-sysmon` | [`SKILL.md`](skills/security-operations/detecting-malicious-scheduled-tasks-with-sysmon/SKILL.md) | - | Detect malicious scheduled task creation and modification using Sysmon Event IDs 1... |
| 31 | `detecting-mimikatz-execution-patterns` | [`SKILL.md`](skills/security-operations/detecting-mimikatz-execution-patterns/SKILL.md) | L49 | Detect Mimikatz execution through command-line patterns, LSASS access signatures, ... |
| 32 | `detecting-network-anomalies-with-zeek` | [`SKILL.md`](skills/security-operations/detecting-network-anomalies-with-zeek/SKILL.md) | L44 | Deploys and configures Zeek (formerly Bro) network security monitor to passively a... |
| 33 | `detecting-network-scanning-with-ids-signatures` | [`SKILL.md`](skills/security-operations/detecting-network-scanning-with-ids-signatures/SKILL.md) | L77 | Detect network reconnaissance and port scanning using Suricata and Snort IDS signa... |
| 34 | `detecting-ntlm-relay-with-event-correlation` | [`SKILL.md`](skills/security-operations/detecting-ntlm-relay-with-event-correlation/SKILL.md) | L77 | Detect NTLM relay attacks through Windows Security Event correlation by analyzing ... |
| 35 | `detecting-port-scanning-with-fail2ban` | [`SKILL.md`](skills/security-operations/detecting-port-scanning-with-fail2ban/SKILL.md) | L45 | Configures Fail2ban with custom filters and actions to detect port scanning activi... |
| 36 | `detecting-privilege-escalation-attempts` | [`SKILL.md`](skills/security-operations/detecting-privilege-escalation-attempts/SKILL.md) | L48 | Detect privilege escalation attempts including token manipulation, UAC bypass, unq... |
| 37 | `detecting-process-hollowing-technique` | [`SKILL.md`](skills/security-operations/detecting-process-hollowing-technique/SKILL.md) | L49 | Detect process hollowing (T1055.012) by analyzing memory-mapped sections, hollowed... |
| 38 | `detecting-process-injection-techniques` | [`SKILL.md`](skills/security-operations/detecting-process-injection-techniques/SKILL.md) | L54 | Detects and analyzes process injection techniques used by malware including classi... |
| 39 | `detecting-ransomware-encryption-behavior` | [`SKILL.md`](skills/security-operations/detecting-ransomware-encryption-behavior/SKILL.md) | L49 | Detects ransomware encryption activity in real time using entropy analysis, file s... |
| 40 | `detecting-ransomware-precursors-in-network` | [`SKILL.md`](skills/security-operations/detecting-ransomware-precursors-in-network/SKILL.md) | L48 | Detects early-stage ransomware indicators in network traffic before encryption beg... |
| 41 | `detecting-rdp-brute-force-attacks` | [`SKILL.md`](skills/security-operations/detecting-rdp-brute-force-attacks/SKILL.md) | - | Detect RDP brute force attacks by analyzing Windows Security Event Logs for failed... |
| 42 | `detecting-rootkit-activity` | [`SKILL.md`](skills/security-operations/detecting-rootkit-activity/SKILL.md) | L48 | Detects rootkit presence on compromised systems by identifying hidden processes, h... |
| 43 | `detecting-suspicious-powershell-execution` | [`SKILL.md`](skills/security-operations/detecting-suspicious-powershell-execution/SKILL.md) | L49 | Detect suspicious PowerShell execution patterns including encoded commands, downlo... |
| 44 | `detecting-t1003-credential-dumping-with-edr` | [`SKILL.md`](skills/security-operations/detecting-t1003-credential-dumping-with-edr/SKILL.md) | L50 | Detect OS credential dumping techniques targeting LSASS memory, SAM database, NTDS... |
| 45 | `detecting-t1055-process-injection-with-sysmon` | [`SKILL.md`](skills/security-operations/detecting-t1055-process-injection-with-sysmon/SKILL.md) | L50 | Detect process injection techniques (T1055) including classic DLL injection, proce... |
| 46 | `detecting-t1548-abuse-elevation-control-mechanism` | [`SKILL.md`](skills/security-operations/detecting-t1548-abuse-elevation-control-mechanism/SKILL.md) | L48 | Detect abuse of elevation control mechanisms including UAC bypass, sudo exploitati... |
| 47 | `detecting-wmi-persistence` | [`SKILL.md`](skills/security-operations/detecting-wmi-persistence/SKILL.md) | L50 | Detect WMI event subscription persistence by analyzing Sysmon Event IDs 19, 20, an... |
| 48 | `hunting-advanced-persistent-threats` | [`SKILL.md`](skills/security-operations/hunting-advanced-persistent-threats/SKILL.md) | L54 | Proactively hunts for Advanced Persistent Threat (APT) activity within enterprise ... |
| 49 | `hunting-credential-stuffing-attacks` | [`SKILL.md`](skills/security-operations/hunting-credential-stuffing-attacks/SKILL.md) | - | Detects credential stuffing attacks by analyzing authentication logs for login vel... |
| 50 | `hunting-for-anomalous-powershell-execution` | [`SKILL.md`](skills/security-operations/hunting-for-anomalous-powershell-execution/SKILL.md) | - | Hunt for malicious PowerShell activity by analyzing Script Block Logging (Event 41... |
| 51 | `hunting-for-beaconing-with-frequency-analysis` | [`SKILL.md`](skills/security-operations/hunting-for-beaconing-with-frequency-analysis/SKILL.md) | L50 | Identify command-and-control beaconing patterns in network traffic by applying sta... |
| 52 | `hunting-for-cobalt-strike-beacons` | [`SKILL.md`](skills/security-operations/hunting-for-cobalt-strike-beacons/SKILL.md) | - | Detect Cobalt Strike beacon network activity using default TLS certificate signatu... |
| 53 | `hunting-for-command-and-control-beaconing` | [`SKILL.md`](skills/security-operations/hunting-for-command-and-control-beaconing/SKILL.md) | L48 | Detect C2 beaconing patterns in network traffic using frequency analysis, jitter d... |
| 54 | `hunting-for-data-exfiltration-indicators` | [`SKILL.md`](skills/security-operations/hunting-for-data-exfiltration-indicators/SKILL.md) | L55 | Hunt for data exfiltration through network traffic analysis, detecting unusual dat... |
| 55 | `hunting-for-data-staging-before-exfiltration` | [`SKILL.md`](skills/security-operations/hunting-for-data-staging-before-exfiltration/SKILL.md) | - | Detect data staging activity before exfiltration by monitoring for archive creatio... |
| 56 | `hunting-for-dcom-lateral-movement` | [`SKILL.md`](skills/security-operations/hunting-for-dcom-lateral-movement/SKILL.md) | L66 | Hunt for DCOM-based lateral movement by detecting abuse of MMC20.Application, Shel... |
| 57 | `hunting-for-dcsync-attacks` | [`SKILL.md`](skills/security-operations/hunting-for-dcsync-attacks/SKILL.md) | L50 | Detect DCSync attacks by analyzing Windows Event ID 4662 for unauthorized DS-Repli... |
| 58 | `hunting-for-defense-evasion-via-timestomping` | [`SKILL.md`](skills/security-operations/hunting-for-defense-evasion-via-timestomping/SKILL.md) | L56 | Detect NTFS timestamp manipulation (MITRE T1070.006) by comparing $STANDARD_INFORM... |
| 59 | `hunting-for-dns-based-persistence` | [`SKILL.md`](skills/security-operations/hunting-for-dns-based-persistence/SKILL.md) | - | Hunt for DNS-based persistence mechanisms including DNS hijacking, dangling CNAME ... |
| 60 | `hunting-for-dns-tunneling-with-zeek` | [`SKILL.md`](skills/security-operations/hunting-for-dns-tunneling-with-zeek/SKILL.md) | L49 | Detect DNS tunneling and data exfiltration by analyzing Zeek dns.log for high-entr... |
| 61 | `hunting-for-domain-fronting-c2-traffic` | [`SKILL.md`](skills/security-operations/hunting-for-domain-fronting-c2-traffic/SKILL.md) | - | Detect domain fronting C2 traffic by analyzing SNI vs HTTP Host header mismatches ... |
| 62 | `hunting-for-lateral-movement-via-wmi` | [`SKILL.md`](skills/security-operations/hunting-for-lateral-movement-via-wmi/SKILL.md) | - | Detect WMI-based lateral movement by analyzing Windows Event ID 4688 process creat... |
| 63 | `hunting-for-living-off-the-cloud-techniques` | [`SKILL.md`](skills/security-operations/hunting-for-living-off-the-cloud-techniques/SKILL.md) | L49 | Hunt for adversary abuse of legitimate cloud services for C2, data staging, and ex... |
| 64 | `hunting-for-living-off-the-land-binaries` | [`SKILL.md`](skills/security-operations/hunting-for-living-off-the-land-binaries/SKILL.md) | L49 | Proactively hunt for adversary abuse of legitimate system binaries (LOLBins) to ex... |
| 65 | `hunting-for-lolbins-execution-in-endpoint-logs` | [`SKILL.md`](skills/security-operations/hunting-for-lolbins-execution-in-endpoint-logs/SKILL.md) | L49 | Hunt for adversary abuse of Living Off the Land Binaries (LOLBins) by analyzing en... |
| 66 | `hunting-for-ntlm-relay-attacks` | [`SKILL.md`](skills/security-operations/hunting-for-ntlm-relay-attacks/SKILL.md) | - | Detect NTLM relay attacks by analyzing Windows Event 4624 logon type 3 with NTLMSS... |
| 67 | `hunting-for-persistence-mechanisms-in-windows` | [`SKILL.md`](skills/security-operations/hunting-for-persistence-mechanisms-in-windows/SKILL.md) | L49 | Systematically hunt for adversary persistence mechanisms across Windows endpoints ... |
| 68 | `hunting-for-persistence-via-wmi-subscriptions` | [`SKILL.md`](skills/security-operations/hunting-for-persistence-via-wmi-subscriptions/SKILL.md) | L48 | Hunt for adversary persistence through Windows Management Instrumentation event su... |
| 69 | `hunting-for-process-injection-techniques` | [`SKILL.md`](skills/security-operations/hunting-for-process-injection-techniques/SKILL.md) | - | Detect process injection techniques (T1055) including CreateRemoteThread, process ... |
| 70 | `hunting-for-registry-persistence-mechanisms` | [`SKILL.md`](skills/security-operations/hunting-for-registry-persistence-mechanisms/SKILL.md) | L49 | Hunt for registry-based persistence mechanisms including Run keys, Winlogon modifi... |
| 71 | `hunting-for-registry-run-key-persistence` | [`SKILL.md`](skills/security-operations/hunting-for-registry-run-key-persistence/SKILL.md) | - | Detect MITRE ATT&CK T1547.001 registry Run key persistence by analyzing Sysmon Eve... |
| 72 | `hunting-for-scheduled-task-persistence` | [`SKILL.md`](skills/security-operations/hunting-for-scheduled-task-persistence/SKILL.md) | L48 | Hunt for adversary persistence via Windows Scheduled Tasks by analyzing task creat... |
| 73 | `hunting-for-shadow-copy-deletion` | [`SKILL.md`](skills/security-operations/hunting-for-shadow-copy-deletion/SKILL.md) | L49 | Hunt for Volume Shadow Copy deletion activity that indicates ransomware preparatio... |
| 74 | `hunting-for-spearphishing-indicators` | [`SKILL.md`](skills/security-operations/hunting-for-spearphishing-indicators/SKILL.md) | L49 | Hunt for spearphishing campaign indicators across email logs, endpoint telemetry, ... |
| 75 | `hunting-for-startup-folder-persistence` | [`SKILL.md`](skills/security-operations/hunting-for-startup-folder-persistence/SKILL.md) | - | Detect T1547.001 startup folder persistence by monitoring Windows startup director... |
| 76 | `hunting-for-t1098-account-manipulation` | [`SKILL.md`](skills/security-operations/hunting-for-t1098-account-manipulation/SKILL.md) | - | Hunt for MITRE ATT&CK T1098 account manipulation including shadow admin creation, ... |
| 77 | `hunting-for-unusual-network-connections` | [`SKILL.md`](skills/security-operations/hunting-for-unusual-network-connections/SKILL.md) | L48 | Hunt for unusual network connections by analyzing outbound traffic patterns, rare ... |
| 78 | `hunting-for-unusual-service-installations` | [`SKILL.md`](skills/security-operations/hunting-for-unusual-service-installations/SKILL.md) | - | Detect suspicious Windows service installations (MITRE ATT&CK T1543.003) by parsin... |
| 79 | `hunting-for-webshell-activity` | [`SKILL.md`](skills/security-operations/hunting-for-webshell-activity/SKILL.md) | L49 | Hunt for web shell deployments on internet-facing servers by analyzing file creati... |
| 80 | `implementing-alert-fatigue-reduction` | [`SKILL.md`](skills/security-operations/implementing-alert-fatigue-reduction/SKILL.md) | L47 | Implements strategies to reduce SOC alert fatigue by tuning detection rules, conso... |
| 81 | `implementing-canary-tokens-for-network-intrusion` | [`SKILL.md`](skills/security-operations/implementing-canary-tokens-for-network-intrusion/SKILL.md) | - | Deploys DNS, HTTP, and AWS API key canary tokens across network infrastructure to ... |
| 82 | `implementing-continuous-security-validation-with-bas` | [`SKILL.md`](skills/security-operations/implementing-continuous-security-validation-with-bas/SKILL.md) | L99 | Deploy Breach and Attack Simulation tools to continuously validate security contro... |
| 83 | `implementing-deception-based-detection-with-canarytoken` | [`SKILL.md`](skills/security-operations/implementing-deception-based-detection-with-canarytoken/SKILL.md) | - | Deploy and monitor Canary Tokens via the Thinkst Canary API for deception-based br... |
| 84 | `implementing-ebpf-security-monitoring` | [`SKILL.md`](skills/security-operations/implementing-ebpf-security-monitoring/SKILL.md) | - | Implements eBPF-based security monitoring using Cilium Tetragon for real-time proc... |
| 85 | `implementing-endpoint-detection-with-wazuh` | [`SKILL.md`](skills/security-operations/implementing-endpoint-detection-with-wazuh/SKILL.md) | - | Deploy and configure Wazuh SIEM/XDR for endpoint detection including agent managem... |
| 86 | `implementing-file-integrity-monitoring-with-aide` | [`SKILL.md`](skills/security-operations/implementing-file-integrity-monitoring-with-aide/SKILL.md) | - | Configure AIDE (Advanced Intrusion Detection Environment) for file integrity monit... |
| 87 | `implementing-honeypot-for-ransomware-detection` | [`SKILL.md`](skills/security-operations/implementing-honeypot-for-ransomware-detection/SKILL.md) | L55 | Deploys canary files, honeypot shares, and decoy systems to detect ransomware acti... |
| 88 | `implementing-honeytokens-for-breach-detection` | [`SKILL.md`](skills/security-operations/implementing-honeytokens-for-breach-detection/SKILL.md) | - | Deploys canary tokens and honeytokens (fake AWS credentials, DNS canaries, documen... |
| 89 | `implementing-mitre-attack-coverage-mapping` | [`SKILL.md`](skills/security-operations/implementing-mitre-attack-coverage-mapping/SKILL.md) | - | Implement MITRE ATT&CK coverage mapping to identify detection gaps, prioritize rul... |
| 90 | `implementing-network-intrusion-prevention-with-suricata` | [`SKILL.md`](skills/security-operations/implementing-network-intrusion-prevention-with-suricata/SKILL.md) | L80 | Deploy and configure Suricata as a network intrusion prevention system with custom... |
| 91 | `implementing-network-traffic-analysis-with-arkime` | [`SKILL.md`](skills/security-operations/implementing-network-traffic-analysis-with-arkime/SKILL.md) | - | Deploy and query Arkime (formerly Moloch) for full packet capture network traffic ... |
| 92 | `implementing-network-traffic-baselining` | [`SKILL.md`](skills/security-operations/implementing-network-traffic-baselining/SKILL.md) | - | Build network traffic baselines from NetFlow/IPFIX data using Python pandas for st... |
| 93 | `implementing-security-monitoring-with-datadog` | [`SKILL.md`](skills/security-operations/implementing-security-monitoring-with-datadog/SKILL.md) | L63 | Implements security monitoring using Datadog Cloud SIEM, Cloud Security Management... |
| 94 | `implementing-siem-correlation-rules-for-apt` | [`SKILL.md`](skills/security-operations/implementing-siem-correlation-rules-for-apt/SKILL.md) | - | Write multi-event correlation rules that detect APT lateral movement by chaining W... |
| 95 | `implementing-siem-use-case-tuning` | [`SKILL.md`](skills/security-operations/implementing-siem-use-case-tuning/SKILL.md) | - | Tune SIEM detection rules to reduce false positives by analyzing alert volumes, cr... |
| 96 | `implementing-siem-use-cases-for-detection` | [`SKILL.md`](skills/security-operations/implementing-siem-use-cases-for-detection/SKILL.md) | L62 | Implements SIEM detection use cases by designing correlation rules, threshold aler... |
| 97 | `implementing-soar-automation-with-phantom` | [`SKILL.md`](skills/security-operations/implementing-soar-automation-with-phantom/SKILL.md) | L52 | Implements Security Orchestration, Automation, and Response (SOAR) workflows using... |
| 98 | `implementing-soar-playbook-for-phishing` | [`SKILL.md`](skills/security-operations/implementing-soar-playbook-for-phishing/SKILL.md) | - | Automate phishing incident response using Splunk SOAR REST API to create container... |
| 99 | `implementing-soar-playbook-with-palo-alto-xsoar` | [`SKILL.md`](skills/security-operations/implementing-soar-playbook-with-palo-alto-xsoar/SKILL.md) | - | Implement automated incident response playbooks in Cortex XSOAR to orchestrate sec... |
| 100 | `implementing-syslog-centralization-with-rsyslog` | [`SKILL.md`](skills/security-operations/implementing-syslog-centralization-with-rsyslog/SKILL.md) | - | Configure rsyslog for centralized log collection with TLS encryption, custom templ... |
| 101 | `mapping-mitre-attack-techniques` | [`SKILL.md`](skills/security-operations/mapping-mitre-attack-techniques/SKILL.md) | L60 | Maps observed adversary behaviors, security alerts, and detection rules to MITRE A... |
| 102 | `performing-alert-triage-with-elastic-siem` | [`SKILL.md`](skills/security-operations/performing-alert-triage-with-elastic-siem/SKILL.md) | - | Perform systematic alert triage in Elastic Security SIEM to rapidly classify, prio... |
| 103 | `performing-false-positive-reduction-in-siem` | [`SKILL.md`](skills/security-operations/performing-false-positive-reduction-in-siem/SKILL.md) | - | Perform systematic SIEM false positive reduction through rule tuning, threshold ad... |
| 104 | `performing-log-source-onboarding-in-siem` | [`SKILL.md`](skills/security-operations/performing-log-source-onboarding-in-siem/SKILL.md) | - | Perform structured log source onboarding into SIEM platforms by configuring collec... |
| 105 | `performing-purple-team-atomic-testing` | [`SKILL.md`](skills/security-operations/performing-purple-team-atomic-testing/SKILL.md) | L69 | Executes Atomic Red Team tests mapped to MITRE ATT&CK techniques, performs coverag... |
| 106 | `performing-purple-team-exercise` | [`SKILL.md`](skills/security-operations/performing-purple-team-exercise/SKILL.md) | L56 | Performs purple team exercises by coordinating red team adversary emulation with b... |
| 107 | `performing-soc-tabletop-exercise` | [`SKILL.md`](skills/security-operations/performing-soc-tabletop-exercise/SKILL.md) | L54 | Performs tabletop exercises for SOC teams simulating security incidents through di... |
| 108 | `performing-threat-emulation-with-atomic-red-team` | [`SKILL.md`](skills/security-operations/performing-threat-emulation-with-atomic-red-team/SKILL.md) | - | Executes Atomic Red Team tests for MITRE ATT&CK technique validation using the ato... |
| 109 | `performing-threat-hunting-with-elastic-siem` | [`SKILL.md`](skills/security-operations/performing-threat-hunting-with-elastic-siem/SKILL.md) | L62 | Performs proactive threat hunting in Elastic Security SIEM using KQL/EQL queries, ... |
| 110 | `performing-threat-hunting-with-yara-rules` | [`SKILL.md`](skills/security-operations/performing-threat-hunting-with-yara-rules/SKILL.md) | L55 | Use YARA pattern-matching rules to hunt for malware, suspicious files, and indicat... |
| 111 | `performing-user-behavior-analytics` | [`SKILL.md`](skills/security-operations/performing-user-behavior-analytics/SKILL.md) | L48 | Performs User and Entity Behavior Analytics (UEBA) to detect anomalous user activi... |
| 112 | `performing-yara-rule-development-for-detection` | [`SKILL.md`](skills/security-operations/performing-yara-rule-development-for-detection/SKILL.md) | L61 | Develop precise YARA rules for malware detection by identifying unique byte patter... |
| 113 | `triaging-security-alerts-in-splunk` | [`SKILL.md`](skills/security-operations/triaging-security-alerts-in-splunk/SKILL.md) | L47 | Triages security alerts in Splunk Enterprise Security by classifying severity, inv... |
| 114 | `triaging-security-incident` | [`SKILL.md`](skills/security-operations/triaging-security-incident/SKILL.md) | L57 | Performs initial triage of security incidents to determine severity, scope, and re... |
| 115 | `triaging-security-incident-with-ir-playbook` | [`SKILL.md`](skills/security-operations/triaging-security-incident-with-ir-playbook/SKILL.md) | L44 | Classify and prioritize security incidents using structured IR playbooks to determ... |

---

## Cloud Security

**Pasta:** `skills/cloud-security/` | **Total:** 98 skills
**Quando usar:** AWS/Azure/GCP, Kubernetes, zero trust, containers, cloud posture, serverless

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `auditing-aws-s3-bucket-permissions` | [`SKILL.md`](skills/cloud-security/auditing-aws-s3-bucket-permissions/SKILL.md) | L47 | Systematically audit AWS S3 bucket permissions to identify publicly accessible buc... |
| 2 | `auditing-cloud-with-cis-benchmarks` | [`SKILL.md`](skills/cloud-security/auditing-cloud-with-cis-benchmarks/SKILL.md) | L50 | This skill details how to conduct cloud security audits using Center for Internet ... |
| 3 | `auditing-kubernetes-cluster-rbac` | [`SKILL.md`](skills/cloud-security/auditing-kubernetes-cluster-rbac/SKILL.md) | L47 | Auditing Kubernetes cluster RBAC configurations to identify overly permissive role... |
| 4 | `auditing-terraform-infrastructure-for-security` | [`SKILL.md`](skills/cloud-security/auditing-terraform-infrastructure-for-security/SKILL.md) | L48 | Auditing Terraform infrastructure-as-code for security misconfigurations using Che... |
| 5 | `conducting-cloud-penetration-testing` | [`SKILL.md`](skills/cloud-security/conducting-cloud-penetration-testing/SKILL.md) | L61 | This skill outlines methodologies for performing authorized penetration testing ag... |
| 6 | `configuring-microsegmentation-for-zero-trust` | [`SKILL.md`](skills/cloud-security/configuring-microsegmentation-for-zero-trust/SKILL.md) | L90 | Configure microsegmentation policies to enforce least-privilege workload-to-worklo... |
| 7 | `configuring-zscaler-private-access-for-ztna` | [`SKILL.md`](skills/cloud-security/configuring-zscaler-private-access-for-ztna/SKILL.md) | L49 | Configuring Zscaler Private Access (ZPA) to replace traditional VPN with zero trus... |
| 8 | `deploying-cloudflare-access-for-zero-trust` | [`SKILL.md`](skills/cloud-security/deploying-cloudflare-access-for-zero-trust/SKILL.md) | L56 | Deploying Cloudflare Access with Cloudflare Tunnel to provide zero trust access to... |
| 9 | `deploying-palo-alto-prisma-access-zero-trust` | [`SKILL.md`](skills/cloud-security/deploying-palo-alto-prisma-access-zero-trust/SKILL.md) | L52 | Deploying Palo Alto Networks Prisma Access for SASE-based zero trust network acces... |
| 10 | `deploying-software-defined-perimeter` | [`SKILL.md`](skills/cloud-security/deploying-software-defined-perimeter/SKILL.md) | L99 | Deploy a Software-Defined Perimeter using the CSA v2.0 specification with Single P... |
| 11 | `deploying-tailscale-for-zero-trust-vpn` | [`SKILL.md`](skills/cloud-security/deploying-tailscale-for-zero-trust-vpn/SKILL.md) | - | Deploy and configure Tailscale as a WireGuard-based zero trust mesh VPN with ident... |
| 12 | `detecting-aws-cloudtrail-anomalies` | [`SKILL.md`](skills/cloud-security/detecting-aws-cloudtrail-anomalies/SKILL.md) | - | Detect unusual API call patterns in AWS CloudTrail logs using boto3, statistical b... |
| 13 | `detecting-aws-credential-exposure-with-trufflehog` | [`SKILL.md`](skills/cloud-security/detecting-aws-credential-exposure-with-trufflehog/SKILL.md) | L46 | Detecting exposed AWS credentials in source code repositories, CI/CD pipelines, an... |
| 14 | `detecting-aws-guardduty-findings-automation` | [`SKILL.md`](skills/cloud-security/detecting-aws-guardduty-findings-automation/SKILL.md) | - | Automate AWS GuardDuty threat detection findings processing using EventBridge and ... |
| 15 | `detecting-aws-iam-privilege-escalation` | [`SKILL.md`](skills/cloud-security/detecting-aws-iam-privilege-escalation/SKILL.md) | - | Detect AWS IAM privilege escalation paths using boto3 and Cloudsplaining policy an... |
| 16 | `detecting-azure-lateral-movement` | [`SKILL.md`](skills/cloud-security/detecting-azure-lateral-movement/SKILL.md) | - | Detect lateral movement in Azure AD/Entra ID environments using Microsoft Graph AP... |
| 17 | `detecting-azure-service-principal-abuse` | [`SKILL.md`](skills/cloud-security/detecting-azure-service-principal-abuse/SKILL.md) | - | Detect and investigate Azure service principal abuse including privilege escalatio... |
| 18 | `detecting-azure-storage-account-misconfigurations` | [`SKILL.md`](skills/cloud-security/detecting-azure-storage-account-misconfigurations/SKILL.md) | - | Audit Azure Blob and ADLS storage accounts for public access exposure, weak or lon... |
| 19 | `detecting-cloud-threats-with-guardduty` | [`SKILL.md`](skills/cloud-security/detecting-cloud-threats-with-guardduty/SKILL.md) | L45 | This skill teaches security teams how to deploy and operationalize Amazon GuardDut... |
| 20 | `detecting-compromised-cloud-credentials` | [`SKILL.md`](skills/cloud-security/detecting-compromised-cloud-credentials/SKILL.md) | L48 | Detecting compromised cloud credentials across AWS, Azure, and GCP by analyzing an... |
| 21 | `detecting-container-drift-at-runtime` | [`SKILL.md`](skills/cloud-security/detecting-container-drift-at-runtime/SKILL.md) | - | Detect unauthorized modifications to running containers by monitoring for binary e... |
| 22 | `detecting-container-escape-attempts` | [`SKILL.md`](skills/cloud-security/detecting-container-escape-attempts/SKILL.md) | L73 | Container escape is a critical attack technique where an adversary breaks out of c... |
| 23 | `detecting-container-escape-with-falco-rules` | [`SKILL.md`](skills/cloud-security/detecting-container-escape-with-falco-rules/SKILL.md) | - | Detect container escape attempts in real-time using Falco runtime security rules t... |
| 24 | `detecting-cryptomining-in-cloud` | [`SKILL.md`](skills/cloud-security/detecting-cryptomining-in-cloud/SKILL.md) | L46 | This skill teaches security teams how to detect and respond to unauthorized crypto... |
| 25 | `detecting-misconfigured-azure-storage` | [`SKILL.md`](skills/cloud-security/detecting-misconfigured-azure-storage/SKILL.md) | L55 | Detecting misconfigured Azure Storage accounts including publicly accessible blob ... |
| 26 | `detecting-privilege-escalation-in-kubernetes-pods` | [`SKILL.md`](skills/cloud-security/detecting-privilege-escalation-in-kubernetes-pods/SKILL.md) | - | Detect and prevent privilege escalation in Kubernetes pods by monitoring security ... |
| 27 | `detecting-s3-data-exfiltration-attempts` | [`SKILL.md`](skills/cloud-security/detecting-s3-data-exfiltration-attempts/SKILL.md) | L48 | Detecting data exfiltration attempts from AWS S3 buckets by analyzing CloudTrail S... |
| 28 | `detecting-serverless-function-injection` | [`SKILL.md`](skills/cloud-security/detecting-serverless-function-injection/SKILL.md) | L51 | Detects and prevents code injection attacks targeting serverless functions (AWS La... |
| 29 | `detecting-shadow-it-cloud-usage` | [`SKILL.md`](skills/cloud-security/detecting-shadow-it-cloud-usage/SKILL.md) | - | Detect unauthorized SaaS and cloud service usage (shadow IT) by analyzing proxy lo... |
| 30 | `hardening-docker-containers-for-production` | [`SKILL.md`](skills/cloud-security/hardening-docker-containers-for-production/SKILL.md) | L65 | Hardening Docker containers for production involves applying security best practic... |
| 31 | `hardening-docker-daemon-configuration` | [`SKILL.md`](skills/cloud-security/hardening-docker-daemon-configuration/SKILL.md) | - | Harden the Docker daemon by configuring daemon.json with user namespace remapping,... |
| 32 | `implementing-aqua-security-for-container-scanning` | [`SKILL.md`](skills/cloud-security/implementing-aqua-security-for-container-scanning/SKILL.md) | - | Deploy Aqua Security's Trivy scanner to detect vulnerabilities, misconfigurations,... |
| 33 | `implementing-aws-config-rules-for-compliance` | [`SKILL.md`](skills/cloud-security/implementing-aws-config-rules-for-compliance/SKILL.md) | L47 | Implementing AWS Config rules for continuous compliance monitoring of AWS resource... |
| 34 | `implementing-aws-iam-permission-boundaries` | [`SKILL.md`](skills/cloud-security/implementing-aws-iam-permission-boundaries/SKILL.md) | L79 | Configure IAM permission boundaries in AWS to delegate role creation to developers... |
| 35 | `implementing-aws-macie-for-data-classification` | [`SKILL.md`](skills/cloud-security/implementing-aws-macie-for-data-classification/SKILL.md) | - | Implement Amazon Macie to automatically discover, classify, and protect sensitive ... |
| 36 | `implementing-aws-nitro-enclave-security` | [`SKILL.md`](skills/cloud-security/implementing-aws-nitro-enclave-security/SKILL.md) | L51 | Implements AWS Nitro Enclave-based confidential computing environments with crypto... |
| 37 | `implementing-aws-security-hub` | [`SKILL.md`](skills/cloud-security/implementing-aws-security-hub/SKILL.md) | L46 | This skill covers deploying AWS Security Hub as a centralized cloud security postu... |
| 38 | `implementing-aws-security-hub-compliance` | [`SKILL.md`](skills/cloud-security/implementing-aws-security-hub-compliance/SKILL.md) | L47 | Implementing AWS Security Hub to aggregate security findings across AWS accounts, ... |
| 39 | `implementing-azure-defender-for-cloud` | [`SKILL.md`](skills/cloud-security/implementing-azure-defender-for-cloud/SKILL.md) | L55 | Implementing Microsoft Defender for Cloud to enable cloud security posture managem... |
| 40 | `implementing-cloud-dlp-for-data-protection` | [`SKILL.md`](skills/cloud-security/implementing-cloud-dlp-for-data-protection/SKILL.md) | L56 | Implementing Cloud Data Loss Prevention (DLP) using Amazon Macie, Azure Informatio... |
| 41 | `implementing-cloud-security-posture-management` | [`SKILL.md`](skills/cloud-security/implementing-cloud-security-posture-management/SKILL.md) | L48 | Implementing Cloud Security Posture Management (CSPM) to continuously monitor mult... |
| 42 | `implementing-cloud-trail-log-analysis` | [`SKILL.md`](skills/cloud-security/implementing-cloud-trail-log-analysis/SKILL.md) | L47 | Implementing AWS CloudTrail log analysis for security monitoring, threat detection... |
| 43 | `implementing-cloud-vulnerability-posture-management` | [`SKILL.md`](skills/cloud-security/implementing-cloud-vulnerability-posture-management/SKILL.md) | - | Implement Cloud Security Posture Management using AWS Security Hub, Azure Defender... |
| 44 | `implementing-cloud-workload-protection` | [`SKILL.md`](skills/cloud-security/implementing-cloud-workload-protection/SKILL.md) | - | Implements cloud workload protection using boto3 and google-cloud APIs for runtime... |
| 45 | `implementing-container-image-minimal-base-with-distroless` | [`SKILL.md`](skills/cloud-security/implementing-container-image-minimal-base-with-distroless/SKILL.md) | - | Reduce container attack surface by building application images on Google distroles... |
| 46 | `implementing-container-network-policies-with-calico` | [`SKILL.md`](skills/cloud-security/implementing-container-network-policies-with-calico/SKILL.md) | - | Enforce Kubernetes network segmentation using Calico CNI network policies and glob... |
| 47 | `implementing-ddos-mitigation-with-cloudflare` | [`SKILL.md`](skills/cloud-security/implementing-ddos-mitigation-with-cloudflare/SKILL.md) | L92 | Configure Cloudflare DDoS protection with managed rulesets, rate limiting, WAF rul... |
| 48 | `implementing-gcp-organization-policy-constraints` | [`SKILL.md`](skills/cloud-security/implementing-gcp-organization-policy-constraints/SKILL.md) | - | Implement GCP Organization Policy constraints to enforce security guardrails acros... |
| 49 | `implementing-gcp-vpc-firewall-rules` | [`SKILL.md`](skills/cloud-security/implementing-gcp-vpc-firewall-rules/SKILL.md) | L47 | Implementing and auditing GCP VPC firewall rules to enforce network segmentation, ... |
| 50 | `implementing-google-workspace-admin-security` | [`SKILL.md`](skills/cloud-security/implementing-google-workspace-admin-security/SKILL.md) | L49 | Implements comprehensive Google Workspace security hardening including admin conso... |
| 51 | `implementing-google-workspace-phishing-protection` | [`SKILL.md`](skills/cloud-security/implementing-google-workspace-phishing-protection/SKILL.md) | L44 | Configure Google Workspace advanced phishing and malware protection settings inclu... |
| 52 | `implementing-kubernetes-network-policy-with-calico` | [`SKILL.md`](skills/cloud-security/implementing-kubernetes-network-policy-with-calico/SKILL.md) | - | Implement Kubernetes network segmentation using Calico NetworkPolicy and GlobalNet... |
| 53 | `implementing-kubernetes-pod-security-standards` | [`SKILL.md`](skills/cloud-security/implementing-kubernetes-pod-security-standards/SKILL.md) | L60 | Pod Security Standards (PSS) define three levels of security policies -- Privilege... |
| 54 | `implementing-network-policies-for-kubernetes` | [`SKILL.md`](skills/cloud-security/implementing-network-policies-for-kubernetes/SKILL.md) | L42 | Kubernetes NetworkPolicies provide pod-level network segmentation by defining ingr... |
| 55 | `implementing-opa-gatekeeper-for-policy-enforcement` | [`SKILL.md`](skills/cloud-security/implementing-opa-gatekeeper-for-policy-enforcement/SKILL.md) | - | Enforce Kubernetes admission policies using OPA Gatekeeper with ConstraintTemplate... |
| 56 | `implementing-pod-security-admission-controller` | [`SKILL.md`](skills/cloud-security/implementing-pod-security-admission-controller/SKILL.md) | - | Implement Kubernetes Pod Security Admission to enforce baseline and restricted sec... |
| 57 | `implementing-policy-as-code-with-open-policy-agent` | [`SKILL.md`](skills/cloud-security/implementing-policy-as-code-with-open-policy-agent/SKILL.md) | L51 | This skill covers implementing Open Policy Agent (OPA) and Gatekeeper for policy-a... |
| 58 | `implementing-rbac-hardening-for-kubernetes` | [`SKILL.md`](skills/cloud-security/implementing-rbac-hardening-for-kubernetes/SKILL.md) | - | Harden Kubernetes Role-Based Access Control by implementing least-privilege polici... |
| 59 | `implementing-runtime-security-with-tetragon` | [`SKILL.md`](skills/cloud-security/implementing-runtime-security-with-tetragon/SKILL.md) | - | Implement eBPF-based runtime security observability and enforcement in Kubernetes ... |
| 60 | `implementing-zero-trust-dns-with-nextdns` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-dns-with-nextdns/SKILL.md) | - | Implement NextDNS as a zero trust DNS filtering layer with encrypted resolution, t... |
| 61 | `implementing-zero-trust-for-saas-applications` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-for-saas-applications/SKILL.md) | L48 | Implementing zero trust access controls for SaaS applications using CASB, SSPM, co... |
| 62 | `implementing-zero-trust-in-cloud` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-in-cloud/SKILL.md) | L46 | This skill guides organizations through implementing zero trust architecture in cl... |
| 63 | `implementing-zero-trust-network-access` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-network-access/SKILL.md) | L47 | Implementing Zero Trust Network Access (ZTNA) in cloud environments by configuring... |
| 64 | `implementing-zero-trust-network-access-with-zscaler` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-network-access-with-zscaler/SKILL.md) | L90 | Implement Zero Trust Network Access using Zscaler Private Access (ZPA) to replace ... |
| 65 | `implementing-zero-trust-with-beyondcorp` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-with-beyondcorp/SKILL.md) | - | Deploy Google BeyondCorp Enterprise zero trust access controls using Identity-Awar... |
| 66 | `implementing-zero-trust-with-hashicorp-boundary` | [`SKILL.md`](skills/cloud-security/implementing-zero-trust-with-hashicorp-boundary/SKILL.md) | - | Implement HashiCorp Boundary for identity-aware zero trust infrastructure access m... |
| 67 | `performing-aws-account-enumeration-with-scout-suite` | [`SKILL.md`](skills/cloud-security/performing-aws-account-enumeration-with-scout-suite/SKILL.md) | - | Perform comprehensive security posture assessment of AWS accounts using ScoutSuite... |
| 68 | `performing-aws-privilege-escalation-assessment` | [`SKILL.md`](skills/cloud-security/performing-aws-privilege-escalation-assessment/SKILL.md) | L48 | Performing authorized privilege escalation assessments in AWS environments to iden... |
| 69 | `performing-cloud-asset-inventory-with-cartography` | [`SKILL.md`](skills/cloud-security/performing-cloud-asset-inventory-with-cartography/SKILL.md) | - | Perform comprehensive cloud asset inventory and relationship mapping using Cartogr... |
| 70 | `performing-cloud-forensics-investigation` | [`SKILL.md`](skills/cloud-security/performing-cloud-forensics-investigation/SKILL.md) | L42 | Conduct forensic investigations in cloud environments by collecting and analyzing ... |
| 71 | `performing-cloud-forensics-with-aws-cloudtrail` | [`SKILL.md`](skills/cloud-security/performing-cloud-forensics-with-aws-cloudtrail/SKILL.md) | L44 | Perform forensic investigation of AWS environments using CloudTrail logs to recons... |
| 72 | `performing-cloud-incident-containment-procedures` | [`SKILL.md`](skills/cloud-security/performing-cloud-incident-containment-procedures/SKILL.md) | - | Execute cloud-native incident containment across AWS, Azure, and GCP by isolating ... |
| 73 | `performing-cloud-log-forensics-with-athena` | [`SKILL.md`](skills/cloud-security/performing-cloud-log-forensics-with-athena/SKILL.md) | - | Uses AWS Athena to query CloudTrail, VPC Flow Logs, S3 access logs, and ALB logs f... |
| 74 | `performing-cloud-native-forensics-with-falco` | [`SKILL.md`](skills/cloud-security/performing-cloud-native-forensics-with-falco/SKILL.md) | - | Uses Falco YAML rules for runtime threat detection in containers and Kubernetes, m... |
| 75 | `performing-cloud-native-threat-hunting-with-aws-detective` | [`SKILL.md`](skills/cloud-security/performing-cloud-native-threat-hunting-with-aws-detective/SKILL.md) | - | Hunt for threats in AWS environments using Detective behavior graphs, entity inves... |
| 76 | `performing-cloud-penetration-testing-with-pacu` | [`SKILL.md`](skills/cloud-security/performing-cloud-penetration-testing-with-pacu/SKILL.md) | L48 | Performing authorized AWS penetration testing using Pacu, the open-source AWS expl... |
| 77 | `performing-cloud-storage-forensic-acquisition` | [`SKILL.md`](skills/cloud-security/performing-cloud-storage-forensic-acquisition/SKILL.md) | - | Perform forensic acquisition and analysis of cloud storage services including Goog... |
| 78 | `performing-container-escape-detection` | [`SKILL.md`](skills/cloud-security/performing-container-escape-detection/SKILL.md) | - | Detects container escape attempts by analyzing namespace configurations, privilege... |
| 79 | `performing-container-image-hardening` | [`SKILL.md`](skills/cloud-security/performing-container-image-hardening/SKILL.md) | L46 | This skill covers hardening container images by minimizing attack surface, removin... |
| 80 | `performing-container-security-scanning-with-trivy` | [`SKILL.md`](skills/cloud-security/performing-container-security-scanning-with-trivy/SKILL.md) | - | Scan container images, filesystems, and Kubernetes manifests for vulnerabilities, ... |
| 81 | `performing-docker-bench-security-assessment` | [`SKILL.md`](skills/cloud-security/performing-docker-bench-security-assessment/SKILL.md) | L42 | Docker Bench for Security is an open-source script that checks dozens of common be... |
| 82 | `performing-gcp-penetration-testing-with-gcpbucketbrute` | [`SKILL.md`](skills/cloud-security/performing-gcp-penetration-testing-with-gcpbucketbrute/SKILL.md) | - | Perform GCP security testing using GCPBucketBrute for storage bucket enumeration, ... |
| 83 | `performing-gcp-security-assessment-with-forseti` | [`SKILL.md`](skills/cloud-security/performing-gcp-security-assessment-with-forseti/SKILL.md) | L57 | Performing comprehensive security assessments of Google Cloud Platform environment... |
| 84 | `performing-kubernetes-cis-benchmark-with-kube-bench` | [`SKILL.md`](skills/cloud-security/performing-kubernetes-cis-benchmark-with-kube-bench/SKILL.md) | - | Audit Kubernetes cluster security posture against CIS benchmarks using kube-bench ... |
| 85 | `performing-kubernetes-etcd-security-assessment` | [`SKILL.md`](skills/cloud-security/performing-kubernetes-etcd-security-assessment/SKILL.md) | - | Assess the security posture of Kubernetes etcd clusters by evaluating encryption a... |
| 86 | `performing-kubernetes-penetration-testing` | [`SKILL.md`](skills/cloud-security/performing-kubernetes-penetration-testing/SKILL.md) | L69 | Kubernetes penetration testing systematically evaluates cluster security by simula... |
| 87 | `remediating-s3-bucket-misconfiguration` | [`SKILL.md`](skills/cloud-security/remediating-s3-bucket-misconfiguration/SKILL.md) | L46 | This skill provides step-by-step procedures for identifying and remediating Amazon... |
| 88 | `scanning-container-images-with-grype` | [`SKILL.md`](skills/cloud-security/scanning-container-images-with-grype/SKILL.md) | - | Scan container images for known vulnerabilities using Anchore Grype with SBOM-base... |
| 89 | `scanning-docker-images-with-trivy` | [`SKILL.md`](skills/cloud-security/scanning-docker-images-with-trivy/SKILL.md) | L73 | Trivy is a comprehensive open-source vulnerability scanner by Aqua Security that d... |
| 90 | `scanning-kubernetes-manifests-with-kubesec` | [`SKILL.md`](skills/cloud-security/scanning-kubernetes-manifests-with-kubesec/SKILL.md) | - | Perform security risk analysis on Kubernetes resource manifests using Kubesec to i... |
| 91 | `securing-aws-iam-permissions` | [`SKILL.md`](skills/cloud-security/securing-aws-iam-permissions/SKILL.md) | L45 | This skill guides practitioners through hardening AWS Identity and Access Manageme... |
| 92 | `securing-aws-lambda-execution-roles` | [`SKILL.md`](skills/cloud-security/securing-aws-lambda-execution-roles/SKILL.md) | L47 | Securing AWS Lambda execution roles by implementing least-privilege IAM policies, ... |
| 93 | `securing-azure-with-microsoft-defender` | [`SKILL.md`](skills/cloud-security/securing-azure-with-microsoft-defender/SKILL.md) | L54 | This skill instructs security practitioners on deploying Microsoft Defender for Cl... |
| 94 | `securing-container-registry-images` | [`SKILL.md`](skills/cloud-security/securing-container-registry-images/SKILL.md) | L48 | Securing container registry images by implementing vulnerability scanning with Tri... |
| 95 | `securing-container-registry-with-harbor` | [`SKILL.md`](skills/cloud-security/securing-container-registry-with-harbor/SKILL.md) | L45 | Harbor is an open-source container registry that provides security features includ... |
| 96 | `securing-helm-chart-deployments` | [`SKILL.md`](skills/cloud-security/securing-helm-chart-deployments/SKILL.md) | - | Secure Helm chart deployments by validating chart integrity, scanning templates fo... |
| 97 | `securing-kubernetes-on-cloud` | [`SKILL.md`](skills/cloud-security/securing-kubernetes-on-cloud/SKILL.md) | L46 | This skill covers hardening managed Kubernetes clusters on EKS, AKS, and GKE by im... |
| 98 | `securing-serverless-functions` | [`SKILL.md`](skills/cloud-security/securing-serverless-functions/SKILL.md) | L46 | This skill covers security hardening for serverless compute platforms including AW... |

---

## Incident Response

**Pasta:** `skills/incident-response/` | **Total:** 62 skills
**Quando usar:** Resposta a incidentes, forense digital, contencao, recuperacao

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `acquiring-disk-image-with-dd-and-dcfldd` | [`SKILL.md`](skills/incident-response/acquiring-disk-image-with-dd-and-dcfldd/SKILL.md) | L41 | Create forensically sound bit-for-bit disk images using dd and dcfldd while preser... |
| 2 | `analyzing-browser-forensics-with-hindsight` | [`SKILL.md`](skills/incident-response/analyzing-browser-forensics-with-hindsight/SKILL.md) | - | Analyze Chromium-based browser artifacts using Hindsight to extract browsing histo... |
| 3 | `analyzing-disk-image-with-autopsy` | [`SKILL.md`](skills/incident-response/analyzing-disk-image-with-autopsy/SKILL.md) | L41 | Perform comprehensive forensic analysis of disk images using Autopsy to recover fi... |
| 4 | `analyzing-docker-container-forensics` | [`SKILL.md`](skills/incident-response/analyzing-docker-container-forensics/SKILL.md) | L41 | Investigate compromised Docker containers by analyzing images, layers, volumes, lo... |
| 5 | `analyzing-linux-system-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-linux-system-artifacts/SKILL.md) | L41 | Examine Linux system artifacts including auth logs, cron jobs, shell history, and ... |
| 6 | `analyzing-lnk-file-and-jump-list-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-lnk-file-and-jump-list-artifacts/SKILL.md) | - | Analyze Windows LNK shortcut files and Jump List artifacts to establish evidence o... |
| 7 | `analyzing-memory-dumps-with-volatility` | [`SKILL.md`](skills/incident-response/analyzing-memory-dumps-with-volatility/SKILL.md) | L53 | Analyzes RAM memory dumps from compromised systems using the Volatility framework ... |
| 8 | `analyzing-memory-forensics-with-lime-and-volatility` | [`SKILL.md`](skills/incident-response/analyzing-memory-forensics-with-lime-and-volatility/SKILL.md) | - | Performs Linux memory acquisition using LiME (Linux Memory Extractor) kernel modul... |
| 9 | `analyzing-mft-for-deleted-file-recovery` | [`SKILL.md`](skills/incident-response/analyzing-mft-for-deleted-file-recovery/SKILL.md) | - | Analyze the NTFS Master File Table ($MFT) to recover metadata and content of delet... |
| 10 | `analyzing-outlook-pst-for-email-forensics` | [`SKILL.md`](skills/incident-response/analyzing-outlook-pst-for-email-forensics/SKILL.md) | - | Analyze Microsoft Outlook PST and OST files for email forensic evidence including ... |
| 11 | `analyzing-prefetch-files-for-execution-history` | [`SKILL.md`](skills/incident-response/analyzing-prefetch-files-for-execution-history/SKILL.md) | L40 | Parse Windows Prefetch files to determine program execution history including run ... |
| 12 | `analyzing-slack-space-and-file-system-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-slack-space-and-file-system-artifacts/SKILL.md) | L42 | Examine file system slack space, MFT entries, USN journal, and alternate data stre... |
| 13 | `analyzing-usb-device-connection-history` | [`SKILL.md`](skills/incident-response/analyzing-usb-device-connection-history/SKILL.md) | L41 | Investigate USB device connection history from Windows registry, event logs, and s... |
| 14 | `analyzing-windows-amcache-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-windows-amcache-artifacts/SKILL.md) | L52 | Parses and analyzes the Windows Amcache.hve registry hive to extract evidence of p... |
| 15 | `analyzing-windows-event-logs-in-splunk` | [`SKILL.md`](skills/incident-response/analyzing-windows-event-logs-in-splunk/SKILL.md) | L53 | Analyzes Windows Security, System, and Sysmon event logs in Splunk to detect authe... |
| 16 | `analyzing-windows-lnk-files-for-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-windows-lnk-files-for-artifacts/SKILL.md) | L40 | Parse Windows LNK shortcut files to extract target paths, timestamps, volume infor... |
| 17 | `analyzing-windows-prefetch-with-python` | [`SKILL.md`](skills/incident-response/analyzing-windows-prefetch-with-python/SKILL.md) | - | Parse Windows Prefetch files using the windowsprefetch Python library to reconstru... |
| 18 | `analyzing-windows-registry-for-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-windows-registry-for-artifacts/SKILL.md) | L40 | Extract and analyze Windows Registry hives to uncover user activity, installed sof... |
| 19 | `analyzing-windows-shellbag-artifacts` | [`SKILL.md`](skills/incident-response/analyzing-windows-shellbag-artifacts/SKILL.md) | - | Analyze Windows Shellbag registry artifacts to reconstruct folder browsing activit... |
| 20 | `building-incident-response-playbook` | [`SKILL.md`](skills/incident-response/building-incident-response-playbook/SKILL.md) | L52 | Designs and documents structured incident response playbooks that define step-by-s... |
| 21 | `building-incident-timeline-with-timesketch` | [`SKILL.md`](skills/incident-response/building-incident-timeline-with-timesketch/SKILL.md) | - | Build collaborative forensic incident timelines using Timesketch to ingest, normal... |
| 22 | `building-malware-incident-communication-template` | [`SKILL.md`](skills/incident-response/building-malware-incident-communication-template/SKILL.md) | - | Build structured communication templates for malware incidents including stakehold... |
| 23 | `building-ransomware-playbook-with-cisa-framework` | [`SKILL.md`](skills/incident-response/building-ransomware-playbook-with-cisa-framework/SKILL.md) | L49 | Builds a structured ransomware incident response playbook aligned with the CISA St... |
| 24 | `collecting-volatile-evidence-from-compromised-host` | [`SKILL.md`](skills/incident-response/collecting-volatile-evidence-from-compromised-host/SKILL.md) | L47 | Collect volatile forensic evidence from a compromised system following order of vo... |
| 25 | `conducting-cloud-incident-response` | [`SKILL.md`](skills/incident-response/conducting-cloud-incident-response/SKILL.md) | L53 | Responds to security incidents in cloud environments (AWS, Azure, GCP) by performi... |
| 26 | `conducting-malware-incident-response` | [`SKILL.md`](skills/incident-response/conducting-malware-incident-response/SKILL.md) | L60 | Responds to malware infections across enterprise endpoints by identifying the malw... |
| 27 | `conducting-memory-forensics-with-volatility` | [`SKILL.md`](skills/incident-response/conducting-memory-forensics-with-volatility/SKILL.md) | L53 | Performs memory forensics analysis using Volatility 3 to extract evidence of malwa... |
| 28 | `conducting-phishing-incident-response` | [`SKILL.md`](skills/incident-response/conducting-phishing-incident-response/SKILL.md) | L53 | Responds to phishing incidents by analyzing reported emails, extracting indicators... |
| 29 | `conducting-post-incident-lessons-learned` | [`SKILL.md`](skills/incident-response/conducting-post-incident-lessons-learned/SKILL.md) | L43 | Facilitate structured post-incident reviews to identify root causes, document what... |
| 30 | `containing-active-breach` | [`SKILL.md`](skills/incident-response/containing-active-breach/SKILL.md) | L53 | Executes containment strategies to stop active adversary operations and prevent la... |
| 31 | `eradicating-malware-from-infected-systems` | [`SKILL.md`](skills/incident-response/eradicating-malware-from-infected-systems/SKILL.md) | L45 | Systematically remove malware, backdoors, and attacker persistence mechanisms from... |
| 32 | `extracting-browser-history-artifacts` | [`SKILL.md`](skills/incident-response/extracting-browser-history-artifacts/SKILL.md) | L42 | Extract and analyze browser history, cookies, cache, downloads, and bookmarks from... |
| 33 | `extracting-memory-artifacts-with-rekall` | [`SKILL.md`](skills/incident-response/extracting-memory-artifacts-with-rekall/SKILL.md) | - | Uses Rekall memory forensics framework to analyze memory dumps for process hollowi... |
| 34 | `extracting-windows-event-logs-artifacts` | [`SKILL.md`](skills/incident-response/extracting-windows-event-logs-artifacts/SKILL.md) | L42 | Extract, parse, and analyze Windows Event Logs (EVTX) using Chainsaw, Hayabusa, an... |
| 35 | `implementing-immutable-backup-with-restic` | [`SKILL.md`](skills/incident-response/implementing-immutable-backup-with-restic/SKILL.md) | L57 | Implements immutable backup strategy using restic with S3-compatible storage and o... |
| 36 | `implementing-ot-incident-response-playbook` | [`SKILL.md`](skills/incident-response/implementing-ot-incident-response-playbook/SKILL.md) | L49 | Develop and implement OT-specific incident response playbooks aligned with SANS PI... |
| 37 | `implementing-ransomware-backup-strategy` | [`SKILL.md`](skills/incident-response/implementing-ransomware-backup-strategy/SKILL.md) | L58 | Designs and implements a ransomware-resilient backup strategy following the 3-2-1-... |
| 38 | `implementing-ticketing-system-for-incidents` | [`SKILL.md`](skills/incident-response/implementing-ticketing-system-for-incidents/SKILL.md) | L49 | Implements an integrated incident ticketing system connecting SIEM alerts to Servi... |
| 39 | `implementing-velociraptor-for-ir-collection` | [`SKILL.md`](skills/incident-response/implementing-velociraptor-for-ir-collection/SKILL.md) | - | Deploy and configure Velociraptor for scalable endpoint forensic artifact collecti... |
| 40 | `investigating-insider-threat-indicators` | [`SKILL.md`](skills/incident-response/investigating-insider-threat-indicators/SKILL.md) | L49 | Investigates insider threat indicators including data exfiltration attempts, unaut... |
| 41 | `investigating-phishing-email-incident` | [`SKILL.md`](skills/incident-response/investigating-phishing-email-incident/SKILL.md) | L52 | Investigates phishing email incidents from initial user report through header anal... |
| 42 | `investigating-ransomware-attack-artifacts` | [`SKILL.md`](skills/incident-response/investigating-ransomware-attack-artifacts/SKILL.md) | L42 | Identify, collect, and analyze ransomware attack artifacts to determine the varian... |
| 43 | `performing-disk-forensics-investigation` | [`SKILL.md`](skills/incident-response/performing-disk-forensics-investigation/SKILL.md) | L53 | Conducts disk forensics investigations using forensic imaging, file system analysi... |
| 44 | `performing-endpoint-forensics-investigation` | [`SKILL.md`](skills/incident-response/performing-endpoint-forensics-investigation/SKILL.md) | L47 | Performs digital forensics investigation on compromised endpoints including memory... |
| 45 | `performing-file-carving-with-foremost` | [`SKILL.md`](skills/incident-response/performing-file-carving-with-foremost/SKILL.md) | L41 | Recover files from disk images and unallocated space using Foremost's header-foote... |
| 46 | `performing-insider-threat-investigation` | [`SKILL.md`](skills/incident-response/performing-insider-threat-investigation/SKILL.md) | L54 | Investigates insider threat incidents involving employees, contractors, or trusted... |
| 47 | `performing-linux-log-forensics-investigation` | [`SKILL.md`](skills/incident-response/performing-linux-log-forensics-investigation/SKILL.md) | - | Perform forensic investigation of Linux system logs including syslog, auth.log, sy... |
| 48 | `performing-log-analysis-for-forensic-investigation` | [`SKILL.md`](skills/incident-response/performing-log-analysis-for-forensic-investigation/SKILL.md) | L41 | Collect, parse, and correlate system, application, and security logs to reconstruc... |
| 49 | `performing-memory-forensics-with-volatility3` | [`SKILL.md`](skills/incident-response/performing-memory-forensics-with-volatility3/SKILL.md) | L41 | Analyze volatile memory dumps using Volatility 3 to extract running processes, net... |
| 50 | `performing-memory-forensics-with-volatility3-plugins` | [`SKILL.md`](skills/incident-response/performing-memory-forensics-with-volatility3-plugins/SKILL.md) | L52 | Analyze memory dumps using Volatility3 plugins to detect injected code, rootkits, ... |
| 51 | `performing-mobile-device-forensics-with-cellebrite` | [`SKILL.md`](skills/incident-response/performing-mobile-device-forensics-with-cellebrite/SKILL.md) | L41 | Acquire and analyze mobile device data using Cellebrite UFED and open-source tools... |
| 52 | `performing-network-forensics-with-wireshark` | [`SKILL.md`](skills/incident-response/performing-network-forensics-with-wireshark/SKILL.md) | L41 | Capture and analyze network traffic using Wireshark and tshark to reconstruct netw... |
| 53 | `performing-ransomware-response` | [`SKILL.md`](skills/incident-response/performing-ransomware-response/SKILL.md) | L54 | Executes a structured ransomware incident response from initial detection through ... |
| 54 | `performing-ransomware-tabletop-exercise` | [`SKILL.md`](skills/incident-response/performing-ransomware-tabletop-exercise/SKILL.md) | L48 | Plans and facilitates tabletop exercises simulating ransomware incidents to test o... |
| 55 | `performing-sqlite-database-forensics` | [`SKILL.md`](skills/incident-response/performing-sqlite-database-forensics/SKILL.md) | - | Perform forensic analysis of SQLite databases to recover deleted records from free... |
| 56 | `performing-timeline-reconstruction-with-plaso` | [`SKILL.md`](skills/incident-response/performing-timeline-reconstruction-with-plaso/SKILL.md) | L41 | Build comprehensive forensic super-timelines using Plaso (log2timeline) to correla... |
| 57 | `recovering-deleted-files-with-photorec` | [`SKILL.md`](skills/incident-response/recovering-deleted-files-with-photorec/SKILL.md) | L49 | Recover deleted files from disk images and storage media using PhotoRec's file sig... |
| 58 | `recovering-from-ransomware-attack` | [`SKILL.md`](skills/incident-response/recovering-from-ransomware-attack/SKILL.md) | L48 | Executes structured recovery from a ransomware incident following NIST and CISA fr... |
| 59 | `testing-ransomware-recovery-procedures` | [`SKILL.md`](skills/incident-response/testing-ransomware-recovery-procedures/SKILL.md) | L45 | Test and validate ransomware recovery procedures including backup restore operatio... |
| 60 | `triaging-security-incident` | [`SKILL.md`](skills/incident-response/triaging-security-incident/SKILL.md) | L57 | Performs initial triage of security incidents to determine severity, scope, and re... |
| 61 | `triaging-security-incident-with-ir-playbook` | [`SKILL.md`](skills/incident-response/triaging-security-incident-with-ir-playbook/SKILL.md) | L44 | Classify and prioritize security incidents using structured IR playbooks to determ... |
| 62 | `validating-backup-integrity-for-recovery` | [`SKILL.md`](skills/incident-response/validating-backup-integrity-for-recovery/SKILL.md) | L44 | Validate backup integrity through cryptographic hash verification, automated resto... |

---

## Threat Intelligence

**Pasta:** `skills/threat-intelligence/` | **Total:** 61 skills
**Quando usar:** IOCs, TTPs, MITRE ATT&CK, threat actors, STIX/TAXII, feeds

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `analyzing-apt-group-with-mitre-navigator` | [`SKILL.md`](skills/threat-intelligence/analyzing-apt-group-with-mitre-navigator/SKILL.md) | L67 | Analyze advanced persistent threat (APT) group techniques using MITRE ATT&CK Navig... |
| 2 | `analyzing-campaign-attribution-evidence` | [`SKILL.md`](skills/threat-intelligence/analyzing-campaign-attribution-evidence/SKILL.md) | L64 | Campaign attribution analysis involves systematically evaluating evidence to deter... |
| 3 | `analyzing-certificate-transparency-for-phishing` | [`SKILL.md`](skills/threat-intelligence/analyzing-certificate-transparency-for-phishing/SKILL.md) | L63 | Monitor Certificate Transparency logs using crt.sh and Certstream to detect phishi... |
| 4 | `analyzing-cobalt-strike-beacon-configuration` | [`SKILL.md`](skills/threat-intelligence/analyzing-cobalt-strike-beacon-configuration/SKILL.md) | L61 | Extract and analyze Cobalt Strike beacon configuration from PE files and memory du... |
| 5 | `analyzing-cobaltstrike-malleable-c2-profiles` | [`SKILL.md`](skills/threat-intelligence/analyzing-cobaltstrike-malleable-c2-profiles/SKILL.md) | - | Parse and analyze Cobalt Strike Malleable C2 profiles using dissect.cobaltstrike a... |
| 6 | `analyzing-command-and-control-communication` | [`SKILL.md`](skills/threat-intelligence/analyzing-command-and-control-communication/SKILL.md) | L48 | Analyzes malware command-and-control (C2) communication protocols to understand be... |
| 7 | `analyzing-cyber-kill-chain` | [`SKILL.md`](skills/threat-intelligence/analyzing-cyber-kill-chain/SKILL.md) | L46 | Analyzes intrusion activity against the Lockheed Martin Cyber Kill Chain framework... |
| 8 | `analyzing-indicators-of-compromise` | [`SKILL.md`](skills/threat-intelligence/analyzing-indicators-of-compromise/SKILL.md) | L49 | Analyzes indicators of compromise (IOCs) including IP addresses, domains, file has... |
| 9 | `analyzing-malicious-url-with-urlscan` | [`SKILL.md`](skills/threat-intelligence/analyzing-malicious-url-with-urlscan/SKILL.md) | L67 | URLScan.io is a free service for scanning and analyzing suspicious URLs. It captur... |
| 10 | `analyzing-malware-family-relationships-with-malpedia` | [`SKILL.md`](skills/threat-intelligence/analyzing-malware-family-relationships-with-malpedia/SKILL.md) | L61 | Use the Malpedia platform and API to research malware family relationships, track ... |
| 11 | `analyzing-network-traffic-for-incidents` | [`SKILL.md`](skills/threat-intelligence/analyzing-network-traffic-for-incidents/SKILL.md) | L53 | Analyzes network traffic captures and flow data to identify adversary activity dur... |
| 12 | `analyzing-ransomware-leak-site-intelligence` | [`SKILL.md`](skills/threat-intelligence/analyzing-ransomware-leak-site-intelligence/SKILL.md) | L61 | Monitor and analyze ransomware group data leak sites (DLS) to track victim posting... |
| 13 | `analyzing-ransomware-network-indicators` | [`SKILL.md`](skills/threat-intelligence/analyzing-ransomware-network-indicators/SKILL.md) | - | Identify ransomware network indicators including C2 beaconing patterns, TOR exit n... |
| 14 | `analyzing-ransomware-payment-wallets` | [`SKILL.md`](skills/threat-intelligence/analyzing-ransomware-payment-wallets/SKILL.md) | L49 | Traces ransomware cryptocurrency payment flows using blockchain analysis tools suc... |
| 15 | `analyzing-threat-actor-ttps-with-mitre-attack` | [`SKILL.md`](skills/threat-intelligence/analyzing-threat-actor-ttps-with-mitre-attack/SKILL.md) | L66 | MITRE ATT&CK is a globally-accessible knowledge base of adversary tactics, techniq... |
| 16 | `analyzing-threat-actor-ttps-with-mitre-navigator` | [`SKILL.md`](skills/threat-intelligence/analyzing-threat-actor-ttps-with-mitre-navigator/SKILL.md) | - | Map advanced persistent threat (APT) group tactics, techniques, and procedures (TT... |
| 17 | `analyzing-threat-intelligence-feeds` | [`SKILL.md`](skills/threat-intelligence/analyzing-threat-intelligence-feeds/SKILL.md) | L49 | Analyzes structured and unstructured threat intelligence feeds to extract actionab... |
| 18 | `analyzing-threat-landscape-with-misp` | [`SKILL.md`](skills/threat-intelligence/analyzing-threat-landscape-with-misp/SKILL.md) | - | Analyze the threat landscape using MISP (Malware Information Sharing Platform) by ... |
| 19 | `analyzing-tls-certificate-transparency-logs` | [`SKILL.md`](skills/threat-intelligence/analyzing-tls-certificate-transparency-logs/SKILL.md) | - | Queries Certificate Transparency logs via crt.sh and pycrtsh to detect phishing do... |
| 20 | `analyzing-typosquatting-domains-with-dnstwist` | [`SKILL.md`](skills/threat-intelligence/analyzing-typosquatting-domains-with-dnstwist/SKILL.md) | L64 | Detect typosquatting, homograph phishing, and brand impersonation domains using dn... |
| 21 | `automating-ioc-enrichment` | [`SKILL.md`](skills/threat-intelligence/automating-ioc-enrichment/SKILL.md) | L49 | Automates the enrichment of raw indicators of compromise with multi-source threat ... |
| 22 | `building-adversary-infrastructure-tracking-system` | [`SKILL.md`](skills/threat-intelligence/building-adversary-infrastructure-tracking-system/SKILL.md) | L61 | Build an automated system to track adversary infrastructure using passive DNS, cer... |
| 23 | `building-attack-pattern-library-from-cti-reports` | [`SKILL.md`](skills/threat-intelligence/building-attack-pattern-library-from-cti-reports/SKILL.md) | L67 | Extract and catalog attack patterns from cyber threat intelligence reports into a ... |
| 24 | `building-ioc-defanging-and-sharing-pipeline` | [`SKILL.md`](skills/threat-intelligence/building-ioc-defanging-and-sharing-pipeline/SKILL.md) | L61 | Build an automated pipeline to defang indicators of compromise (URLs, IPs, domains... |
| 25 | `building-ioc-enrichment-pipeline-with-opencti` | [`SKILL.md`](skills/threat-intelligence/building-ioc-enrichment-pipeline-with-opencti/SKILL.md) | L62 | OpenCTI is an open-source platform for managing cyber threat intelligence knowledg... |
| 26 | `building-threat-actor-profile-from-osint` | [`SKILL.md`](skills/threat-intelligence/building-threat-actor-profile-from-osint/SKILL.md) | L62 | Build comprehensive threat actor profiles using open-source intelligence (OSINT) t... |
| 27 | `building-threat-feed-aggregation-with-misp` | [`SKILL.md`](skills/threat-intelligence/building-threat-feed-aggregation-with-misp/SKILL.md) | L61 | Deploy MISP (Malware Information Sharing Platform) to aggregate, correlate, and di... |
| 28 | `building-threat-hunt-hypothesis-framework` | [`SKILL.md`](skills/threat-intelligence/building-threat-hunt-hypothesis-framework/SKILL.md) | L42 | Build a systematic threat hunt hypothesis framework that transforms threat intelli... |
| 29 | `building-threat-intelligence-enrichment-in-splunk` | [`SKILL.md`](skills/threat-intelligence/building-threat-intelligence-enrichment-in-splunk/SKILL.md) | - | Build automated threat intelligence enrichment pipelines in Splunk Enterprise Secu... |
| 30 | `building-threat-intelligence-feed-integration` | [`SKILL.md`](skills/threat-intelligence/building-threat-intelligence-feed-integration/SKILL.md) | L49 | Builds automated threat intelligence feed integration pipelines connecting STIX/TA... |
| 31 | `building-threat-intelligence-platform` | [`SKILL.md`](skills/threat-intelligence/building-threat-intelligence-platform/SKILL.md) | L64 | Building a Threat Intelligence Platform (TIP) involves deploying and integrating m... |
| 32 | `collecting-indicators-of-compromise` | [`SKILL.md`](skills/threat-intelligence/collecting-indicators-of-compromise/SKILL.md) | L52 | Systematically collects, categorizes, and distributes indicators of compromise (IO... |
| 33 | `collecting-open-source-intelligence` | [`SKILL.md`](skills/threat-intelligence/collecting-open-source-intelligence/SKILL.md) | L48 | Collects and synthesizes open-source intelligence (OSINT) about threat actors, mal... |
| 34 | `collecting-threat-intelligence-with-misp` | [`SKILL.md`](skills/threat-intelligence/collecting-threat-intelligence-with-misp/SKILL.md) | L64 | MISP (Malware Information Sharing Platform) is an open-source threat intelligence ... |
| 35 | `correlating-threat-campaigns` | [`SKILL.md`](skills/threat-intelligence/correlating-threat-campaigns/SKILL.md) | L48 | Correlates disparate security incidents, IOCs, and adversary behaviors across time... |
| 36 | `evaluating-threat-intelligence-platforms` | [`SKILL.md`](skills/threat-intelligence/evaluating-threat-intelligence-platforms/SKILL.md) | L48 | Evaluates and selects Threat Intelligence Platform (TIP) products based on organiz... |
| 37 | `generating-threat-intelligence-reports` | [`SKILL.md`](skills/threat-intelligence/generating-threat-intelligence-reports/SKILL.md) | L47 | Generates structured cyber threat intelligence reports at strategic, operational, ... |
| 38 | `implementing-diamond-model-analysis` | [`SKILL.md`](skills/threat-intelligence/implementing-diamond-model-analysis/SKILL.md) | L66 | The Diamond Model of Intrusion Analysis provides a structured framework for analyz... |
| 39 | `implementing-security-information-sharing-with-stix2` | [`SKILL.md`](skills/threat-intelligence/implementing-security-information-sharing-with-stix2/SKILL.md) | L55 | Create, validate, and share STIX 2.1 threat intelligence objects using the stix2 P... |
| 40 | `implementing-stix-taxii-feed-integration` | [`SKILL.md`](skills/threat-intelligence/implementing-stix-taxii-feed-integration/SKILL.md) | L68 | STIX (Structured Threat Information eXpression) and TAXII (Trusted Automated eXcha... |
| 41 | `implementing-taxii-server-with-opentaxii` | [`SKILL.md`](skills/threat-intelligence/implementing-taxii-server-with-opentaxii/SKILL.md) | L61 | Deploy and configure an OpenTAXII server to share and consume STIX-formatted cyber... |
| 42 | `implementing-threat-intelligence-lifecycle-management` | [`SKILL.md`](skills/threat-intelligence/implementing-threat-intelligence-lifecycle-management/SKILL.md) | L61 | Implement a structured threat intelligence lifecycle encompassing planning, collec... |
| 43 | `implementing-threat-modeling-with-mitre-attack` | [`SKILL.md`](skills/threat-intelligence/implementing-threat-modeling-with-mitre-attack/SKILL.md) | L62 | Implements threat modeling using the MITRE ATT&CK framework to map adversary TTPs ... |
| 44 | `managing-intelligence-lifecycle` | [`SKILL.md`](skills/threat-intelligence/managing-intelligence-lifecycle/SKILL.md) | L46 | Manages the end-to-end cyber threat intelligence lifecycle from planning and direc... |
| 45 | `mapping-mitre-attack-techniques` | [`SKILL.md`](skills/threat-intelligence/mapping-mitre-attack-techniques/SKILL.md) | L60 | Maps observed adversary behaviors, security alerts, and detection rules to MITRE A... |
| 46 | `monitoring-darkweb-sources` | [`SKILL.md`](skills/threat-intelligence/monitoring-darkweb-sources/SKILL.md) | L55 | Monitors dark web forums, marketplaces, paste sites, and ransomware leak sites for... |
| 47 | `performing-ai-driven-osint-correlation` | [`SKILL.md`](skills/threat-intelligence/performing-ai-driven-osint-correlation/SKILL.md) | L63 | Use AI and LLM-based reasoning to correlate findings across multiple OSINT sources... |
| 48 | `performing-brand-monitoring-for-impersonation` | [`SKILL.md`](skills/threat-intelligence/performing-brand-monitoring-for-impersonation/SKILL.md) | L60 | Monitor for brand impersonation attacks across domains, social media, mobile apps,... |
| 49 | `performing-dark-web-monitoring-for-threats` | [`SKILL.md`](skills/threat-intelligence/performing-dark-web-monitoring-for-threats/SKILL.md) | L71 | Dark web monitoring involves systematically scanning Tor hidden services, undergro... |
| 50 | `performing-indicator-lifecycle-management` | [`SKILL.md`](skills/threat-intelligence/performing-indicator-lifecycle-management/SKILL.md) | L65 | Indicator lifecycle management tracks IOCs from initial discovery through validati... |
| 51 | `performing-ioc-enrichment-automation` | [`SKILL.md`](skills/threat-intelligence/performing-ioc-enrichment-automation/SKILL.md) | L48 | Automates Indicator of Compromise (IOC) enrichment by orchestrating lookups across... |
| 52 | `performing-ip-reputation-analysis-with-shodan` | [`SKILL.md`](skills/threat-intelligence/performing-ip-reputation-analysis-with-shodan/SKILL.md) | L61 | Analyze IP address reputation using the Shodan API to identify open ports, running... |
| 53 | `performing-malware-hash-enrichment-with-virustotal` | [`SKILL.md`](skills/threat-intelligence/performing-malware-hash-enrichment-with-virustotal/SKILL.md) | L61 | Enrich malware file hashes using the VirusTotal API to retrieve detection rates, b... |
| 54 | `performing-open-source-intelligence-gathering` | [`SKILL.md`](skills/threat-intelligence/performing-open-source-intelligence-gathering/SKILL.md) | L81 | Open Source Intelligence (OSINT) gathering is the first active phase of a red team... |
| 55 | `performing-osint-with-spiderfoot` | [`SKILL.md`](skills/threat-intelligence/performing-osint-with-spiderfoot/SKILL.md) | - | Automate OSINT collection using SpiderFoot REST API and CLI for target profiling, ... |
| 56 | `performing-paste-site-monitoring-for-credentials` | [`SKILL.md`](skills/threat-intelligence/performing-paste-site-monitoring-for-credentials/SKILL.md) | L60 | Monitor paste sites like Pastebin and GitHub Gists for leaked credentials, API key... |
| 57 | `performing-threat-intelligence-sharing-with-misp` | [`SKILL.md`](skills/threat-intelligence/performing-threat-intelligence-sharing-with-misp/SKILL.md) | - | Use PyMISP to create, enrich, and share threat intelligence events on a MISP platf... |
| 58 | `performing-threat-landscape-assessment-for-sector` | [`SKILL.md`](skills/threat-intelligence/performing-threat-landscape-assessment-for-sector/SKILL.md) | L66 | Conduct a sector-specific threat landscape assessment by analyzing threat actor ta... |
| 59 | `processing-stix-taxii-feeds` | [`SKILL.md`](skills/threat-intelligence/processing-stix-taxii-feeds/SKILL.md) | L46 | Processes STIX 2.1 threat intelligence bundles delivered via TAXII 2.1 servers, no... |
| 60 | `profiling-threat-actor-groups` | [`SKILL.md`](skills/threat-intelligence/profiling-threat-actor-groups/SKILL.md) | L48 | Develops comprehensive threat actor profiles for APT groups, criminal organization... |
| 61 | `tracking-threat-actor-infrastructure` | [`SKILL.md`](skills/threat-intelligence/tracking-threat-actor-infrastructure/SKILL.md) | L65 | Threat actor infrastructure tracking involves monitoring and mapping adversary-con... |

---

## AI Security

**Pasta:** `skills/ai-security/` | **Total:** 5 skills
**Quando usar:** LLMs, prompt injection, deepfakes, guardrails, AI-driven attacks

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `detecting-ai-model-prompt-injection-attacks` | [`SKILL.md`](skills/ai-security/detecting-ai-model-prompt-injection-attacks/SKILL.md) | L67 | Detects prompt injection attacks targeting LLM-based applications using a multi-la... |
| 2 | `detecting-business-email-compromise-with-ai` | [`SKILL.md`](skills/ai-security/detecting-business-email-compromise-with-ai/SKILL.md) | L61 | Deploy AI and NLP-powered detection systems to identify business email compromise ... |
| 3 | `detecting-deepfake-audio-in-vishing-attacks` | [`SKILL.md`](skills/ai-security/detecting-deepfake-audio-in-vishing-attacks/SKILL.md) | L65 | Detects AI-generated deepfake audio used in voice phishing (vishing) attacks by ex... |
| 4 | `implementing-llm-guardrails-for-security` | [`SKILL.md`](skills/ai-security/implementing-llm-guardrails-for-security/SKILL.md) | L68 | Implements input and output validation guardrails for LLM-powered applications to ... |
| 5 | `performing-ai-driven-osint-correlation` | [`SKILL.md`](skills/ai-security/performing-ai-driven-osint-correlation/SKILL.md) | L63 | Use AI and LLM-based reasoning to correlate findings across multiple OSINT sources... |

---

## Code Quality (Refactoring, Architecture, Testing)

**Pasta:** `skills/code-quality/` | **Total:** 30 skills
**Quando usar:** Criptografia, TLS, auditoria de codigo, fuzzing, modelagem de ameacas

| # | Skill | Path | Linha Workflow | Quando usar (resumo) |
|---|---|---|---|---|
| 1 | `configuring-hsm-for-key-storage` | [`SKILL.md`](skills/code-quality/configuring-hsm-for-key-storage/SKILL.md) | - | Hardware Security Modules (HSMs) are tamper-resistant physical devices that safegu... |
| 2 | `configuring-tls-1-3-for-secure-communications` | [`SKILL.md`](skills/code-quality/configuring-tls-1-3-for-secure-communications/SKILL.md) | L76 | TLS 1.3 (RFC 8446) is the latest version of the Transport Layer Security protocol,... |
| 3 | `implementing-aes-encryption-for-data-at-rest` | [`SKILL.md`](skills/code-quality/implementing-aes-encryption-for-data-at-rest/SKILL.md) | L75 | AES (Advanced Encryption Standard) is a symmetric block cipher standardized by NIS... |
| 4 | `implementing-digital-signatures-with-ed25519` | [`SKILL.md`](skills/code-quality/implementing-digital-signatures-with-ed25519/SKILL.md) | - | Ed25519 is a high-performance digital signature algorithm using the Edwards curve ... |
| 5 | `implementing-end-to-end-encryption-for-messaging` | [`SKILL.md`](skills/code-quality/implementing-end-to-end-encryption-for-messaging/SKILL.md) | - | End-to-end encryption (E2EE) ensures that only the communicating parties can read ... |
| 6 | `implementing-epss-score-for-vulnerability-prioritization` | [`SKILL.md`](skills/code-quality/implementing-epss-score-for-vulnerability-prioritization/SKILL.md) | - | Integrate FIRST's Exploit Prediction Scoring System (EPSS) API to prioritize vulne... |
| 7 | `implementing-fuzz-testing-in-cicd-with-aflplusplus` | [`SKILL.md`](skills/code-quality/implementing-fuzz-testing-in-cicd-with-aflplusplus/SKILL.md) | L94 | Integrate AFL++ coverage-guided fuzz testing into CI/CD pipelines to discover memo... |
| 8 | `implementing-gdpr-data-protection-controls` | [`SKILL.md`](skills/code-quality/implementing-gdpr-data-protection-controls/SKILL.md) | L90 | The General Data Protection Regulation (EU) 2016/679 (GDPR) is the EU's comprehens... |
| 9 | `implementing-github-advanced-security-for-code-scanning` | [`SKILL.md`](skills/code-quality/implementing-github-advanced-security-for-code-scanning/SKILL.md) | L62 | Configure GitHub Advanced Security with CodeQL to perform automated static analysi... |
| 10 | `implementing-hashicorp-vault-dynamic-secrets` | [`SKILL.md`](skills/code-quality/implementing-hashicorp-vault-dynamic-secrets/SKILL.md) | L50 | Implements HashiCorp Vault dynamic secrets engines for database credentials, AWS I... |
| 11 | `implementing-memory-protection-with-dep-aslr` | [`SKILL.md`](skills/code-quality/implementing-memory-protection-with-dep-aslr/SKILL.md) | L40 | Implements memory protection mechanisms including DEP (Data Execution Prevention),... |
| 12 | `implementing-pci-dss-compliance-controls` | [`SKILL.md`](skills/code-quality/implementing-pci-dss-compliance-controls/SKILL.md) | L67 | PCI DSS 4.0.1 establishes 12 requirements across 6 control objectives for organiza... |
| 13 | `implementing-security-chaos-engineering` | [`SKILL.md`](skills/code-quality/implementing-security-chaos-engineering/SKILL.md) | - | Implements security chaos engineering experiments that deliberately disable or deg... |
| 14 | `implementing-semgrep-for-custom-sast-rules` | [`SKILL.md`](skills/code-quality/implementing-semgrep-for-custom-sast-rules/SKILL.md) | - | Write custom Semgrep SAST rules in YAML to detect application-specific vulnerabili... |
| 15 | `integrating-dast-with-owasp-zap-in-pipeline` | [`SKILL.md`](skills/code-quality/integrating-dast-with-owasp-zap-in-pipeline/SKILL.md) | L46 | This skill covers integrating OWASP ZAP (Zed Attack Proxy) for Dynamic Application... |
| 16 | `integrating-sast-into-github-actions-pipeline` | [`SKILL.md`](skills/code-quality/integrating-sast-into-github-actions-pipeline/SKILL.md) | L47 | This skill covers integrating Static Application Security Testing (SAST) tools—Cod... |
| 17 | `performing-api-fuzzing-with-restler` | [`SKILL.md`](skills/code-quality/performing-api-fuzzing-with-restler/SKILL.md) | L49 | Uses Microsoft RESTler to perform stateful REST API fuzzing by automatically gener... |
| 18 | `performing-asset-criticality-scoring-for-vulns` | [`SKILL.md`](skills/code-quality/performing-asset-criticality-scoring-for-vulns/SKILL.md) | L77 | Develop and apply a multi-factor asset criticality scoring model to weight vulnera... |
| 19 | `performing-cryptographic-audit-of-application` | [`SKILL.md`](skills/code-quality/performing-cryptographic-audit-of-application/SKILL.md) | - | A cryptographic audit systematically reviews an application's use of cryptographic... |
| 20 | `performing-cve-prioritization-with-kev-catalog` | [`SKILL.md`](skills/code-quality/performing-cve-prioritization-with-kev-catalog/SKILL.md) | L93 | Leverage the CISA Known Exploited Vulnerabilities catalog alongside EPSS and CVSS ... |
| 21 | `performing-fuzzing-with-aflplusplus` | [`SKILL.md`](skills/code-quality/performing-fuzzing-with-aflplusplus/SKILL.md) | - | Perform coverage-guided fuzzing of compiled binaries using AFL++ (American Fuzzy L... |
| 22 | `performing-nist-csf-maturity-assessment` | [`SKILL.md`](skills/code-quality/performing-nist-csf-maturity-assessment/SKILL.md) | L65 | When conducting security assessments that involve performing nist csf maturity ass... |
| 23 | `performing-privacy-impact-assessment` | [`SKILL.md`](skills/code-quality/performing-privacy-impact-assessment/SKILL.md) | - | Automates the Privacy Impact Assessment (PIA) workflow including data flow mapping... |
| 24 | `performing-sca-dependency-scanning-with-snyk` | [`SKILL.md`](skills/code-quality/performing-sca-dependency-scanning-with-snyk/SKILL.md) | L47 | This skill covers implementing Software Composition Analysis (SCA) using Snyk to d... |
| 25 | `performing-soc2-type2-audit-preparation` | [`SKILL.md`](skills/code-quality/performing-soc2-type2-audit-preparation/SKILL.md) | - | Automates SOC 2 Type II audit preparation including gap assessment against AICPA T... |
| 26 | `performing-ssl-certificate-lifecycle-management` | [`SKILL.md`](skills/code-quality/performing-ssl-certificate-lifecycle-management/SKILL.md) | - | SSL/TLS certificate lifecycle management encompasses the full process of requestin... |
| 27 | `performing-ssl-tls-inspection-configuration` | [`SKILL.md`](skills/code-quality/performing-ssl-tls-inspection-configuration/SKILL.md) | L90 | Configure SSL/TLS inspection on network security devices to decrypt, inspect, and ... |
| 28 | `performing-threat-modeling-with-owasp-threat-dragon` | [`SKILL.md`](skills/code-quality/performing-threat-modeling-with-owasp-threat-dragon/SKILL.md) | L81 | Use OWASP Threat Dragon to create data flow diagrams, identify threats using STRID... |
| 29 | `prioritizing-vulnerabilities-with-cvss-scoring` | [`SKILL.md`](skills/code-quality/prioritizing-vulnerabilities-with-cvss-scoring/SKILL.md) | L98 | The Common Vulnerability Scoring System (CVSS) is the industry standard framework ... |
| 30 | `triaging-vulnerabilities-with-ssvc-framework` | [`SKILL.md`](skills/code-quality/triaging-vulnerabilities-with-ssvc-framework/SKILL.md) | L92 | Triage and prioritize vulnerabilities using CISA's Stakeholder-Specific Vulnerabil... |

---

## Como atualizar este indice

1. **Skill do projeto:** adicione linha na tabela superior + atualize `skill.md`.
2. **Skill de seguranca:** coloque a pasta em `skills/<dominio>/` + adicione linha na tabela do dominio.
3. **Intencao nova:** atualize `skill-mapping.md` com o mapeamento de palavras-chave.

> **REGRA FINAL:** Sempre perguntar: existe uma forma mais barata, mais inteligente, mais segura e mais escalavel?
> Se existir: **FAZER MELHOR.**