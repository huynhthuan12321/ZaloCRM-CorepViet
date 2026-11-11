import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

type EvalGroup = 'technical' | 'security' | 'golden';

type EvalSummary = {
  config: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  exitCode: number | null;
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function wantedGroups(): Set<EvalGroup> {
  const arg = process.argv[2] as EvalGroup | 'all' | undefined;
  if (!arg || arg === 'all') return new Set(['technical', 'security', 'golden']);
  if (!['technical', 'security', 'golden'].includes(arg)) {
    throw new Error(`Unknown eval group: ${arg}`);
  }
  return new Set([arg]);
}

const root = resolve(import.meta.dirname);
const groups = wantedGroups();
const configs = walk(join(root, 'configs'))
  .filter((file) => file.endsWith('.yaml'))
  .filter((file) => groups.has(relative(join(root, 'configs'), file).split(/[\\/]/)[0] as EvalGroup))
  .sort();

const summaries: EvalSummary[] = [];

for (const configPath of configs) {
  const label = relative(root, configPath);
  console.log(`\n${'='.repeat(80)}\nRunning ${label}\n${'='.repeat(80)}`);
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['promptfoo', 'eval', '-c', configPath], {
    cwd: resolve(root, '..'),
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  const exitCode = result.status;
  if (result.error) {
    console.error(`Failed to run promptfoo for ${label}: ${result.error.message}`);
  }
  summaries.push({
    config: label,
    status: exitCode === 0 ? 'PASS' : result.error ? 'ERROR' : 'FAIL',
    exitCode,
  });
}

mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports', 'last-run-summary.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: 'report-only',
  summaries,
}, null, 2));

const failed = summaries.filter((summary) => summary.status !== 'PASS');
console.log(`\n${'='.repeat(80)}\nEVAL SUMMARY\n${'='.repeat(80)}`);
for (const summary of summaries) {
  console.log(`${summary.status} ${summary.config} exit=${summary.exitCode}`);
}

if (failed.length > 0) process.exit(1);
