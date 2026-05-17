# SKILL 09 — REFATORAÇÃO: ESCOPO, CHECKLIST E CHECK FINAL

> Leia este arquivo ao final de qualquer implementação, antes de commitar.
> Contém: escopo de refatoração, checklist obrigatório, regra de entrega e check final.

---

## 1. ESCOPO DA REFATORAÇÃO

- ✅ Refatorar **apenas** os arquivos criados ou modificados na tarefa atual
- ❌ NUNCA tocar em arquivos que não foram alterados na tarefa
- ❌ NUNCA adicionar funcionalidade nova durante refatoração de layout
- ❌ NUNCA refatorar "por aproveitar" — escopo é o que foi pedido

---

## 2. CHECKLIST OBRIGATÓRIO APÓS TODA IMPLEMENTAÇÃO

Percorrer **todos os 8 pontos** nos arquivos modificados:

1. **Limpeza** — remover código morto, comentários obsoletos, imports não usados, `console.log` de debug
2. **OOP** — classes com SRP, campos `#` privados, `static` onde cabível, sem funções soltas
3. **Bugs** — edge cases, null safety, erros silenciados, lógica invertida, condições de corrida
4. **DRY** — extrair helper se o mesmo bloco aparece 2+ vezes
5. **Modularidade** — cada arquivo faz uma coisa; dependências explícitas no topo
6. **Escalabilidade** — estrutura suporta crescimento sem reescrita
7. **Segurança** — `sanitizar()` só em `innerHTML`; validar inputs na fronteira — ver `skill-04-seguranca.md`
8. **Performance** — revogar Blob URLs, cancelar timers, sem queries N+1 — ver `skill-08-performance.md`

---

## 3. REGRA DE ENTREGA

- ❌ NUNCA entregar implementação sem passar pelos 8 pontos acima
- ❌ NUNCA apenas listar problemas — **refatorar** e entregar já corrigido
- ✅ Após refatorar, rodar os testes para confirmar que tudo continua verde
- ✅ Só commitar após checagem completa sem pendências abertas
- ✅ Registrar todas as classes novas em `CLASS_REGISTRY.md` antes do commit

---

## 4. CHECK FINAL ANTES DE COMMITAR

- [ ] Sintaxe correta
- [ ] Segurança revisada
- [ ] Custo avaliado
- [ ] Performance validada
- [ ] Responsividade testada
- [ ] Arquitetura limpa
- [ ] OOP 100%
- [ ] SOLID aplicado
- [ ] Design Patterns corretos
- [ ] Acessibilidade verificada
- [ ] Sem memory leaks
- [ ] Todos os testes passando
- [ ] `CLASS_REGISTRY.md` atualizado

---

> **REGRA FINAL:** Sempre perguntar — *"Existe uma forma mais barata, mais inteligente, mais segura e mais escalável de fazer isso?"*
> Se existir: **FAZER MELHOR.**
