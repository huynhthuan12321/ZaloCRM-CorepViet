// 6B lần 3 (independent verification only): disposable loopback PostgreSQL, never loads .env.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  datasource: { url: 'postgresql://postgres@127.0.0.1:55531/reports_6b3_verify' },
});
