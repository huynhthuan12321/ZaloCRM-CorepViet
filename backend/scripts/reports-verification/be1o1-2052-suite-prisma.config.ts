import { defineConfig } from 'prisma/config';
const url = new URL(process.env.REPORTS_SUITE_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.port !== '55571' || !['/reports_suite_current','/reports_suite_baseline'].includes(url.pathname) || url.username !== 'postgres') throw new Error('Disposable suite database required');
export default defineConfig({ schema: '../../prisma/schema.prisma', datasource: { url: url.toString() } });