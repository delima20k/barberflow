# Contrato RPC: issue_professional_trial_voucher

Reserva o primeiro voucher ativo, nao utilizado, nao emitido e nao expirado
para um e-mail elegivel da landing page.

## Entrada

- `p_email_hash text`: SHA-256 hexadecimal do e-mail normalizado pela BFF.

## Saida

- `result_status`: `issued`, `duplicate_email` ou `sold_out`.
- `voucher_code`: codigo entregue somente quando o status for `issued`.
- `voucher_trial_days`: duracao do voucher emitido.
- `remaining_count`: saldo real depois da operacao.

## Garantias

- A RPC e acessivel somente por `service_role`.
- A selecao usa ordem por criacao e `FOR UPDATE SKIP LOCKED`.
- Um hash de e-mail nao recebe dois vouchers.
- O e-mail puro nao e persistido na tabela.
- O cadastro continua consumindo o voucher atomicamente por `used_at` e
  `used_by`, exigindo o mesmo e-mail quando o codigo veio da landing.
