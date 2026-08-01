-- Rollback operacional NÃO destrutivo do Analytics.
-- Execute somente após backup e aprovação. Tabelas e dados são preservados.
begin;

revoke usage on schema analytics from anon, authenticated;
revoke all on all tables in schema analytics from anon, authenticated;
revoke execute on all functions in schema analytics from anon, authenticated;

commit;

-- Para remoção definitiva, faça um backup validado e execute manualmente:
-- drop schema analytics cascade;
