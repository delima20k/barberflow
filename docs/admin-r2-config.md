# Guia — Painel Admin: Configuração do Cloudflare R2

## Índice

1. [Como adicionar administradores](#1-como-adicionar-administradores)
2. [Como desativar ou remover administradores](#2-como-desativar-ou-remover-administradores)
3. [Como configurar o Cloudflare R2](#3-como-configurar-o-cloudflare-r2)
4. [Como trocar credenciais](#4-como-trocar-credenciais)
5. [Como testar a conexão](#5-como-testar-a-conexão)
6. [Como restaurar configurações](#6-como-restaurar-configurações)
7. [Como gerar ADMIN_ENCRYPT_KEY](#7-como-gerar-admin_encrypt_key)

---

## 1. Como adicionar administradores

### Pré-requisito

O usuário deve ter uma conta ativa no Supabase Auth (já ter feito login no BarberFlow pelo menos uma vez).

### Passo 1 — Obter o `user_id`

No **Supabase Dashboard → Authentication → Users**, localize o usuário pelo e-mail e copie o `UUID` da coluna `id`.

### Passo 2 — Inserir na tabela `admin_users`

No **Supabase Dashboard → SQL Editor**, execute:

```sql
INSERT INTO public.admin_users (user_id, email, active)
VALUES (
  'COLE_O_UUID_AQUI',      -- UUID do usuário em auth.users
  'admin@seudominio.com',  -- e-mail do usuário
  true
);
```

> **Atenção:** O `email` deve ser idêntico ao cadastrado no Supabase Auth. A verificação é dupla (user_id + email) para evitar acesso indevido.

### Verificação

```sql
SELECT * FROM public.admin_users WHERE active = true;
```

---

## 2. Como desativar ou remover administradores

### Desativar (acesso revogado, registro mantido)

```sql
UPDATE public.admin_users
SET active = false
WHERE email = 'admin@seudominio.com';
```

### Remover completamente

```sql
DELETE FROM public.admin_users
WHERE email = 'admin@seudominio.com';
```

---

## 3. Como configurar o Cloudflare R2

### Pré-requisitos

1. Conta Cloudflare com R2 habilitado
2. Bucket R2 criado
3. API Token R2 com permissões: `Object Read`, `Object Write`, `Object Delete`
4. `ADMIN_ENCRYPT_KEY` definida no `.env` do BFF (ver [seção 7](#7-como-gerar-admin_encrypt_key))
5. Usuário em `admin_users` (ver [seção 1](#1-como-adicionar-administradores))

### Passo a passo

1. Acesse `admin.html` no navegador
2. No menu lateral, clique em **⚙️ Configurações**
3. Faça login com e-mail e senha do Supabase (o mesmo usado no BarberFlow)
4. Preencha os campos:

| Campo | Onde encontrar |
|---|---|
| **Account ID** | Cloudflare Dashboard → R2 → canto direito superior |
| **Access Key ID** | Cloudflare Dashboard → R2 → Manage API tokens → Create token |
| **Secret Access Key** | Gerado junto com o Access Key ID (salvar no momento da criação) |
| **Bucket Name** | Nome do bucket R2 criado |
| **Public URL** | Cloudflare R2 → bucket → Settings → Public Access → Domain |
| **Media Confirm Secret** | Clique em "Gerar automaticamente" ou insira uma string aleatória segura |
| **Storage Backend** | Selecione `r2 (Cloudflare R2)` |

5. Clique em **Salvar**
6. Clique em **Testar Conexão** para verificar

---

## 4. Como trocar credenciais

1. Acesse `admin.html` → **⚙️ Configurações**
2. Faça login (se necessário)
3. Os campos sensíveis (Secret Access Key, Media Confirm Secret) aparecem com placeholder `(salvo — campo oculto por segurança)`
4. **Para atualizar um campo:** digite o novo valor no campo desejado
5. **Campos em branco** não são alterados — apenas campos preenchidos são salvos
6. Clique em **Salvar**
7. Clique em **Testar Conexão** para confirmar

> **Atenção:** A Secret Access Key nunca é exibida após ser salva. Se precisar visualizá-la, acesse diretamente o Cloudflare Dashboard.

---

## 5. Como testar a conexão

O botão **Testar Conexão** executa três operações no bucket:

1. **Upload** — cria um arquivo temporário `barberflow-admin-test-{uuid}.txt`
2. **Verificação** — confirma que o arquivo existe (HeadObject)
3. **Deleção** — remove o arquivo de teste imediatamente

### Resultado esperado

```
✓ Upload: permissão de escrita OK
✓ HeadObject: leitura de metadados OK
✓ Delete: permissão de exclusão OK
```

### Erros comuns

| Erro | Causa provável |
|---|---|
| `InvalidAccessKeyId` | Access Key ID incorreto |
| `SignatureDoesNotMatch` | Secret Access Key incorreto |
| `NoSuchBucket` | Bucket Name incorreto |
| `Access Denied` | API Token sem permissão de escrita/leitura |
| `Credenciais incompletas` | Um ou mais campos obrigatórios não foram salvos |

---

## 6. Como restaurar configurações

### Via painel admin

Acesse novamente o painel, preencha os campos e clique em **Salvar**.

### Via banco de dados (emergência)

Se o painel estiver inacessível, use o **Supabase SQL Editor** com a chave `service_role`:

```sql
-- Ver chaves existentes (valores são criptografados)
SELECT key, created_at, updated_at FROM public.system_config;

-- Remover uma chave específica (será recriada ao salvar via painel)
DELETE FROM public.system_config WHERE key = 'r2.secret_access_key';

-- Remover todas as configurações R2
DELETE FROM public.system_config
WHERE key IN (
  'r2.account_id',
  'r2.access_key_id',
  'r2.secret_access_key',
  'r2.bucket_name',
  'r2.public_url',
  'media.confirm_secret',
  'storage.backend'
);
```

> **Nota:** Os valores em `system_config` são armazenados criptografados. Não é possível ler o valor real diretamente pelo SQL — apenas através do BFF com a `ADMIN_ENCRYPT_KEY`.

### Fallback via `.env`

O BFF também lê as variáveis de ambiente diretamente. Se o banco estiver inacessível, defina as variáveis no `.env`:

```env
R2_ACCOUNT_ID=seu_account_id
R2_ACCESS_KEY_ID=seu_access_key
R2_SECRET_ACCESS_KEY=sua_secret_key
R2_BUCKET_NAME=nome_do_bucket
R2_PUBLIC_URL=https://pub-xxx.r2.dev
MEDIA_CONFIRM_SECRET=sua_secret_hmac
STORIES_STORAGE_BACKEND=r2
```

---

## 7. Como gerar ADMIN_ENCRYPT_KEY

A `ADMIN_ENCRYPT_KEY` é uma chave AES-256-GCM de 32 bytes, representada como 64 caracteres hexadecimais. É usada para criptografar as credenciais armazenadas no banco.

### Gerar via Node.js

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Exemplo de saída:
```
a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### Configurar no BFF

No arquivo `.env` do BFF:

```env
ADMIN_ENCRYPT_KEY=a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### Atenção

- **Nunca perca esta chave.** Sem ela, os valores criptografados no banco são irrecuperáveis.
- **Nunca commite esta chave** no repositório.
- Em produção, use variáveis de ambiente seguras (Vercel Secrets, Railway Variables, etc.).
- Se trocar a chave, todos os valores no banco precisam ser reconfigurados via painel.

---

## Arquitetura de Segurança

| Camada | Implementação |
|---|---|
| **Transporte** | HTTPS (obrigatório em produção) |
| **Autenticação** | JWT Supabase + tabela `admin_users` |
| **Autorização** | `active = true` + verificação user_id + email |
| **Criptografia em repouso** | AES-256-GCM, IV único por registro |
| **Chave de criptografia** | `ADMIN_ENCRYPT_KEY` — fora do banco, via env var |
| **Secrets na API** | Retornados sempre como `***` após o primeiro save |
| **Logs** | Valores de credenciais nunca são registrados |
| **RLS banco** | `system_config` e `admin_users` sem policies públicas |
