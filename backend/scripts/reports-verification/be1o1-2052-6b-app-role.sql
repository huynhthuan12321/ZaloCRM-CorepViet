-- 6B lần 3: verification-only app role on the disposable DB.
CREATE ROLE reports_be1o1_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE reports_be1o1_verify TO reports_be1o1_app;
GRANT USAGE ON SCHEMA public TO reports_be1o1_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO reports_be1o1_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO reports_be1o1_app;
