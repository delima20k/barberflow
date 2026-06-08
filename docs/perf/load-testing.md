# Load Testing BarberFlow

Escopo: scripts de carga para a BFF BarberFlow sem alterar layout, regra de negocio, fluxo ou banco.

## Ferramenta

O runner usa Node.js nativo como equivalente ao k6 quando o binario k6 nao esta disponivel no ambiente. Ele executa VUs fixos, sem ramp automatico, e bloqueia qualquer valor fora das etapas autorizadas: 1, 7, 14, 28 e 56.

O intervalo entre iteracoes usa `LOADTEST_THINK_TIME_MS` ou `--think-time` com padrao de 250ms, evitando loop apertado quando o alvo esta indisponivel.

## Carga autorizada

Nunca aumentar VUs automaticamente. Rodar somente a etapa autorizada pelo usuario.

```powershell
node load-tests/run.js --vus=1 --duration=30 --stage=smoke
node load-tests/run.js --vus=7 --duration=60 --stage=7vus
node load-tests/run.js --vus=14 --duration=60 --stage=14vus
node load-tests/run.js --vus=28 --duration=90 --stage=28vus
node load-tests/run.js --vus=56 --duration=120 --stage=56vus
```

## Dados de teste

Todo payload de escrita usa prefixo gerado automaticamente:

```txt
loadtest_<data>_<grupo>
```

Por padrao, `LOADTEST_ENABLE_WRITES=false`; nesse modo o runner exercita leituras, login invalido controlado, health e metrics sem criar registros. Para escritas reais, preencher tokens/UUIDs em variaveis de ambiente e habilitar `LOADTEST_ENABLE_WRITES=true`.

## Notificacoes

Push real em massa fica desabilitado por padrao. `LOADTEST_ENABLE_PUSH=true` exige tambem `LOADTEST_ENABLE_WRITES=true` e payload com `dryRun: true`.

## Limpeza

Quando escritas forem habilitadas, limpar dados pelo prefixo exibido no relatorio. Usar Supabase SQL Editor ou script interno autorizado, filtrando por campos textuais/metadata que contenham `loadtest_<data>_<grupo>`. Nao apagar dados sem esse prefixo.

## Relatorios

Cada execucao grava JSON em:

```txt
docs/perf/load-results/
```

O relatorio inclui VUs, endpoints, p50/p95/p99, taxa de erro, amostras de recursos do processo runner e linhas relevantes de `/metrics` quando disponivel.
