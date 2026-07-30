# Analytics Admin

PWA externa e independente para monitorar a jornada da landing page BarberFlow. Nesta entrega o
painel opera integralmente em modo DEMO, com dados simulados e sem conexão com Supabase.

## Executar localmente

Na raiz do repositório:

```powershell
node server.js
```

Abra `http://localhost:3000/apps/analytics-admin/`.

Credenciais demonstrativas:

- E-mail: `demo@analytics.local`
- Senha: `analytics-demo`

## Comandos

```powershell
npm --prefix apps/analytics-admin test
npm --prefix apps/analytics-admin run check
npm --prefix apps/analytics-admin run build
```

- `test`: executa os contratos de comportamento, segurança, PWA e integração inativa.
- `check` e `lint`: validam sintaxe, JSON, referências de arquivos e isolamento do modo DEMO.
- `build`: gera a configuração pública e executa a validação estática.

O projeto não possui dependências npm de produção e não requer `npm install`.

## Publicar na Vercel

1. Crie um projeto Vercel separado usando o mesmo repositório.
2. Defina **Root Directory** como `apps/analytics-admin`.
3. Use **Framework Preset** `Other`.
4. Defina **Build Command** como `npm run build`.
5. Defina **Output Directory** como `.`.
6. Na primeira publicação, use `ANALYTICS_ADMIN_MODE=demo`.
7. Não configure as três variáveis do Supabase enquanto o projeto Analytics separado não existir.
8. Valide login, rotas, exportações, instalação e modo offline.
9. Configure `superadmin.barberflow.live` somente após a publicação e a autorização de DNS.

O domínio planejado é `https://superadmin.barberflow.live`; o código não presume que ele já exista.

## Configuração futura

Quando o Supabase Analytics separado estiver pronto:

```text
ANALYTICS_ADMIN_MODE=supabase
ANALYTICS_SUPABASE_URL=
ANALYTICS_SUPABASE_PUBLISHABLE_KEY=
ANALYTICS_COLLECTOR_URL=
```

Nunca envie `SUPABASE_SERVICE_ROLE_KEY` ou `ANALYTICS_HMAC_SECRET` ao navegador ou à Vercel do
frontend. Auth, RLS, Realtime, Presence, CORS definitivo e coleta real permanecem desativados.

## Solução de problemas

- **O painel não entra:** use as credenciais DEMO acima e recarregue a página.
- **A versão antiga continua aberta:** feche as abas do painel e abra novamente; o service worker
  verifica atualizações e troca o cache por versão de build.
- **Offline sem dados:** abra e autentique uma vez online para instalar o shell e salvar o snapshot.
- **Build recusou a configuração:** confirme que o modo `supabase` possui as três variáveis públicas.
- **Dados com aviso offline:** são o último snapshot salvo, não informações em tempo real.

Consulte [ANALYTICS_ADMIN.md](./ANALYTICS_ADMIN.md) para arquitetura, segurança e integração futura.
