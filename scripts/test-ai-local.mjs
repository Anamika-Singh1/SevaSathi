import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

assert.equal(process.versions.node.split('.')[0], '22', 'Use Node 22 for local verification.');
const env = { ...process.env };
const originalPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.Path = `${dirname(process.execPath)};${originalPath}`;
let status;
try {
  status = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], {
    env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  }));
} catch { throw new Error('Local Supabase is unavailable. Start Docker and run npm run db:start first.'); }
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname), 'Only local Supabase may be tested.');
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'Local Supabase keys are required.');
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
  SEVASATHI_TEST_DEMO_PROJECT: 'true', TEST_BASE_URL: 'http://127.0.0.1:3002',
  // Real provider success is tested separately, with fictional data only.
  GEMINI_API_KEY: '', GEMINI_MODEL: 'gemini-3.5-flash-lite',
});
const passwordNames = ['OPERATOR', 'FIELD_OFFICER', 'CASEWORKER', 'APPROVING_OFFICER'].map(role => `DEMO_${role}_PASSWORD`);
const passwordFile = '.env.ai.local';
if (!existsSync(passwordFile)) {
  writeFileSync(passwordFile, '# Disposable local QA accounts only. Never commit.\n' + passwordNames.map(name => `${name}=${randomBytes(24).toString('base64url')}`).join('\n') + '\n', { mode: 0o600 });
}
const passwords = parseEnv(readFileSync(passwordFile, 'utf8'));
for (const name of passwordNames) {
  assert.ok(passwords[name]?.length >= 12, `Set ${name} in ${passwordFile}.`);
  env[name] = passwords[name];
}
if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && process.platform === 'win32') {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (existsSync(chrome)) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
}
function run(args) {
  execFileSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true, timeout: 600000 });
}
// Existing provisioning updates only marked local demo accounts, their local
// passwords and fixture assignments. No hosted env file, reset or migration is used.
run(['node_modules/tsx/dist/cli.mjs', 'scripts/setup-demo.ts']);
run(['node_modules/next/dist/bin/next', 'build']);
mkdirSync('.qa', { recursive: true });
const fd = openSync('.qa/ai-local-server.log', 'w');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3002'], {
  env, stdio: ['ignore', fd, fd], windowsHide: true,
});
closeSync(fd);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Local verification server exited. Inspect .qa/ai-local-server.log.');
    try {
      const response = await fetch(`${env.TEST_BASE_URL}/login`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Local verification server did not become ready.');
  run(['node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1', 'tests/integration/ai.test.ts', 'tests/integration/workflow.test.ts']);
  run(['node_modules/@playwright/test/cli.js', 'test', 'tests/browser/phase-three.spec.ts', 'tests/browser/phase-four.spec.ts', 'tests/browser/phase-five.spec.ts', 'tests/browser/phase-six.spec.ts', 'tests/browser/reading-view.spec.ts']);
} finally {
  if (server.exitCode === null) {
    const closed = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await closed;
  }
}
console.log('PASS: production build, local authenticated AI/workflow integration and browser checks. Hosted configuration was not changed.');
