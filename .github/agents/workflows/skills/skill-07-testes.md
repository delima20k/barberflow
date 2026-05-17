# SKILL 07 — TESTES: TDD, NODE:TEST, COBERTURA

> Leia este arquivo para tarefas de testes: TDD, escrever testes, validar edge cases, rodar suite.

---

## 1. BIBLIOTECA OBRIGATÓRIA

```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
```

- ❌ NUNCA instalar Jest, Mocha, Vitest ou Cypress
- ✅ Zero dependências extras de teste
- ✅ Execução: `npm test` → `node --test tests/**/*.test.js`
- ✅ Todos os testes em `tests/` com sufixo `.test.js`
- ✅ Isolamento obrigatório: cada teste usa `vm.createContext` separado

---

## 2. FLUXO TDD OBRIGATÓRIO (RED → GREEN → REFACTOR)

```
1. Criar o teste descrevendo o comportamento esperado
2. Rodar — o teste DEVE falhar (red)
3. Implementar o mínimo para o teste passar (green)
4. Refatorar sem quebrar o teste (refactor)
5. Rodar todos os testes novamente
6. Validar edge cases, erros e performance
```

❌ NUNCA escrever implementação antes do teste
❌ NUNCA pular a etapa de refatoração

---

## 3. O QUE TODO TESTE DEVE COBRIR

- **Happy path** — comportamento esperado com inputs válidos
- **Edge cases** — valores nulos, vazios, extremos, tipos inesperados
- **Erros e exceções** — garantir que erros são tratados e não silenciados
- **Performance crítica** — operações lentas devem ter timeout ou assertion de tempo
- **Segurança** — inputs maliciosos, tentativas de injeção, payloads inválidos

---

## 4. ESTRUTURA PADRÃO DE TESTE

```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('NomeClasse', () => {
  let instancia;

  before(() => {
    instancia = new NomeClasse();
  });

  it('deve fazer X com Y', () => {
    const resultado = instancia.metodo(entrada);
    assert.strictEqual(resultado, esperado);
  });

  it('deve lançar erro para entrada nula', () => {
    assert.throws(() => instancia.metodo(null), /mensagem de erro/);
  });
});
```

---

## 5. REGRAS DE QUALIDADE

- Nome do describe = nome da classe ou módulo sendo testado
- Nome do it = "deve [comportamento] [condição]"
- Um assert por cenário sempre que possível — facilita diagnóstico de falhas
- Testes devem ser determinísticos — sem dependência de horário, ordem ou estado externo
- Mocks apenas para dependências externas (banco, rede) — nunca para lógica de negócio própria
