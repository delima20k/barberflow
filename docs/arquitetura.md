# Arquitetura BFF — BarberFlow

## Visão geral

A BFF segue **Clean Architecture** com quatro camadas concêntricas. A regra de dependência é estrita: camadas internas **nunca** importam de camadas externas.

```
interfaces/bff  →  application  →  domain
infrastructure  →  application  →  domain
```

```
barberflow-bff-api/
├── domain/             # Núcleo — zero dependências externas
│   ├── shared/         # BaseEntity, BaseValueObject, BaseAggregateRoot, DomainEvent, Result, Specification
│   └── <contexto>/     # Agregados, Value Objects, Eventos, Ports (interfaces)
├── application/        # Casos de uso e DTOs — depende apenas de domain/
│   ├── shared/
│   └── <contexto>/
├── infrastructure/     # Adaptadores — implementa os ports do domain
│   ├── db/             # Repositórios Supabase
│   ├── cache/          # ICache, MemoryCache, RedisCache
│   └── shared/         # BaseRepository, SupabaseUnitOfWork
├── interfaces/bff/     # Controllers HTTP, WebSocket handlers, Schedulers
├── container/          # DI (awilix) — monta o grafo de dependências
└── config/             # env.js (12-factor), supabase.js
```

---

## Como adicionar um novo módulo de domínio

### Exemplo: bounded context `pagamento`

### 1 — Domain Layer

**a) Value Object do status:**
```
domain/pagamento/PagamentoStatus.js
```
Estenda `BaseValueObject`, defina os estados e transições, implemente `_validate()`.

**b) Agregado raiz:**
```
domain/pagamento/Pagamento.js
```
Estenda `BaseAggregateRoot`. Implemente:
- `static create(dados)` — validação + invariantes + `_raise(new PagamentoCriadoEvent(...))`
- `static reconstitute(dados)` — reconstrução a partir do banco, sem checagens de negócio
- Métodos de comportamento (ex.: `aprovar()`, `cancelar()`)

**c) Evento de domínio:**
```
domain/pagamento/PagamentoCriadoEvent.js
```
Estenda `DomainEvent`. Campos imutáveis (`Object.freeze`).

**d) Port (interface do repositório):**
```
domain/pagamento/ports/IPagamentoRepository.js
```
Métodos abstratos que lançam `Error('não implementado')`.

### 2 — Application Layer

**a) DTOs de entrada e saída:**
```
application/pagamento/dto/CriarPagamentoDto.js
application/pagamento/dto/PagamentoResponseDto.js
```
`CriarPagamentoDto.create(props)` retorna `Result<DTO, string>` após validação.
`PagamentoResponseDto.fromDomain(pagamento)` retorna plain object.

**b) Casos de uso:**
```
application/pagamento/CriarPagamentoUseCase.js
application/pagamento/AtualizarStatusPagamentoUseCase.js
```
Estenda `BaseUseCase`. Injete repositórios pelo construtor. `execute()` retorna `Promise<Result<object, string>>`.

### 3 — Infrastructure Layer

**Repositório Supabase:**
```
infrastructure/db/PagamentoRepository.js
```
Estenda `BaseRepository`. Implemente `_toRow(aggregate)` e `_toDomain(row)`. Implemente todos os métodos do port correspondente.

### 4 — DI Container

Em `container/container.js`, registre:
```js
pagamentoRepository:        asClass(PagamentoRepository).singleton(),
criarPagamentoUseCase:      asClass(CriarPagamentoUseCase).scoped(),
atualizarStatusPagamentoUseCase: asClass(AtualizarStatusPagamentoUseCase).scoped(),
```

### 5 — Interface HTTP

```
interfaces/bff/pagamento/PagamentoController.js
```
Resolva o use case do container via `req.container.resolve('criarPagamentoUseCase')`.
Nunca instancie use cases diretamente no controller.

---

## Padrões obrigatórios

| Padrão | Onde aplica |
|--------|------------|
| `'use strict';` | Primeiro token de todo arquivo JS |
| Result/Either | Erros de negócio → `Result.fail(string)`, nunca `throw` |
| Erros de infra | `throw new AppError(message, statusCode)` |
| IDs | `randomUUID()` do módulo nativo `crypto` |
| Datas | Sempre `Date` no domínio; ISO string na borda HTTP |
| JSDoc | `@param`, `@returns`, `@typedef` em métodos públicos |
| Imports | Apenas `require()` — sem `import/export` |

---

## Regra de dependência — verificação

Nenhum arquivo em `domain/` deve conter `require()` apontando para `infrastructure/`, `application/` ou `interfaces/`.

```bash
# Verificar violações:
grep -r "require.*infrastructure" barberflow-bff-api/domain/
grep -r "require.*application"   barberflow-bff-api/domain/
```

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Agregado** | Cluster de entidades com invariantes transacionais. Toda mutação passa pelo agregado raiz. |
| **Value Object** | Imutável, identificado pelo valor, sem ID próprio. |
| **Port** | Interface definida no domínio que a infra implementa (Ports & Adapters). |
| **Use Case** | Uma operação de negócio — orquestra domínio + persistência, não conhece HTTP. |
| **DTO** | Objeto de transferência — valida dados na entrada ou formata na saída. |
| **Result** | `Result.ok(value)` / `Result.fail(error)` — substitui exceções para erros de negócio. |
| **DI Container** | `awilix` — monta o grafo de objetos. Controllers resolvem use cases via `req.container`. |
