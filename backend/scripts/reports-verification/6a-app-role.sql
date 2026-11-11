CREATE ROLE reports_6a_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE reports_6a_verify TO reports_6a_app;
GRANT USAGE ON SCHEMA public TO reports_6a_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO reports_6a_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO reports_6a_app;

ALTER ROLE reports_6a_app SET log_statement = 'all';
ALTER ROLE reports_6a_app SET log_min_duration_statement = '0';
