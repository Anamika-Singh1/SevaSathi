import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Never reads .env files or connects to hosted Supabase. Only fresh, validated
// database names created by this process are mutation/deletion targets.
const container = 'supabase_db_sevasathi';
const pattern = /^qa_sevasathi_intake_repair_[a-f0-9]{16}$/;
const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const repair = read('supabase/repair-application-intake.sql');
const inspection = read('supabase/inspect-application-intake.sql');
const verificationOffset = repair.indexOf('-- Final verification is read-only.');
assert.ok(verificationOffset >= 0, 'Repair must include its truthful standalone verification query.');
const verificationOnly = repair.slice(verificationOffset);
const operator = 'b4b19f10-ddd9-46d5-a618-d8277a7f94d3';
const session = randomUUID();
const migrations = readdirSync(new URL('supabase/migrations/', root)).sort()
  .filter((name) => name.endsWith('.sql') && name < '20261031000100');
assert.equal(migrations.length, 7);

function psql(database, sql) {
  assert.ok(database === 'postgres' || pattern.test(database));
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t',
    '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
}

const tables = ['profiles', 'applications', 'application_documents', 'application_notes',
  'application_events', 'application_workflow', 'application_checklist', 'workflow_demo_settings'];
const snapshot = `select jsonb_build_object(${tables.map((table) => {
  const row = "(to_jsonb(t)-array['application_date','workflow_stage','processing_status'])";
  return `'${table}',(select md5(coalesce(jsonb_agg(${row} order by ${row}::text)::text,'[]')) from public.${table} t)`;
}).join(',')})::text;`;
const receiptState = `select jsonb_build_object(
  'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]'::jsonb) from private.application_intake_requests r),
  'sequence',(select jsonb_build_array(last_value,is_called) from private.application_intake_reference_seq))::text;`;
const claims = JSON.stringify({ sub: operator, role: 'authenticated', session_id: session });

function create(database, full, request) {
  const extra = full ? `,(now() at time zone 'Asia/Kolkata')::date,'INCOME',
    '[{"key":"income_declaration","status":"MISSING"},{"key":"identity_proof","status":"RECEIVED"},{"key":"residence_proof","status":"MISSING"}]'::jsonb,'Preserved repair-test note'` : '';
  return JSON.parse(psql(database, `begin;
    do $$ begin
      perform set_config('request.jwt.claims','${claims}',true);
      perform set_config('request.jwt.claim.sub','${operator}',true);
    end $$;
    set local role authenticated;
    select public.create_application('${request}','Fictional repair test','Repair test village',0,'Isolated repair test'${extra});
    commit;`).trim());
}

for (const initial of ['original-setup', 'base-intake', 'formatted-original-setup']) {
  const activeRepair = initial === 'formatted-original-setup'
    ? repair.replaceAll('actor public.profiles%rowtype;', 'actor    public.profiles%rowtype;')
      .replaceAll('if not found or actor.role', 'if   not found or actor.role')
      .replace(/\r?\n/g, '\r\n')
    : repair;
  const database = `qa_sevasathi_intake_repair_${randomBytes(8).toString('hex')}`;
  assert.match(database, pattern);
  let created = false;
  try {
    psql('postgres', `create database ${database} encoding 'UTF8' template template0;`);
    created = true;
    psql(database, `
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid;
      $$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      insert into auth.users(id,email,email_confirmed_at) values('${operator}','operator@sevasathi.example.com',now());
      insert into auth.sessions(id,user_id) values('${session}','${operator}');
    `);
    for (const migration of migrations) psql(database, read(`supabase/migrations/${migration}`));
    psql(database, read('supabase/repair-authorized-test-officer.sql'));
    psql(database, read('supabase/seed.sql'));
    psql(database, read('supabase/phase-two-demo.sql'));
    let oldReceipt;
    let privateBefore;
    const oldRequest = randomUUID();
    if (initial === 'base-intake') {
      psql(database, read('supabase/migrations/20261031000100_application_intake.sql'));
      oldReceipt = create(database, false, oldRequest);
      privateBefore = psql(database, receiptState);
    }
    const beforeInspection = psql(database, inspection);
    assert.match(beforeInspection, /^current_form\|MISSING_FUNCTION\|/m,
      'The current form RPC must be diagnosed as missing before installation.');
    assert.match(beforeInspection, initial === 'base-intake'
      ? /^legacy\|READY_IN_DATABASE\|/m : /^legacy\|MISSING_FUNCTION\|/m);
    assert.match(psql(database, verificationOnly), /^NOT_READY:/m,
      'Running only the final status query must not claim a missing migration was installed.');
    const before = psql(database, snapshot);
    assert.match(psql(database, activeRepair), /^READY: Add application database functions installed\|/m);
    const installedInspection = psql(database, inspection);
    assert.match(installedInspection, /^current_form\|READY_IN_DATABASE\|/m);
    assert.match(installedInspection, /^legacy\|READY_IN_DATABASE\|/m);
    assert.equal(psql(database, snapshot), before, 'Repair preserves every existing application/profile/child/audit value.');
    if (privateBefore) assert.equal(psql(database, receiptState), privateBefore, 'Repair preserves retry receipts and reference sequence.');
    if (oldReceipt) assert.deepEqual(create(database, false, oldRequest), { ...oldReceipt, duplicate: true });
    psql(database, read('tests/database/security-review.sql'));

    const request = randomUUID();
    const receipt = create(database, true, request);
    assert.match(receipt.reference_number, /^SS-\d{4}-\d{4,8}$/);
    assert.equal(receipt.duplicate, false);
    const saved = JSON.parse(psql(database, `select jsonb_build_object(
      'stage',a.workflow_stage,'status',a.processing_status,
      'operator',w.operator_id,'events',(select count(*) from public.application_events e where e.application_id=a.id and e.event_type='APPLICATION_CREATED'),
      'notes',(select count(*) from public.application_notes n where n.application_id=a.id and n.body='Preserved repair-test note')
      ) from public.applications a join public.application_workflow w on w.application_id=a.id where a.id='${receipt.application_id}';`).trim());
    assert.deepEqual(saved, { stage: 'DOCUMENT_SCREENING', status: 'PENDING', operator, events: 1, notes: 1 });

    // A repeat also repairs the API grant/cache case, without touching saved data.
    psql(database, `revoke execute on function public.create_application(uuid,text,text,numeric,text),
      public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text) from authenticated;`);
    assert.match(psql(database, inspection), /^current_form\|MISSING_EXECUTE_GRANT\|/m,
      'A missing grant must be distinguished from a missing function.');
    assert.match(psql(database, verificationOnly), /^NOT_READY:/m);
    const savedBefore = psql(database, snapshot);
    const receiptsBefore = psql(database, receiptState);
    assert.match(psql(database, activeRepair), /^READY:/m);
    assert.equal(psql(database, snapshot), savedBefore);
    assert.equal(psql(database, receiptState), receiptsBefore);
    assert.deepEqual(create(database, true, request), { ...receipt, duplicate: true });
    assert.equal(psql(database, `select
      has_function_privilege('authenticated','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE')
      and not has_function_privilege('anon','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE')
      and not has_function_privilege('service_role','public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)','EXECUTE');`).trim(), 't');

    // A genuinely different function is still refused, even with the same
    // signature and security configuration. Do not weaken the existing guard.
    const definition = psql(database, `select pg_get_functiondef(
      'public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)'::regprocedure);`);
    const alteredDefinition = definition.replaceAll("message='INTAKE_FORBIDDEN'", "message='CUSTOM_INTAKE_DENIAL'");
    assert.notEqual(alteredDefinition, definition);
    psql(database, alteredDefinition);
    assert.throws(() => psql(database, activeRepair), error =>
      error.status === 3 && String(error.stderr).includes('differs from the definition in this repair file'));
    assert.equal(psql(database, `select pg_get_functiondef(
      'public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text)'::regprocedure);`),
      alteredDefinition, 'Refused repair must preserve an unreviewed function.');
    assert.equal(psql(database, snapshot), savedBefore);
    assert.equal(psql(database, receiptState), receiptsBefore);
    psql(database, definition);

    // An interrupted schema is refused atomically rather than reset.
    psql(database, 'drop function public.create_application(uuid,text,text,numeric,text,date,text,jsonb,text);');
    let refused = false;
    try { psql(database, activeRepair); }
    catch (error) {
      if (error.status !== 3 || !String(error.stderr).includes('Partial full-intake objects exist')) throw error;
      refused = true;
    }
    assert.equal(refused, true);
    assert.equal(psql(database, snapshot), savedBefore);
    assert.equal(psql(database, receiptState), receiptsBefore);
    console.log(`PASS: ${initial}: missing updates installed; existing values/receipts/sequence preserved; authorized creation/audit and retry pass; rerun/grant repair is safe; partial schema is refused.`);
  } finally {
    if (created) {
      assert.match(database, pattern);
      psql('postgres', `drop database ${database} with (force);`);
    }
  }
}
console.log('PASS: isolated repair databases removed. Existing local and hosted application databases were not modified.');
