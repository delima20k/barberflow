# SKILL 04 — SEGURANÇA: OWASP, AUTH, CRIPTOGRAFIA

> Leia este arquivo para tarefas de segurança: autenticação, autorização, tokens, headers, validação de inputs, criptografia.

---

## 1. REGRAS CRÍTICAS (OWASP TOP 10)

- ✅ Validar **toda** entrada na fronteira do sistema (body, params, query, headers)
- ✅ `sanitizar()` apenas em `innerHTML` — **nunca** em `textContent`
- ✅ Usar prepared statements — nunca concatenar SQL
- ✅ RLS habilitado em todas as tabelas Supabase
- ✅ JWT com expiração de sessão configurada
- ✅ Políticas de menor privilégio — cada role acessa apenas o que precisa
- ✅ CSP e headers de segurança obrigatórios em todas as respostas
- ✅ Validar MIME type e tamanho em todo upload de arquivo
- ✅ Rate limit em endpoints públicos
- ✅ Proteger secrets — nunca expor keys no frontend nem no código-fonte

---

## 2. PROIBIÇÕES DE SEGURANÇA

- ❌ NUNCA confiar no cliente para regras de negócio ou autorização
- ❌ NUNCA salvar senha em texto — sempre hash
- ❌ NUNCA criar criptografia caseira
- ❌ NUNCA usar algoritmos inseguros (MD5, SHA1 para senhas, etc.)
- ❌ NUNCA expor keys, tokens ou secrets no código-fonte

---

## 3. CRIPTOGRAFIA

Usar obrigatoriamente:

| Uso | Solução obrigatória |
|---|---|
| Hashing de senhas | `bcrypt` |
| Operações criptográficas | `crypto.subtle` (Web Crypto API) |
| Tokens de sessão | JWT com expiração configurada |
| Comunicação | HTTPS em todos os ambientes |
| Dados sensíveis P2P | Criptografia ponta a ponta — ver `skill-06-p2p-mensagens.md` |

---

## 4. VALIDAÇÃO DE INPUTS

- Validar tipo, tamanho e formato na fronteira de todo endpoint
- Rejeitar requests com campos inválidos antes de processar qualquer lógica
- Para uploads: validar MIME type real (não apenas extensão) e tamanho máximo
- Inputs de busca/filtro: usar prepared statements ou RLS do Supabase — nunca concatenar strings

---

## 5. HEADERS DE SEGURANÇA (OBRIGATÓRIOS)

Configurar em toda API/BFF:

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: no-referrer
```
