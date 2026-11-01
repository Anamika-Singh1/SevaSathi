import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

// Keep hosted configuration untouched. Keys come directly from local Supabase
// and are passed to child processes in memory, never printed or written to disk.
assert.equal(process.versions.node.split('.')[0], '22', 'Use Node 22 for Supabase tests.');
const disk = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
const status = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'Local Supabase keys are required.');
const env = { ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
  SEVASATHI_TEST_DEMO_PROJECT: 'true', TEST_BASE_URL: 'http://127.0.0.1:3001', GEMINI_API_KEY: '',
};
// Local demo passwords are independent of the user's hosted operator password.
// Keep them in an ignored environment file; never print their values.
const passwordFile = '.env.intake.local';
const passwordNames = ['OPERATOR', 'FIELD_OFFICER', 'CASEWORKER', 'APPROVING_OFFICER'].map((role) => `DEMO_${role}_PASSWORD`);
if (!existsSync(passwordFile)) {
  writeFileSync(passwordFile, '# Disposable local Supabase QA accounts only. Never commit.\n' +
    passwordNames.map((name) => `${name}=${randomBytes(24).toString('base64url')}`).join('\n') + '\n', { mode: 0o600 });
}
const localPasswords = parseEnv(readFileSync(passwordFile, 'utf8'));
for (const name of passwordNames) {
  assert.ok(localPasswords[name]?.length >= 12, `Set ${name} in ${passwordFile}.`);
  env[name] = localPasswords[name];
}
if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = disk.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if ((!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || !existsSync(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) && process.platform === 'win32') {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (existsSync(chrome)) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
}
function run(args) {
  execFileSync(process.execPath, args, { env, stdio: 'inherit', timeout: 600000 });
}
// This existing setup refuses to take over accounts without the demo marker.
// The URL/key above are forced to local Supabase, so no hosted account is changed.
run(['node_modules/tsx/dist/cli.mjs', 'scripts/setup-demo.ts']);
run(['node_modules/tsx/dist/cli.mjs', 'scripts/test-application-intake.ts']);
run(['node_modules/tsx/dist/cli.mjs', '--test', 'tests/integration/application-intake.test.ts']);
if (!process.argv.includes('--skip-build')) run(['node_modules/next/dist/bin/next', 'build']);
mkdirSync('.qa', { recursive: true });
const fd = openSync('.qa/intake-local-server.log', 'w');
const server = spawn(process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3001'],
  { env, stdio: ['ignore', fd, fd], windowsHide: true });
closeSync(fd);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Local test server exited. Inspect .qa/intake-local-server.log.');
    try {
      const response = await fetch(`${env.TEST_BASE_URL}/login`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for local startup. */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  assert.ok(ready, 'Local test server did not become ready.');
  run(['node_modules/@playwright/test/cli.js', 'test', 'tests/browser/application-intake.spec.ts']);
} finally {
  if (server.exitCode === null) {
    const closed = new Promise((done) => server.once('exit', done));
    server.kill();
    await closed;
  }
}
console.log('PASS: local database, real Auth/PostgREST, production build and intake browser tests. Hosted project was not a mutation target.');
