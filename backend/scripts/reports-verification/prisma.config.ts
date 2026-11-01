import { defineConfig } from 'prisma/config';

// Disposable, explicitly provisioned loopback-only PostgreSQL. Never loads .env.
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  datasource: { url: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' },
});
