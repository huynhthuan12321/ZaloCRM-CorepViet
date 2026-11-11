import { defineConfig } from 'prisma/config';
const url = new URL(process.env.E1O1_OWNER_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.port !== '55561' || url.pathname !== '/reports_e1o1' || url.username !== 'postgres') {
  throw new Error('Dedicated E1/O1 disposable owner database required');
}
export default defineConfig({ schema: '../../prisma/schema.prisma', datasource: { url: url.toString() } });
