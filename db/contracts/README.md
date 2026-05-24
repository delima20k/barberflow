# Contratos de RPC

Toda RPC nova deve ter:

1. Entrada válida e entradas inválidas em `db/contracts/rpc-contracts.json`.
2. Snapshot de resposta em `db/contracts/snapshots/<nome>.json`.
3. Documento Markdown em `db/contracts/<nome>.md`.
4. Execução em `npm run db:contracts`.

O CI roda `npm run db:tests`, que agrega snapshot de schema, cobertura de RPC,
testes de contrato e o hook de RLS.
