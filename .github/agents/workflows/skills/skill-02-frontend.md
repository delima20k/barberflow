# SKILL 02 — FRONTEND: TELAS, ROUTER, ANIMAÇÕES, CSS, COMPONENTES

> Leia este arquivo para tarefas de frontend: novas telas, layout, CSS, animações, navegação, cards e componentes UI.

---

## 1. REGRAS GERAIS DE FRONT-END

- Mobile-first sempre
- `background-image` DEVE incluir `background-repeat: no-repeat`
- Usar classes CSS reutilizáveis — nunca estilos inline para background
- `.barber-card` e `.barber-row` → SEMPRE `background: transparent` — nunca cor sólida
- ❌ NUNCA acessar DOM de forma espalhada — centralizar em componentes de tela

---

## 2. ESTRUTURA OBRIGATÓRIA DE APP (ROUTER)

Todo app DEVE estender `Router` de `shared/js/Router.js`:

```js
class NomeApp extends Router {
  static #TELAS_COM_NAV = new Set(['inicio', 'outra-tela']);
  get telasComNav() { return NomeApp.#TELAS_COM_NAV; }
  constructor() { super('inicio'); }
}
const App = new NomeApp();
```

- Classes de animação ficam SOMENTE em `shared/css/tokens.css`
- Métodos de navegação ficam SOMENTE em `shared/js/Router.js`
- ❌ NUNCA criar `@keyframes` de tela dentro de HTML ou CSS específico de app

---

## 3. ANIMAÇÃO DE TELAS — COMPORTAMENTO OBRIGATÓRIO

| Cenário | Tela que sai | Tela que entra |
|---|---|---|
| Home → Nova aba | home fica por baixo, sem animação | entra pela **ESQUERDA** (`.ativa`, .32s) |
| Aba A → Aba B (carrossel) | sai pela **DIREITA** (`.saindo-direita`, .48s) | entra pela **ESQUERDA** (`.entrando-lento`, .72s) |
| `push()` login↔cadastro↔esqueceu | sai pela **DIREITA** (`.saindo-direita`, .48s) | entra pela **ESQUERDA** (`.entrando-lento`, .72s) |
| `voltar()` (btn-voltar) | sai pela **ESQUERDA** (`.saindo`, .48s) | home já está por baixo — sem animação |
| Toggle (clicar na aba já aberta) | sai pela **ESQUERDA** (`.saindo`, .48s) | home já está por baixo |

> **Regra de ouro do `voltar()`:** sempre vai para o **home**, NUNCA para a aba anterior. Histórico é limpo ao voltar. NUNCA mudar a direção.

> **Regra WAAPI (AnimationService):** `oncancel` de uma animação dispara de forma **assíncrona** após `cancel()`. Qualquer handler de fim de saída que esconda a tela (`display:none`) DEVE checar antes se outra animação já assumiu o elemento (`el.getAnimations().some(a => a !== atual)`) — senão apaga a tela que está re-entrando (voltar → reabrir rápido). A animação de ENTRADA deve sempre limpar `pointer-events` residual da saída interrompida. Testes: `tests/animation-service.test.js`.

> **Regra de ouro do carrossel:** a aba só sai pela direita quando outra entra ao mesmo tempo (`nav()`/`push()`). Toggle e `voltar()` são operações isoladas.

---

## 4. MÉTODOS DE NAVEGAÇÃO

- `App.nav('tela')` — footer/menu → carrossel automático (sai direita, entra esquerda)
- `App.push('tela')` — fluxo de auth → sempre carrossel
- `App.voltar()` — SEMPRE fecha pela esquerda e volta ao home — NUNCA `window.history.back()` ou `location.href`

---

## 5. CHECKLIST AO CRIAR NOVA TELA

1. HTML: `<main id="tela-NOME" class="tela">` dentro de `#app`
2. Registrar no `Set #TELAS_COM_NAV` se tiver footer
3. Navegar via `App.nav()` ou `App.push()` — NUNCA manipular classes manualmente
4. Botão voltar usa `App.voltar()`
5. NUNCA criar animações próprias
6. Estrutura padrão de topo com btn-voltar:

```html
<main id="tela-NOME" class="tela">
  <div class="tela-topo">
    <button class="btn-voltar" data-voltar aria-label="Voltar">Voltar</button>
    <h2 class="tela-topo__titulo">Título</h2>
  </div>
  <div class="content"></div>
</main>
```

- ❌ NUNCA criar header próprio sticky no lugar do `.tela-topo`
- ❌ NUNCA usar `position: absolute` no `btn-voltar` dentro de `.tela-topo`

---

## 6. PADRÃO OBRIGATÓRIO DE CARDS

- `.barber-card` e `.barber-row` → SEMPRE `background: transparent` — nunca cor sólida
- `.top-card` → SEMPRE `background: transparent` e `border: none`; `min-height: 114px`
- No `:hover` do `.top-card` → NUNCA adicionar `border-color` — apenas `transform` e `box-shadow`
- Referência: `shared/css/barber-card.css`

---

## 7. COMPONENTES GLOBAIS OBRIGATÓRIOS

| Componente | Uso obrigatório |
|---|---|
| **`DigText`** | Toda animação de texto |
| **`BarberPole`** | Toda animação de barber pole: `new BarberPole(container)` |
| **`MediaP2P`** | Toda operação de mídia P2P — ver `skill-06-p2p-mensagens.md` |
## 8. SECTIONS EM GOD FILES DE PAGINA

- Extrair god files de pagina por `PageSection`: `init`, `render`, `update`, `destroy`, `on` e `emit` formam o contrato base.
- Cada Section concreta separa `Controller`, `State` e `View`; `Controller` recebe `State` e `View` por injecao e secoes nao acessam outras secoes diretamente.
- Comunicacao entre Sections usa `SectionEventBus` com evento registrado em `/events/catalog.js`; validacao de catalogo fica ligada em desenvolvimento.
- Toda Section e dona do cleanup de listeners, timers e observers que registrar. Teste de leak deve cobrir ciclos repetidos de `init`/`destroy`.

## 9. CARROSSEIS DE DEMONSTRACAO ACESSIVEIS

- Centralizar o conteudo dos slides em catalogo imutavel e montar a interface por uma classe de componente.
- Usar `scroll-snap` e rolagem nativa para toque; arraste por mouse deve usar Pointer Events sem bloquear o scroll vertical.
- Oferecer setas, indicadores, teclado, foco visivel, estado `aria-current` e mensagem `aria-live`.
- Nao usar autoplay por padrao. Se o produto exigir autoplay, fornecer controle explicito de pausa e preservar tempo de leitura.
- Manter fallback editorial em `<noscript>` sem duplicar o catalogo completo no HTML.
- Imagens ausentes devem permanecer como placeholders identificados, sem requests 404; imagens reais usam dimensoes estaveis e lazy loading.
- Limitar eventos de scroll com `requestAnimationFrame` e remover listeners, frames e estados de ponteiro em `destroy()`.

## 10. VIDEO EXTERNO COM CARREGAMENTO SOB DEMANDA

- Centralizar o identificador do video na configuracao da aplicacao.
- Nunca renderizar iframe vazio. Sem identificador valido, exibir placeholder editorial.
- Criar iframe externo apenas apos acao explicita do usuario e usar dominio com privacidade aprimorada quando disponivel.
- Definir proporcao estavel, titulo acessivel, `loading="lazy"` e allowlist de `frame-src` na CSP.
- Nao carregar thumbnail, SDK ou script externo antes da intencao de reproducao.

## 11. MODAL DE CAMPANHA SEM REGRA DE NEGOCIO NO CLIENTE

- Contagem, elegibilidade, limite e emissao de voucher pertencem ao servidor; o frontend apenas apresenta respostas reais.
- Em modo sem API, exibir estado indisponivel com `remaining: null`; nunca gerar codigo, saldo ou sucesso local.
- Concentrar disponibilidade, emissao e validacao em service com adapter injetado.
- Modal deve cobrir loading, erro, sucesso, foco, Escape, trap de Tab, copia e instrucao de uso.
- Dados pessoais exigem regras e politica publicadas, aceite versionado, rate limit, anti-bot, idempotencia e logs no servidor.
- Nao usar `localStorage`, arrays publicos ou refresh da pagina como controle definitivo de campanha.

## 12. FORMULARIOS PUBLICOS, SEO E ANALYTICS PREPARADO

- Formularios publicos devem separar Controller e Service, com adapter injetado para a integracao remota.
- Sem API aprovada, o Service retorna estado indisponivel e a interface informa que nenhum dado foi transmitido; nunca simular sucesso de negocio.
- Aplicar limites no HTML e no Service, honeypot, consentimento, loading e bloqueio de submissao concorrente. Validacao e normalizacao no navegador sao apenas UX; o servidor repete validacao, escape, rate limit e protecao anti-bot.
- Destino de e-mail, data, horario e origem devem ser definidos no servidor. Nunca aceitar destinatario vindo do navegador nem expor credenciais do provedor.
- Antes de criar uma nova funcao serverless ou provedor, procurar a infraestrutura de e-mail existente e ampliar o adapter atual dentro da arquitetura do projeto.
- SEO de landing publica deve manter title, description, canonical, Open Graph, Twitter, icones e JSON-LD coerentes com a URL oficial, sem metricas, avaliacoes ou ofertas inventadas.
- JSON-LD inline deve ser coberto pela CSP com hash exato; atualizar e testar o hash sempre que o bloco mudar.
- Analytics deve iniciar com allowlist de eventos e adapter nulo. Nao carregar Pixel, GA ou GTM antes de consentimento, configuracao aprovada e politica publicada.
- Eventos de conversao nao devem transportar nome, e-mail, telefone, mensagem, voucher ou qualquer outro dado pessoal.

## 13. VIDEO DECORATIVO DE FUNDO NO HERO

- Video decorativo deve usar `autoplay`, `muted`, `loop` e `playsinline`; sem `muted`, navegadores podem bloquear a reproducao automatica.
- Manter imagem otimizada como `poster` e fallback no CSS para falha de carregamento, economia de dados e movimento reduzido.
- Usar `preload="metadata"` e nunca pre-carregar integralmente o MP4 do hero. Comprimir o arquivo e, quando viavel, oferecer WebM antes do MP4.
- Fixar o video com dimensoes estaveis e `object-fit: cover`; aplicar overlay que preserve contraste real do texto em todos os frames.
- Por ser decorativo, usar `aria-hidden="true"`, remover da ordem de foco e ocultar em `prefers-reduced-motion: reduce`.
- Se o video transmitir informacao indispensavel, ele deixa de ser decorativo: deve ter controles, alternativa textual e legendas.
- Servidor e CDN devem entregar o MIME correto e cache controlado. Arquivos que podem ser substituidos sem hash nao devem usar cache imutavel longo.

## 14. ATUALIZACAO SEGURA DE PWA

- Centralizar registro, deteccao, ativacao e recarga do service worker em uma classe compartilhada pelos apps.
- Registrar o worker sempre no mesmo URL e usar `updateViaCache: 'none'`; a versao pertence aos nomes dos caches e aos assets, nao ao URL do worker.
- Verificar atualizacao ao abrir e ao retomar o app. `controllerchange` pode recarregar a pagina somente uma vez por ciclo, com guard temporario em `sessionStorage`.
- Nao chamar `skipWaiting()` incondicionalmente durante `install`; o gerenciador autoriza a ativacao por mensagem apenas depois que o worker termina de instalar.
- O cache estatico critico deve ser atomico e buscado com `cache: 'reload'`. Falha em asset critico mantem o worker anterior ativo; imagens opcionais podem usar `Promise.allSettled`.
- Durante `activate`, remover somente caches com o prefixo do proprio app. Nunca apagar sessao, localStorage, IndexedDB ou caches de outro produto.
- Alteracao em arquivo compartilhado exige versao nova nos dois HTMLs, nos dois workers e teste de paridade cliente/profissional.
