# Auditoria de Segurança — tabela `notifications`
**Data:** 2026-05-23  
**Escopo:** RLS, políticas, triggers, RPCs, código de aplicação. Nenhum arquivo foi alterado.  
**Metodologia:** Leitura completa de todas as migrations relacionadas a `notifications`, código de aplicação
(`shared/js/`, `apps/`, `src/`, `supabase/functions/`) e rollback SQL em `docs/db/`.

---

## 1. Mapeamento das políticas RLS — estado atual (pós-20260522000004)

A migration mais recente (`20260522000004_notifications_rls_security_fix.sql`) substitui todas as
policies anteriores. O estado vigente é:

| Operação | Policy | TO | Condição |
|---|---|---|---|
| SELECT | `notifications_select_own` | `authenticated` | `auth.uid() = user_id AND deleted_at IS NULL` |
| UPDATE | `notifications_update_read_own` | `authenticated` | `auth.uid() = user_id AND deleted_at IS NULL` / `WITH CHECK auth.uid()=user_id` |
| INSERT | **Sem policy RLS** | — | Bloqueado por trigger `trg_notifications_guard_insert` |
| DELETE | `REVOKE ALL FROM anon, authenticated` | — | Bloqueado por trigger `trg_notifications_guard_user_delete` |

**Roles cobertas:**

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` | ❌ bloqueado (TO authenticated) | ❌ bloqueado | ❌ bloqueado | ❌ bloqueado |
| `authenticated` | ✅ próprio user_id, não deletado | ❌ bloqueado via trigger | ✅ somente `is_read/read_at/deleted_at` | ❌ bloqueado via trigger |
| `service_role` | ✅ ignora RLS | ✅ bypassa RLS + guard (auth.role check) | ✅ | ✅ |

**Colunas adicionadas pela migration 20260522:**

| Coluna | Tipo | Função |
|---|---|---|
| `read_at` | `timestamptz` | Soft-read — substitui flag booleana `is_read` |
| `deleted_at` | `timestamptz` | Soft-delete — notificações deletadas ficam invisíveis |

**O que está NULL ou faltando:**

- Não há policy para `anon` — correto (anon não deveria ver notificações de outros).
- Não há UPDATE policy para campos além de `read_at/deleted_at/is_read` — correto (bloqueado pelo trigger `trg_notifications_guard_user_update`).
- Não há política de expiração automática (TTL) — notificações antigas acumulam indefinidamente.
- `notification_rate_limits` e `notification_audit` têm `REVOKE ALL FROM anon, authenticated` mas **não têm RLS policies** — funcionam como black-box para o cliente (correto por design, mas deve ser monitorado).

---

## 2. Histórico de regressões — linha do tempo das policies

| Data | Migration | O que aconteceu |
|---|---|---|
| 2026-04-06 | `20260406000002` | Tabela criada sem RLS |
| 2026-04-11 | `20260411000006` | Primeiro RLS: INSERT `WITH CHECK (true)` — **CRÍTICO** aberto |
| 2026-04-17 | `20260417000002` | INSERT restrito a `service_role OR auth.uid()=user_id` — melhora, mas self-insert ainda libre |
| 2026-04-18 | `20260418000001` | INSERT restrito a `auth.uid()=user_id` (próprio); DELETE adicionado |
| **2026-05-13** | **`20260513000001`** | **REGRESSÃO CRÍTICA**: `WITH CHECK (true)` reintroduzido + `notificar_barbeiro_chegada` sem validação |
| **2026-05-22** | **`20260522000004`** | **Hardening final**: trigger guard, `_insert_validated_notification`, audit, rate limit |

> **Janela de vulnerabilidade ativa confirmada:** 2026-04-11 a 2026-04-18 (8 dias) e novamente
> **2026-05-13 a 2026-05-22 (9 dias)** — qualquer usuário autenticado pôde inserir notifications
> para qualquer `user_id` com qualquer `type`, `title`, `body` e `data` arbitrários.

---

## 3. Mecanismo atual de proteção ao INSERT

### 3.1 Trigger `trg_notifications_guard_insert`

```sql
-- notifications_guard_insert()
IF current_setting('app.notification_insert_allowed', true) = 'on'
   OR auth.role() = 'service_role' THEN
  RETURN NEW;
END IF;
RAISE EXCEPTION 'notification_direct_insert_forbidden' USING ERRCODE = '42501';
```

O INSERT só passa se:
1. A GUC de sessão `app.notification_insert_allowed` for `'on'` (setada por `_insert_validated_notification`)
2. Ou o role for `service_role`

A GUC é setada com `set_config(..., true)` — **transaction-local** — e é zerada ao final da transação. Não há persistência entre requests PostgREST.

### 3.2 Função `_insert_validated_notification()` (SECURITY DEFINER, sem GRANT público)

Ponto único de INSERT seguro. Valida:
1. `p_recipient_id` existe em `profiles.is_active = true`
2. `p_type` é membro do enum `notification_type` (validação por `pg_enum`)
3. `p_payload` tem schema estrito: só chaves `title`, `body`, `data`; `title` 1–160 chars; `body` ≤ 1000 chars; `data` objeto
4. Rate limit: 10 notificações/min por par `(sender_id, recipient_id)` com advisory lock
5. Registra em `notification_audit` com `actor_id`, `source` e timestamp
6. Seta GUC `app.notification_insert_allowed` antes do INSERT

---

## 4. Rastreamento de todos os pontos de INSERT

### Tabela completa de INSERT paths

| # | Quem insere | Função/Trigger | SECURITY DEFINER | Validação | Dados controlados pelo cliente |
|---|---|---|---|---|---|
| P1 | Trigger `trg_notify_queue_on_done` | `fn_notify_queue_clients()` | ✅ sim | via `_insert_validated_notification` | ❌ não — dados da fila no banco |
| P2 | RPC `confirmar_presenca_cliente()` | direta via `_insert_validated_notification` | ✅ sim | entry_id deve pertencer ao `auth.uid()` | Parcial — `client_name` vem do banco |
| P3 | RPC `notificar_barbeiro_chegada()` | direta via `_insert_validated_notification` | ✅ sim | type restrito a 3 valores; entry_id UUID; entry pertence ao auth.uid() | **⚠️ `p_title`, `p_body`, `p_data` são caller-controlled** |
| P4 | RPC `create_notification()` | direta via `_insert_validated_notification` | ✅ sim | authenticated: `p_recipient_id = auth.uid()` obrigatório | Parcial — tipo restrito ao enum; payload validado |
| P5 | Edge Function `send-push` | sem INSERT em `notifications` | N/A | N/A | N/A — apenas Web Push, sem gravar na tabela |
| P6 | `NotificationService.js` (frontend) | sem INSERT (só UPDATE `read_at`) | N/A | N/A | N/A |

### Detalhe de cada ponto

#### P1 — `fn_notify_queue_clients()` (trigger SECURITY DEFINER)
- **Disparado por:** UPDATE de `status → 'done'` em `queue_entries`
- **Insere para:** todos os clientes com `status='waiting'` no mesmo `barbershop_id` + o `professional_id`
- **Dados de entrada:** exclusivamente da própria tabela `queue_entries` — zero input do usuário
- **Versão atual (20260522):** usa `_insert_validated_notification` com `p_apply_rate_limit=false` (correto: é trigger de sistema)
- **Risco:** ✅ baixo — dados do banco, sem influência do cliente

#### P2 — `confirmar_presenca_cliente(p_entry_id, p_confirmado, p_grace_used)` (RPC autenticado)
- **Chamado por:** `CadeiraConfirmacaoService.js` (app profissional) via `ApiService.rpc()`
- **Valida:** `qe.client_id = auth.uid()` AND `qe.status = 'in_service'`
- **Dados de entrada:** `entry_id`, `confirmado`, `grace_used` — valores booleanos e UUID
- **Nome do cliente:** buscado do banco via `JOIN profiles` — não vem do caller
- **Risco:** ✅ baixo — controle efetivo de ownership

#### P3 — `notificar_barbeiro_chegada(p_professional_id, p_type, p_title, p_body, p_data)` (RPC autenticado)
- **Chamado por:** `FilaPresencaService.js` e `ChegadaProducaoService.js` via `ApiService.rpc()`
- **Valida:** type in enum, entry_id UUID format, entry pertence ao `auth.uid()` + professional
- **⚠️ VETOR ATIVO:** `p_title` e `p_body` são passados pelo cliente e armazenados na notificação do barbeiro, limitados a 160/1000 chars mas com conteúdo livre
- **`p_data`:** passado pelo cliente como JSON — validado como objeto, sem schema por tipo

#### P4 — `create_notification(p_recipient_id, p_type, p_payload)` (RPC autenticado + service_role)
- **Para authenticated:** `p_recipient_id MUST = auth.uid()` — somente auto-notificações
- **Para service_role:** sem restrição de recipient
- **Risco:** ✅ baixo para authenticated (self-only); service_role implica confiança total

---

## 5. Vetores de abuso — simulação

### V1 — INSERT irrestrito por usuário autenticado → `CRÍTICO (HISTÓRICO, corrigido)`

**Pergunta:** Um usuário autenticado consegue INSERT de notification com `recipient = outro usuário`?

**Resposta:** **Sim, conseguiu — janelas de vulnerabilidade confirmadas:**
- 2026-04-11 a 2026-04-18 (`WITH CHECK (true)` inicial)
- 2026-05-13 a 2026-05-22 (`WITH CHECK (true)` reintroduzido em 20260513)

**Estado atual (pós-20260522):** Bloqueado pelo trigger `trg_notifications_guard_insert`. Tentativa de INSERT direto via PostgREST retorna SQLSTATE `42501` (`notification_direct_insert_forbidden`).

**Evidência da regressão:**
```sql
-- 20260513000001_notificar_barbeiro_rpc.sql (linha 18-24)
CREATE POLICY "notifications_insert_service"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);  -- ← reintroduz vulnerabilidade crítica intencionalmente
```
Comentário no arquivo: `"1. Cria política INSERT permissiva (autenticados) como fallback"` — decisão incorreta de segurança que re-abriu o vetor.

---

### V2 — INSERT com `type` ou `payload` arbitrários → `ALTO (ATIVO)`

**Pergunta:** Consegue INSERT com `type` ou `payload` arbitrários?

**Resposta:** **Parcialmente sim, via `notificar_barbeiro_chegada()`.**

O cliente chama:
```js
// FilaPresencaService.js:218
await ApiService.rpc('notificar_barbeiro_chegada', {
  p_professional_id: professionalId,
  p_type:            type,
  p_title,           // ← controlado pelo código do cliente
  p_body,            // ← controlado pelo código do cliente
  p_data,            // ← JSON controlado pelo código do cliente
});
```

O que o atacante pode fazer:
1. Modificar a chamada JS diretamente no browser (DevTools / proxy)
2. Enviar `p_title = "URGENTE: clique em barberflow-fake.com"` de até 160 chars
3. Enviar `p_body` com texto de phishing de até 1000 chars
4. Enviar `p_data` com JSON arbitrário (objeto, qualquer chave)

**Limitações da proteção atual:**
- `p_type` é validado contra enum — só 3 valores aceitos ✅
- Tamanho limitado: title ≤ 160, body ≤ 1000 ✅
- Rate limit: 10/min por par ✅
- Mas: **conteúdo livre dentro dos limites de tamanho** ⚠️

**Impacto:** Barbeiro recebe notificação com conteúdo de phishing no app profissional. `NotificationService.js:492` exibe `notif.titulo` e `notif.body` via `#escapar()` (evita XSS), mas o texto em si é attacker-controlled.

---

### V3 — INSERT em volume sem throttle → `MÉDIO (ATIVO)`

**Pergunta:** Consegue INSERT em volume sem throttle?

**Resposta:** **Sim, para múltiplos destinatários distintos.**

O rate limit atual (`notification_rate_limits`) é **por par `(sender_id, recipient_id)`** — 10/min. Um atacante pode:
1. Encontrar/enumerar UUIDs de profissionais (tabela `professionals` tem SELECT público para autenticados)
2. Chamar `notificar_barbeiro_chegada()` uma vez por profissional, cada chamada dentro do limite do par
3. Com 100 profissionais → 100 notificações por minuto de conteúdo arbitrário

Não há limite global de notificações enviadas por um `sender_id` em um período.

---

### V4 — Endpoint da aplicação aceita dados do cliente para INSERT direto → `ALTO (ATIVO via RPC)`

**Pergunta:** Algum endpoint aceita dados do cliente e faz INSERT direto?

**Resposta:** Sim — `notificar_barbeiro_chegada()` é uma RPC com `GRANT EXECUTE TO authenticated` que aceita `p_title`, `p_body`, `p_data` sem filtro de conteúdo. O INSERT é protegido (via `_insert_validated_notification`), mas o **conteúdo da notificação é attacker-controlled**.

O `FilaPresencaService.js` e `ChegadaProducaoService.js` no frontend constroem os parâmetros a partir de variáveis locais — mas qualquer usuário com acesso à RPC pode chamar com valores arbitrários.

---

### V5 — SECURITY DEFINER sem validação bypassa RLS → `MÉDIO (HISTÓRICO, parcialmente corrigido)`

**Pergunta:** Alguma RPC tem SECURITY DEFINER que bypassa RLS sem validação?

**Resposta:** Sim — na versão anterior (migration 20260513). A função `notificar_barbeiro_chegada` anterior era:

```sql
-- 20260513000001 (versão vulnerável — substituída em 20260522)
CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_data JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_professional_id IS NULL THEN RETURN; END IF;
  -- ← NENHUMA validação de type, entry_id, ownership
  INSERT INTO public.notifications (...) VALUES (p_professional_id, p_type, p_title, ...);
END;
$$;
GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(...) TO authenticated;
```

Essa versão permitia:
- `p_type` = qualquer string (não validado)
- `p_professional_id` = qualquer UUID (sem verificar que o caller tem relação)
- `p_title`, `p_body`, `p_data` = livres
- Notificações para qualquer `professional_id` — sem verificar que o cliente está na fila do profissional

**Estado atual (pós-20260522):** A função foi reescrita com validação de ownership via `queue_entries`. ✅

---

### V6 — Soft-delete bypass → `BAIXO (ATIVO)`

**Pergunta:** Usuário pode "deletar" notificações via UPDATE de `deleted_at`?

**Resposta:** Sim, tecnicamente — a policy `notifications_update_read_own` permite UPDATE para authenticated quando `auth.uid() = user_id`. O trigger `trg_notifications_guard_user_update` permite apenas mudanças em `is_read`, `read_at`, `deleted_at`. Isso inclui `deleted_at`, portanto o usuário **pode soft-deletar suas próprias notificações**, o que é o comportamento esperado.

O risco residual: um usuário pode soft-deletar notificações legítimas (próprias) antes de uma auditoria. Porém `notification_audit` guarda o registro independentemente.

---

### V7 — `send-push` Edge Function sem validação de vínculo → `MÉDIO (ATIVO)`

**Pergunta:** A Edge Function `send-push` tem controle de acesso adequado?

**Resposta:** Não completamente. A função:
1. Autentica o caller como barbeiro válido ✅
2. Aceita `clientId` no body
3. **Não valida que existe uma entrada ativa de fila ligando esse barbeiro a esse cliente**

Um barbeiro mal-intencionado com o UUID de qualquer cliente pode enviar o push hardcoded `"Você foi chamado! ✂️ — O barbeiro está te esperando na cadeira."` para esse cliente indefinidamente, se souber o UUID.

**Mitigações parciais:**
- A mensagem é hardcoded — sem controle de conteúdo
- O UUID do cliente não é facilmente enumerável (UUID v4 aleatório)
- Não há rate limiting na função

**Impacto:** Harassment/DoS via notificações push no browser do cliente.

---

## 6. Classificação por severidade — ordenado por impacto

| # | Vetor | Severidade | Estado | Localização |
|---|---|---|---|---|
| V1 | INSERT irrestrito `WITH CHECK (true)` em 2 janelas | **CRÍTICO** | Corrigido (20260522) | `20260411`, `20260513` |
| V2 | `notificar_barbeiro_chegada` — `p_title/body/data` attacker-controlled | **ALTO** | **Ativo** | `20260522000004`, L.396–444 |
| V4 | Conteúdo de notificação controlado pelo cliente via RPC | **ALTO** | **Ativo** (mesmo vetor que V2) | `FilaPresencaService.js:218`, `ChegadaProducaoService.js:306` |
| V5 | `notificar_barbeiro_chegada` antiga sem validação de ownership/type | **ALTO** | Corrigido (20260522) | `20260513000001` |
| V3 | Rate limit por par, não global — flood entre múltiplos recipients | **MÉDIO** | **Ativo** | `_insert_validated_notification` L.261–298 |
| V7 | `send-push` sem validação de vínculo caller↔clientId | **MÉDIO** | **Ativo** | `supabase/functions/send-push/index.ts:277` |
| V-histórico | Janela 2026-05-13–2026-05-22: notificações spam persistidas no banco | **MÉDIO** | Requer auditoria de dados | `notifications` tabela |
| V6 | Soft-delete das próprias notificações — auditoria possível em `notification_audit` | **BAIXO** | Ativo (by design) | trigger `trg_notifications_guard_user_update` |
| V8 | `app.notification_insert_allowed` GUC não registrado como custom_variable_classes | **BAIXO** | **Ativo** | `20260522000004`, L.81–95 |
| V9 | Campo `data` jsonb sem schema por `type` — payload livre dentro do objeto | **BAIXO** | **Ativo** | `notifications.data`, `_insert_validated_notification` |

---

## 7. Fix mínimo para o vetor mais crítico ativo (V2)

O vetor **ALTO** ativo é `notificar_barbeiro_chegada()` com `p_title/body/data` controlados pelo cliente.

**Fix mínimo (sem reescrever a arquitetura):**

```sql
-- Migration proposta: 20260524_fix_notificar_barbeiro_title_body.sql
-- Objetivo: remover controle de p_title/p_body/p_data pelo cliente.
-- O conteúdo da notificação passa a ser determinado pelo tipo, com o nome
-- do cliente lido diretamente do banco (não recebido do caller).

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
  p_type            text,
  p_title           text,   -- mantido na assinatura para compatibilidade, mas IGNORADO
  p_body            text,   -- mantido na assinatura para compatibilidade, mas IGNORADO
  p_data            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id    uuid;
  v_client_name text;
  v_title       text;
  v_body        text;
BEGIN
  -- Validações mantidas da versão atual
  IF p_type NOT IN ('client_at_shop', 'client_arriving_late', 'client_not_seated')
     OR p_data IS NULL
     OR jsonb_typeof(p_data) <> 'object'
     OR COALESCE(p_data->>'entry_id', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'notification_queue_payload_invalid' USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := (p_data->>'entry_id')::uuid;

  -- Busca nome do cliente do banco (não aceita do caller)
  SELECT p.full_name
  INTO   v_client_name
  FROM   public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE  qe.id = v_entry_id
    AND  qe.client_id = auth.uid()
    AND  qe.professional_id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_queue_recipient_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Título e corpo derivados do banco — p_title/p_body do caller são IGNORADOS
  v_client_name := COALESCE(v_client_name, 'Cliente');
  v_title := CASE p_type
    WHEN 'client_at_shop'       THEN 'Cliente na barbearia'
    WHEN 'client_arriving_late' THEN 'Cliente a caminho'
    WHEN 'client_not_seated'    THEN 'Cliente ainda nao esta pronto'
  END;
  v_body := CASE p_type
    WHEN 'client_at_shop'       THEN v_client_name || ' confirmou que esta na barbearia.'
    WHEN 'client_arriving_late' THEN v_client_name || ' ainda nao chegou. Aguardando...'
    WHEN 'client_not_seated'    THEN v_client_name || ' avisou que ainda nao esta sentado.'
  END;

  PERFORM public._insert_validated_notification(
    p_professional_id,
    auth.uid(),
    p_type,
    jsonb_build_object('title', v_title, 'body', v_body, 'data', p_data),
    'notificar_barbeiro_chegada',
    true
  );
END;
$$;
```

**Impacto do fix:**
- Zero breaking change na assinatura — `FilaPresencaService.js` e `ChegadaProducaoService.js` continuam chamando com os mesmos parâmetros
- `p_title` e `p_body` passam a ser ignorados silenciosamente
- Conteúdo da notificação passa a ser fixo por `p_type`, com nome do cliente vindo do banco
- `p_data` continua sendo aceito para metadados internos (`entry_id`, `barbershop_id`, etc.) — sem exibição direta ao usuário

---

## 8. Decisões necessárias (input humano obrigatório antes do fix)

| # | Decisão | Por que bloqueia |
|---|---|---|
| D1 | **`p_data` de `notificar_barbeiro_chegada` deve ser aceito do caller?** | O campo `data` da notificação pode conter chaves usadas pelo frontend (`tipo_acao`, `entry_id`, etc.). Se `p_data` for completamente ignorado, o frontend pode parar de funcionar. Se for aceito, o attacker controla metadados da notificação. Opção intermediária: allowlist de chaves permitidas em `p_data` por `p_type`. |
| D2 | **Aplicar rate limit global por sender além do rate limit por par?** | Bloqueia V3. Define quanto um atacante pode spamear N profissionais por minuto. Requer definição de limite (ex: 30 notificações/min por sender independente de recipient). |
| D3 | **`send-push` deve validar vínculo queue_entry entre caller e clientId?** | Bloqueia V7. Requer JOIN em `queue_entries` na Edge Function. Define o que conta como "vínculo válido" (apenas in_service? waiting também?). |
| D4 | **Auditoria de dados das janelas de vulnerabilidade** | Exige query nas colunas `created_at` de `notifications` filtrando o período 2026-04-11 a 2026-04-18 e 2026-05-13 a 2026-05-22, checando `user_id ≠ insersor` (dados da `notification_audit` não cobrem o período histórico — a tabela foi criada em 20260522). Decisão: deletar notificações suspeitas? Escopo da investigação? |
| D5 | **Registrar `app.notification_insert_allowed` como `custom_variable_classes` no Supabase?** | Bloqueia V8 preventivamente. Requer acesso ao `postgresql.conf` do Supabase (apenas via suporte Supabase Pro/Enterprise) ou usar variável de sessão alternativa dentro de namespace controlado. |
| D6 | **Schema de `data` por `notification_type`?** | Bloqueia V9. Define se cada tipo de notificação deve validar as chaves do `data` jsonb. Impacta `_insert_validated_notification` e todos os callers. |

---

## 9. Estado atual — sumário executivo

**O que está seguro hoje:**
- DELETE por usuário autenticado: bloqueado via REVOKE + trigger
- INSERT direto por autenticado: bloqueado via trigger guard
- INSERT para outro `user_id` via PostgREST: bloqueado
- Overflow de tipo: `notification_type` enum valida via `pg_enum`
- Audit trail: `notification_audit` registra todo INSERT via `_insert_validated_notification`
- Rate limit por par: 10/min com advisory lock (anti-concurrent-flood)

**O que ainda é vetor ativo:**
- `p_title/p_body` de `notificar_barbeiro_chegada` são attacker-controlled (**V2/V4 — ALTO**)
- Rate limit por par, não global (**V3 — MÉDIO**)
- `send-push` sem validação de vínculo (**V7 — MÉDIO**)
- Dados do período de regressão não foram auditados (**V-histórico — MÉDIO**)

**Fix urgente (não requer decisão humana):** aplicar a migration proposta na Seção 7 para bloquear V2/V4 imediatamente.

---

*Auditoria estática — nenhum código ou schema foi alterado. Rastreabilidade: todas as evidências citadas com arquivo e linhas.*
