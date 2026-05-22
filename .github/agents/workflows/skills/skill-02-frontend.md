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
