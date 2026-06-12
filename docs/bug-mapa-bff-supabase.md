# Relatório — Barbearia com endereço não aparece no mapa

> **Investigação SOMENTE LEITURA** — executada em 2026-06-12 pelo AGENTE DELIMA.
> Nenhum arquivo de código, configuração, migration ou dado foi alterado.

---

## 1. Resumo executivo

| Pergunta | Resposta |
|---|---|
| Em qual camada está o problema? | **BANCO (dado faltante)** — `latitude`/`longitude` são `NULL` na barbearia "Periz Barber" |
| RLS bloqueia algo? | Não — as 3 barbearias retornam com anon key |
| BFF descarta algo? | Não — BFF retorna as 3, idênticas ao banco |
| Frontend descarta algo? | Sim, **corretamente** — `MapWidget` exclui barbearias sem coordenadas válidas |
| Causa raiz | O fluxo de salvamento de endereço persistiu o endereço **sem coordenadas** (GPS indisponível e geocodificação por CEP não executada/falhou) |

---

## 2. Dados diretos do banco (Supabase REST, anon key, RLS aplicada)

Query executada (idêntica à visão do app cliente):

```
GET /rest/v1/barbershops?select=id,name,address,city,state,zip_code,neighborhood,latitude,longitude,is_active,is_open,created_at&order=created_at.asc
```

**Resultado: 3 registros** (RLS `barbershops_select_active` exige `is_active = true` — todas passam):

| Campo | Black Sanpa ✅ (aparece) | Periz Barber ❌ (não aparece) | Lima Barber (sem endereço) |
|---|---|---|---|
| id | `fd8b24f5-8703-…` | `eca01d64-10e1-…` | `7a335c0d-b66f-…` |
| address | Avenida Pinheirinho D'Água, 200, SALÃO | Rua José da Silva Guimarães, 120, SALÃO | `null` |
| city / state | São Paulo / SP | São Paulo / SP | `null` |
| zip_code | 02992030 | 02943060 | `null` |
| neighborhood | Parque Panamericano | Jardim Cidade Pirituba | `null` |
| **latitude** | **-23.4489525** | **`null`** ← problema | `null` |
| **longitude** | **-46.7312735** | **`null`** ← problema | `null` |
| is_active | true | true | true |
| is_open | true | true | false |
| created_at | 2026-05-03 | 2026-06-09 | 2026-06-10 |

---

## 3. Teste comparativo — Supabase vs BFF

| Fonte | Registros retornados | Periz Barber presente? | lat/lng da Periz |
|---|---|---|---|
| Supabase direto (anon, RLS) | **3** | Sim | `null` / `null` |
| BFF `GET /api/v1/barbearias/todas?limit=60` | **3** (`meta.total: 3`, HTTP 200) | Sim | `null` / `null` |

**Conclusão do comparativo:** Supabase retorna 3 e BFF retorna 3 — **dados idênticos**. Nem RLS nem o BFF descartam nada. O cenário real é uma variante do caso (a) do roteiro: os dados chegam ao frontend, mas a Periz Barber chega **sem coordenadas**, e o frontend a exclui do mapa por regra de validação (comportamento correto).

---

## 4. Filtros verificados em cada camada (evidência de código)

### 4.1 RLS (banco) — não é a causa
`db/snapshots/schema-current.sql` (linhas 995–998):
```sql
CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
```
As 3 barbearias têm `is_active = true` → nenhuma bloqueada.

### 4.2 BFF — não é a causa
`barberflow-bff-api/repositories/BarbeariaRepository.js` — `getAll()` (linha 199):
```js
.from('barbershops').select(#SELECT).eq('is_active', true).limit(limit)
```
Único filtro: `is_active = true`. Nenhuma transformação descarta registros sem lat/lng. Confirmado pela resposta real: BFF devolve a Periz Barber com `latitude: null`.

### 4.3 Frontend — exclui corretamente (não é bug)
`shared/js/MapWidget.js` — `#buscarTodasBarbearias()`:
```js
.filter(s => s.address && MapWidget.#barbeariaComMapaValido(s));
```
`#barbeariaComMapaValido()` → `#coordenadasBarbearia()` → `#normalizarCoordenada(null)` → retorna `null` → barbearia excluída. **Sem coordenadas não há onde posicionar o pin** — a exclusão é o comportamento correto (antes da correção de 2026-06-11, `Number(null) = 0` colocava o pin em (0,0) no Atlântico).

---

## 5. Causa raiz exata

**A Periz Barber teve o endereço salvo sem latitude/longitude.** O fluxo de gravação no BFF (`BarbeariaService.salvarEndereco()`) só persiste coordenadas quando elas chegam no payload:

```js
const hasCoords = dados.lat != null && dados.lng != null;
// ...
...(hasCoords ? { latitude: lat, longitude: lng } : {}),
```

No cliente (`BarbershopService.salvarEnderecoGps()`), as coordenadas vêm de duas fontes:
1. **GPS do navegador** — se o profissional negou a permissão ou o GPS falhou, não há coords;
2. **Fallback de geocodificação por CEP** (ViaCEP + Nominatim) — implementado em **2026-06-11**.

A Periz Barber foi criada em **2026-06-09** — o endereço foi salvo **antes** do fallback de CEP existir (ou com GPS negado e Nominatim falhando). Resultado: endereço gravado, coordenadas nunca gravadas.

---

## 6. Correção necessária (NÃO implementada — somente descrição)

**Opção A — Operacional (imediata, sem código):**
A dona da Periz Barber re-salva o endereço na tela Minha Barbearia → GPS. Com o fallback de CEP já em produção, as coordenadas serão geocodificadas e persistidas mesmo sem GPS ativo.

**Opção B — Backfill pontual (dado):**
Geocodificar o CEP `02943060` (Rua José da Silva Guimarães, 120, São Paulo) e atualizar `latitude`/`longitude` da linha `eca01d64-10e1-48d3-b2ab-70f0bcfdc697` via SQL/painel Supabase.

**Opção C — Defesa estrutural (código, recomendada a médio prazo):**
Mover a geocodificação para o **BFF** (`BarbeariaService.salvarEndereco()`): quando `lat`/`lng` não vierem no payload mas houver `zip_code`, o servidor geocodifica antes de persistir. Elimina a dependência do navegador do profissional e garante a invariante "endereço salvo ⇒ coordenadas salvas". Aderente ao fluxo BFF obrigatório do projeto.

**Complemento de UX:** na tela de salvamento, avisar o profissional quando o endereço for salvo sem coordenadas ("sua barbearia não aparecerá no mapa até ativar o GPS ou informar um CEP válido").

---

## 7. Anexos — evidência bruta

**Supabase (anon key, 2026-06-12):** 3 linhas; Periz Barber com `"latitude":null,"longitude":null`.

**BFF (`https://bff.berberflow.shop/api/v1/barbearias/todas?limit=60`, HTTP 200):**
```json
{"ok":true,"dados":[
  {"name":"Black Sanpa","latitude":-23.4489525,"longitude":-46.7312735, ...},
  {"name":"Periz Barber","latitude":null,"longitude":null, ...},
  {"name":"Lima Barber","address":null,"latitude":null,"longitude":null, ...}
],"meta":{"total":3}}
```
