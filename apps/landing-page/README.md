# BarberFlow Landing Page

Landing page estatica e independente para campanhas de trafego pago do BarberFlow.

## Objetivo

Apresentar o BarberFlow como sistema de organizacao de fila em tempo real para
barbearias que trabalham por ordem de chegada. A pagina conduz o visitante pelo
problema, consequencias, solucao, funcionalidades, demonstracao, beneficios,
primeiros passos e oferta condicional da campanha.

## Narrativa implementada

- Cabecalho com atalhos para funcionamento, funcionalidades, beneficios e duvidas
- Hero com foco em fila por ordem de chegada e CTAs para teste e funcionamento
- Cinco cenarios comuns de uma fila administrada por mensagens
- Apresentacao do BarberFlow como fluxo de fila em tempo real
- Oito funcionalidades ligadas a operacao e a presenca online
- Demonstracao com carrossel dinamico de doze funcionalidades e player de video configuravel
- Quatro beneficios praticos e cinco passos para comecar
- Acesso direto aos PWAs oficiais do cliente e do profissional
- Voucher de um mes gratis condicionado as regras vigentes da campanha
- FAQ com nove duvidas reais, formulario de sugestoes integrado ao BFF, CTA final e rodape completo
- SEO tecnico, dados estruturados e pontos de analytics sem rastreadores instalados
- Animacoes leves no hero, nas secoes e nos estados ao vivo, com movimento reduzido respeitado

## Executar localmente

A partir da raiz do repositorio:

```powershell
node server.js
```

Acesse:

```text
http://localhost:3000/apps/landing-page/
```

Tambem e possivel servir esta pasta com qualquer servidor HTTP estatico.

## Dominios

- Landing canonica: `https://barberflow.live`
- Aplicativo cliente: `https://app.barberflow.live`
- Aplicativo profissional: `https://pro.barberflow.live`
- BFF: `https://bff.barberflow.live`

Os valores ficam centralizados em `config/landing-config.js`. A landing nao faz
chamadas ao BFF nesta etapa.

## Video do YouTube

O ID do video fica somente em `config/landing-config.js`, na chave
`youtubeVideoId`. O video oficial esta configurado com o ID `DdNwn7O6zL4`.

Quando um ID valido for configurado, o iframe de `youtube-nocookie.com` sera
criado quando metade do player entrar na area visivel. A reproducao automatica
inicia sem som para respeitar as politicas dos navegadores; o visitante pode
ativar o audio nos controles. O clique em `Assistir video` pode iniciar com som. O player
usa 98% da largura da tela e altura 75% maior que 16:9, `loading="lazy"` e CSP
restrita ao dominio de embed.

## Video de fundo do hero

O hero usa `assets/videos/hero-barberflow.mp4` como video decorativo em loop,
silencioso e inline. O arquivo oficial `imgFundoHeader.webp` permanece como
poster e fallback para falha de carregamento, economia de dados e navegadores
com reducao de movimento habilitada.

O video nao e pre-carregado integralmente: `preload="metadata"` evita competir
com o conteudo principal. Ao substituir o arquivo, mantenha-o comprimido, sem
audio necessario e preferencialmente abaixo de 5 MB. Uma variante WebM pode ser
adicionada futuramente antes do MP4 para reduzir transferencia.

## Placeholders pendentes

- Um screenshot do catalogo em `config/landing-features.js`: Convite para
  barbeiro parceiro
- ID oficial do video de demonstracao

Onze prints do catalogo ja estao otimizados em WebP e ativos. Convite para
barbeiro parceiro permanece pendente porque o arquivo recebido era identico ao
print de compartilhamento no WhatsApp e nao representa a proposta de parceria.

O mockup do hero usa a tela real de abertura do aplicativo profissional em
`assets/images/screenshots/hero-abertura-app.webp`.

Os mockups de celular possuem proporcao fixa para que a troca pelos arquivos
reais nao altere o layout. Imagens finais devem ser otimizadas em WebP ou AVIF.
Cada registro pendente permanece com `imageReady: false`; assim, nenhum caminho
ausente gera request ou erro 404. Depois de adicionar o WebP esperado, altere a
flag para `true` para ativar o carregamento lazy da imagem.

O carrossel usa scroll-snap, swipe nativo, arraste por mouse, setas, indicadores
e teclado. Nao existe reproducao automatica, preservando o tempo de leitura.

## Aplicativos

Os botoes "Baixar app do cliente" e "Baixar app profissional" usam os destinos
oficiais centralizados em `config/landing-config.js`. Como os aplicativos sao
PWAs, os links abrem a experiencia web; a instalacao fica disponivel pelo
navegador em dispositivos compativeis, sem simular um download de loja.

O CTA flutuante do celular e ocultado quando as secoes de aplicativos, voucher
ou chamada final estao visiveis, evitando cobrir botoes de conversao.

## Voucher integrado ao BFF

`VoucherService` expoe:

- `checkAvailability()`
- `generateVoucher(data)`
- `validateVoucher(code)`

A chave `voucherCampaignEnabled` esta ativa. `VoucherApiAdapter` acessa o caminho
same-origin `/api/v1/professional-vouchers`, encaminhado pela Vercel para
`https://bff.barberflow.live`; a interface nunca cria codigo, saldo ou
confirmacao local.

A modal solicita somente o e-mail que sera usado no cadastro. O clique em gerar
registra o aceite informado das regras e da privacidade; honeypot, loading, erro,
sucesso, copia do codigo, acesso direto ao cadastro profissional e os cinco passos
de uso permanecem. O estado de sucesso so aparece quando o BFF devolve um codigo
real reservado no banco.

## Arquitetura dos vouchers

A fonte unica continua sendo `professional_trial_vouchers`. A RPC
`issue_professional_trial_voucher` seleciona o primeiro codigo disponivel por
`created_at`, reserva com `FOR UPDATE SKIP LOCKED` e registra apenas o hash
SHA-256 do e-mail. Um mesmo e-mail nao recebe um segundo voucher.

Endpoints da BFF:

- `GET /api/v1/professional-vouchers/availability`
- `POST /api/v1/professional-vouchers/issue`
- `POST /api/v1/professional-vouchers/validate`

O cadastro continua consumindo o codigo atomicamente por `used_at` e `used_by`.
Quando o voucher veio da landing, o e-mail do cadastro deve ser o mesmo da
emissao. Secrets, service role e credenciais permanecem exclusivamente no BFF.

Nenhum codigo ficticio ou dado local simula a integracao de voucher.

## Sugestoes e e-mail

O formulario inclui nome, e-mail, tipo, assunto, mensagem, consentimento,
limites de caracteres, honeypot, loading, sucesso e erro. `FeedbackService`
normaliza e valida os dados e delega o envio ao `FeedbackApiAdapter`. A flag
`feedbackSubmissionEnabled` esta ativa e o adapter envia somente a allowlist
para `POST /api/v1/landing/feedback`, encaminhado pela Vercel ao BFF.

O BFF revalida o payload com `LandingFeedbackDto`, absorve o honeypot, limita a
cinco envios por IP a cada 15 minutos e usa `SubmitLandingFeedbackUseCase` para
fixar `contato@barberflow.live` como destino. O cliente nao envia nem controla o
destinatario. O template escapa Nome, E-mail, Tipo, Assunto e Mensagem e inclui
data, horario, consentimento e a origem `Landing Page BarberFlow`.

O envio reutiliza `ResendEmailService`; nao existe credencial no navegador nem
uma segunda funcao serverless. O deploy do BFF precisa manter `RESEND_API_KEY` e
um `RESEND_FROM_EMAIL` autorizado pelo dominio no ambiente de producao.

## FAQ e documentos legais

O FAQ cobre fila por ordem de chegada, acesso via navegador/PWA, barbeiro
autonomo, fila publica, convites de parceiros, recursos financeiros, voucher e
contato. As respostas refletem funcionalidades existentes e evitam tratar o
sistema como contabilidade completa ou garantir beneficio promocional.

A politica de privacidade descreve o envio ativo de sugestoes pelo BFF e pelo
Resend. Os termos e as regras da campanha continuam preliminares; os documentos
legais permanecem com `noindex` e devem passar por revisao juridica.

## SEO e compartilhamento

- Title: `BarberFlow — Fila em tempo real para barbearias`
- Canonical: `https://barberflow.live/`
- Open Graph e Twitter usam a URL oficial
- JSON-LD descreve o BarberFlow como `SoftwareApplication`
- Icone e apple touch icon usam o monograma oficial

O wordmark atual e apenas a imagem social temporaria. Antes da publicacao,
substitua `socialImageUrl` e as metas `og:image`/`twitter:image` por uma peca
oficial horizontal otimizada e atualize o hash da CSP se o JSON-LD mudar.

## Analytics preparado

`LandingAnalytics` usa o `LandingAnalyticsTracker` centralizado e começa
desativado (`analyticsEnabled: false`), sem URL, chave pública ou collector.
Nenhum SDK, cookie ou request de analytics é carregado antes da configuração
manual do schema `analytics` no mesmo projeto Supabase em `../../analytics/`. A allowlist contém:

- `landing_view`
- `session_started` / `session_ended`
- `scroll_25` / `scroll_50` / `scroll_75` / `scroll_100`
- `cta_click`
- `voucher_modal_opened`
- `email_input_started`
- `email_submitted`
- `voucher_generated`

CTA principal, secundários, vídeo, carrossel e FAQ são identificados por
um identificador estável enviado como `button_name`. E-mail só pode seguir no
envio confirmado e é transformado em HMAC na
Edge Function; a landing não deve enviar e-mail enquanto a integração estiver
desativada. Consulte `analytics/docs/deployment.md` antes de ativar.

## Edicao de conteudo

- Textos e secoes principais: `index.html`
- Slides e caminhos de screenshots: `config/landing-features.js`
- URLs, flags, video e imagem social: `config/landing-config.js`
- Estilos do formulario, CTA e rodape: `css/sections/feedback-cta-footer.css`
- FAQ: `index.html`, mantendo IDs e atributos ARIA de cada item

Os doze screenshots esperados permanecem listados no catalogo de
funcionalidades. O video oficial esta configurado em `youtubeVideoId`.

## Checklist antes da publicacao

1. Adicionar e otimizar os screenshots reais.
2. Revisar links dos aplicativos e a caixa `contato@barberflow.live`.
3. Confirmar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no projeto do BFF.
4. Aplicar e auditar a migration de emissao antes de ativar o deploy.
5. Revisar juridicamente politica, termos e regras da campanha.
6. Criar a imagem social oficial.
7. Decidir consentimento e adapter de analytics.
8. Reexecutar testes, acessibilidade, performance e auditoria em conexao lenta.
9. Somente entao publicar na Vercel e configurar o dominio.

## Dominio recomendado

O endereco canonico permanece `https://barberflow.live`, conforme definido para
a campanha. Ele e mais curto para anuncios e preserva a marca na primeira
camada. `www.barberflow.live` pode futuramente apenas redirecionar para o dominio
canonico; `conheca.barberflow.live` nao e necessario nesta arquitetura.

Nenhuma configuracao de DNS, deploy ou redirecionamento foi alterada.

## Configuracao da Vercel

Conecte o mesmo repositorio `delima20k/barberflow` em um projeto independente e
use estas configuracoes:

- Root Directory: `apps/landing-page`
- Framework Preset: `Other`

O cliente, o aplicativo profissional e o BFF permanecem em seus projetos e
dominios atuais. Esta configuracao nao executa deploy nem altera DNS.

## Validacao

```powershell
node --test tests/landing-page.test.js
node --test tests/landing-carousel.test.js
node --test tests/landing-voucher.test.js
node --test tests/landing-video.test.js
node --test tests/landing-feedback.test.js
node --check apps/landing-page/config/landing-config.js
node --check apps/landing-page/config/landing-features.js
node --check apps/landing-page/js/main.js
node --check apps/landing-page/js/feedback-service.js
node --check apps/landing-page/js/analytics.js
```

O arquivo `vercel.json` prepara um projeto estatico independente. Esta etapa nao
inclui deploy, alteracao de DNS ou publicacao.
