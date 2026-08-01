# Eventos canônicos

O coletor aceita exclusivamente os eventos declarados em `AnalyticsEventValidator`.
Dados de navegação são metadados técnicos; e-mail é aceito somente no evento
`email_submitted`, é convertido em HMAC no servidor e nunca é persistido ou logado em texto puro.
