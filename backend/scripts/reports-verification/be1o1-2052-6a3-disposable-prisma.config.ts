import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  datasource: { url: 'postgresql://postgres@127.0.0.1:55571/reports_be1o1_6a' },
});
