# Fix — 422 na geocodificação de endereço da barbearia

> Diagnóstico e correção executados em 2026-06-12 pelo AGENTE DELIMA.
> Escopo restrito: apenas a causa raiz. Nenhum outro fluxo alterado.

---

## 1. Problema

`PATCH /api/v1/barbearias/minha/endereco` retornava **422** ("Não foi possível localizar as coordenadas do endereço") ao salvar o endereço da Periz Barber sem GPS. A geocodificação server-side (implementada para garantir a invariante endereço⇒coordenadas) falhava, e a barbearia continuava sem pin no mapa.

---

## 2. Causa raiz (com evidência)

**A Tentativa 1 do `forwardGeocode` montava query livre do Nominatim com TODOS os componentes, incluindo o bairro do ViaCEP:**

```
q=Rua José da Silva Guimarães, Jardim Cidade Pirituba, São Paulo, SP, Brasil
```

O bairro registrado no ViaCEP (**"Jardim Cidade Pirituba"**) **não corresponde** ao nome do bairro no OpenStreetMap (**"Vila Renato, Pirituba"**). A busca livre do Nominatim exige correspondência aproximada de todos os componentes → retorna `[]`.

A Tentativa 2 (`postalcode=02943060&country=br`) também retornava `[]` — o OSM não possui dados granulares de CEP no Brasil.

**Evidência — queries reais executadas em 2026-06-12 (User-Agent do BFF):**

| Query | Periz Barber | Black Sanpa |
|---|---|---|
| Livre com bairro+UF (código antigo, tent. 1) | `[]` ❌ HTTP 200 | `[]` ❌ HTTP 200 |
| `postalcode=&country=br` (código antigo, tent. 2) | `[]` ❌ | — |
| **Estruturada `street=&city=&state=&country=br`** | ✅ `-23.4770964, -46.7231396` | ✅ `-23.4485263, -46.7314219` |
| **Livre SEM bairro** (`street, city, Brasil`) | ✅ mesma coordenada | ✅ mesma coordenada |

Nota: a Black Sanpa tem coordenadas no banco porque o GPS do navegador as forneceu no save original — a geocodificação dela também falharia com o código antigo. Não havia diferença de formato de payload entre as duas barbearias; ambos os CEPs chegam limpos (8 dígitos, sem máscara). Provider: Nominatim/OSM (gratuito, sem API key — nenhuma env var envolvida).

---

## 3. Correção aplicada

### `barberflow-bff-api/infrastructure/geo/NominatimGeocoderAdapter.js` — método `forwardGeocode()`

Reordenação e remontagem das tentativas:

| Antes | Depois |
|---|---|
| 1. Livre: `rua, bairro, cidade, UF, Brasil` | 1. **Estruturada**: `street=rua&city=cidade&state=UF&country=br` |
| 2. CEP: `postalcode=&country=br` | 2. Livre **sem bairro**: `rua, cidade, Brasil` + `countrycodes=br` |
| — | 3. CEP: `postalcode=&country=br` (mantido) |

O parâmetro `neighborhood` continua aceito na assinatura (compatibilidade), mas não entra mais em nenhuma query — era a fonte do mismatch.

### `barberflow-bff-api/services/BarbeariaService.js` — mensagem do 422

```
Antes: "Não foi possível localizar as coordenadas do endereço. Verifique o CEP e tente novamente."
Depois: "Endereço não encontrado no provedor de geolocalização. Confira rua e cidade e tente novamente."
```

---

## 4. Resultado das 5 validações obrigatórias

| # | Validação | Resultado |
|---|---|---|
| 1 | Geocodificação do endereço que falhava | ✅ `forwardGeocode()` real executado com dados exatos da Periz → `{lat: -23.4770964, lng: -46.7231396}`. O PATCH 200 efetivo ocorre quando a dona re-salvar o endereço no app (após deploy do BFF) |
| 2 | Lat/lng no Supabase | ⏳ Após o re-save: conferir `GET /rest/v1/barbershops` → Periz com `latitude != null` |
| 3 | Endpoint do mapa com 2 barbearias | ⏳ Após o re-save: `GET /api/v1/barbearias/todas` → Black Sanpa e Periz com coords |
| 4 | Regressão (barbearia que funcionava) | ✅ `forwardGeocode()` da Black Sanpa → `{lat: -23.4485544, lng: -46.7312993}`; com GPS ativo o geocoder nem executa (coords do cliente têm prioridade) |
| 5 | CEP/endereço inválido → 422 claro | ✅ `forwardGeocode({address:'Rua Inexistente Xyzabc 999', city:'Cidade Fantasma Qwerty', zipCode:'00000000'})` → `null` → service lança 422 com a nova mensagem. Coberto pelos testes unit c1/c2 |

Testes automatizados: **38/38 passando** (`tests/bff-salvar-endereco.test.js`, `tests/minha-barbearia-gps.test.js`, `barberflow-bff-api/tests/barbearia-endereco-geocode.test.js`, `barberflow-bff-api/tests/barbearia-service.test.js`).

---

## 5. Arquivos tocados (4)

| Arquivo | Justificativa |
|---|---|
| `barberflow-bff-api/infrastructure/geo/NominatimGeocoderAdapter.js` | A correção em si — ordem e montagem das queries do `forwardGeocode` |
| `barberflow-bff-api/services/BarbeariaService.js` | Apenas a string da mensagem 422 (explicitamente permitido no escopo) |
| `tests/bff-salvar-endereco.test.js` | Assert estático novo acompanhando a correção (estruturada antes da livre, sem bairro) |
| `docs/fix-geocoding-endereco.md` | Este relatório (entregável obrigatório) |

Sem alterações em: schema/RLS/Supabase, outros endpoints, fluxo do mapa, frontend, service workers (nenhum arquivo `shared/` tocado).
