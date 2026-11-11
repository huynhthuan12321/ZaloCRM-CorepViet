import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  datasource: { url: 'postgresql://postgres@127.0.0.1:55541/reports_5b6b_6a_verify' },
});
