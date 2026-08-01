# Eventos permitidos

`landing_view`, `cta_click`, `voucher_modal_opened`, `email_input_started`,
`email_submitted`, `voucher_generated`, `scroll_25`, `scroll_50`, `scroll_75`,
`scroll_100`, `session_started` e `session_ended` formam a allowlist da landing.

O e-mail só é aceito em `email_submitted` e é convertido para HMAC antes da
persistência. Campos desconhecidos e nomes fora da allowlist são rejeitados.
Data de recebimento, hash do IP, país e classificação do dispositivo são
definidos no servidor.
