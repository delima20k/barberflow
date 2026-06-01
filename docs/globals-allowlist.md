# Globals allowlist - Fase 2 ES modules

Data: 2026-05-23.

## Contexto

`MinhaBarbeariaPage`, `PageSection`, `SectionEventBus` e as Sections de Minha Barbearia agora usam ES modules com imports nomeados. O restante do app profissional ainda carrega parte relevante do legado como scripts classicos ate a Fase 3 com bundler.

## Globais temporarios permitidos

| Global | Consumidor atual | Justificativa | Plano de remocao |
|---|---|---|---|
| `Router` | `apps/profissional/assets/js/app.js` | App raiz ainda estende classe carregada por script classico. | Importar via bundle Vite na Fase 3. |
| `AuthController`, `CadastroController`, `PlanosController`, `TermosController` | `apps/profissional/assets/js/app.js` | Controllers do app profissional ainda sao scripts classicos compartilhados pelo boot. | Converter controllers para modules junto do app shell. |
| `AuthService`, `MonetizationGuard`, `AppBootstrap` | `apps/profissional/assets/js/app.js` | Cadeia de autenticacao/boot ainda depende de ordem global documentada no audit. | Migrar auth/bootstrap para imports explicitos no bundle. |
| `DestaquesPage`, `AgendaPage`, `CriarBarbeariaPage`, `QueueWidget`, `BarbeirosPage`, `BarbeariasPage`, `BarbeariaPage`, `BarbeiroPage` | `apps/profissional/assets/js/app.js` | Pages fora de MinhaBarbearia ainda nao fazem parte da extracao Section. | Code splitting por pagina na Fase 3. |
| `SupabaseService` | `MinhaBarbeariaRuntimeController` | Realtime de fila e fetches legados ainda usam service global carregado antes do app. | Importar service quando `shared/js` virar module/chunk. |
| `AuthService`, `BarbershopRepository`, `CadeiraService`, `NotificationService`, `StatusFechamentoModal`, `MediaP2P`, `GpsPanelMap`, `GuardaIten`, `DigText` | `MinhaBarbeariaRuntimeController` | God-file runtime ainda concentra fluxos legados que serao estrangulados por dominio. | Remover conforme Queue/Settings/GPS/Media virarem modules reais. |
| `Pro` | HTML/event handlers e deep links | Mantido em `globalThis.Pro` para compatibilidade com handlers legados e navegacao externa. | Substituir handlers globais por listeners/Router importado na Fase 3. |

## Regra

Novos arquivos de Section nao podem adicionar globals. Qualquer global novo precisa entrar nesta allowlist com dono, risco e plano de remocao.
