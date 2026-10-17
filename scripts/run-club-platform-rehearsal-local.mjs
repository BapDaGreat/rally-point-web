// One-shot, disposable-local rehearsal of the club platform release package.
// It creates two new databases inside the local Supabase container and nothing
// else; there is no linked-project, remote or staging path in this file.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { isIP } from 'node:net'
import pg from 'pg'
import { verifyContainer, verifyDockerEndpoint, verifySocketIdentity } from './reservation-resume-executor-guards-r2.mjs'
import { reservationRpcs } from './reservation-resume-checks.mjs'
import { evaluateChecks, isolationCheckCount, packageMigrations, parseTapOutput, sqlSuites,
  stagingMigrations } from './club-platform-checks.mjs'
import { bootstrapReferences, defaultPackage, verifyClubPlatformPackage } from './club-platform-package.mjs'
import { selectRows } from '../supabase/verification/pg-query-rows.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const frozen = defaultPackage
// Earlier attempts keep their STOP evidence:
//   r1 stopped at the first identity check (the server reports 172.18.0.2/32);
//   r2 stopped at bootstrap (postgres cannot own staging's auth and storage schemas locally).
const evidence = join(root, 'docs/release-private/club-platform-rehearsal-20261017-r3')
const databases = Object.freeze(['rally_club_platform_20261017_stage', 'rally_club_platform_20261017_clean'])
const container = 'supabase_db_rally-point-web'
const dockerExe = 'C:/Users/ed/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
const requiredRoles = ['anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readText = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
const frozenFile = path => readText(join(frozen, path))

let phase = 'local-preflight'
let password
const journal = []
const record = value => journal.push({ ...value, at: new Date().toISOString() })

function save(name, object) {
  assert.match(name, /^[a-zA-Z0-9_.-]+$/)
  const path = join(evidence, name)
  writeFileSync(path, typeof object === 'string' ? object : JSON.stringify(object, null, 2) + '\n', { flag: 'wx' })
  return sha(readFileSync(path))
}

function docker(args, input = '') {
  const out = spawnSync(dockerExe, args, { input, encoding: 'utf8', shell: false, timeout: 300000,
    maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
  if (out.status !== 0) {
    const name = `failure-${phase.replaceAll(/[^a-z0-9-]/gi, '-')}.private.txt`
    if (existsSync(evidence) && !existsSync(join(evidence, name))) {
      save(name, String(out.stderr || out.error || 'Docker command failed').slice(0, 16384))
    }
    throw new Error(`Local Docker/psql command failed during ${phase}; diagnostic kept in the evidence folder`)
  }
  return out.stdout
}

// Migrations, seed, checks and tests run as postgres, as they would on staging.
// Only the platform bootstrap runs as supabase_admin, the role that owns the
// auth and storage schemas on hosted Supabase.
function psql(database, sql, role = 'postgres') {
  assert.ok(databases.includes(database), 'Unapproved psql target')
  assert.ok(['postgres', 'supabase_admin'].includes(role), 'Unapproved psql role')
  return docker(['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1',
    '-U', role, '-d', database], sql)
}

async function connect(database) {
  assert.ok(database === 'postgres' || databases.includes(database), 'Unapproved database')
  const client = new pg.Client({ host: '127.0.0.1', port: 54322, database, user: 'postgres', password, ssl: false,
    application_name: 'rally_club_platform_rehearsal', connectionTimeoutMillis: 10000, query_timeout: 120000 })
  await client.connect()
  return client
}

// The same cluster read through docker exec (Unix socket inside the container).
function socketIdentity() {
  const sql = `begin read only;
    select jsonb_build_object('db', current_database(), 'role', current_user,
      'version', current_setting('server_version'), 'address', inet_server_addr()::text,
      'port', inet_server_port(), 'cluster_id', s.system_identifier::text,
      'data_directory', current_setting('data_directory'),
      'postmaster_started', pg_postmaster_start_time()::text)::text
    from pg_control_system() as s;
    rollback;`
  const lines = docker(['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres'], sql).split(/\r?\n/).filter(Boolean)
  assert.equal(lines.length, 1, 'Unexpected Docker-socket identity response')
  return verifySocketIdentity(JSON.parse(lines[0]))
}

// The TCP connection must reach that same cluster, through the container's own address.
async function identity(client, database, addresses, socket) {
  const { rows: [row] } = await client.query(`select current_database() as db, current_user as role,
    current_setting('server_version') as version, inet_server_addr()::text as address,
    s.system_identifier::text as cluster_id, current_setting('data_directory') as data_directory,
    pg_postmaster_start_time()::text as postmaster_started,
    (select count(*)::int from pg_stat_activity where datname = current_database()
      and pid <> pg_backend_pid() and backend_type = 'client backend') as other_clients
    from pg_control_system() as s`)
  assert.equal(row.db, database)
  assert.equal(row.role, 'postgres')
  assert.equal(row.version, '17.6')
  assert.equal(row.cluster_id, socket.cluster_id, 'TCP connection reached a different PostgreSQL cluster')
  assert.equal(row.data_directory, socket.data_directory, 'PostgreSQL data directory differs')
  assert.equal(row.postmaster_started, socket.postmaster_started, 'PostgreSQL server start differs')
  const [address, mask, extra] = String(row.address).split('/')
  assert.ok(isIP(address) === 4 && extra === undefined && (mask === undefined || mask === '32') &&
    addresses.includes(address), 'Connection is not the approved local container')
  // The local API services use the postgres database; the new databases must be private to this run.
  if (database !== 'postgres') assert.equal(row.other_clients, 0, 'Another client is in a disposable database')
}

const query = async (client, sql, label) => selectRows(await client.query(sql), label)

async function snapshot(client, withContent = false) {
  const state = {
    fingerprint: await query(client, frozenFile('checks/schema_fingerprint.sql'), 'fingerprint'),
    catalog: await query(client, frozenFile('checks/restore_catalog_snapshot.sql'), 'catalog'),
    grants: await query(client, frozenFile('checks/tenant_grant_snapshot.sql'), 'grants'),
    history: await query(client, 'select version, name from supabase_migrations.schema_migrations order by version', 'history'),
  }
  assert.equal(state.fingerprint.filter(row => row.category === '!fingerprint').length, 1, 'Fingerprint marker missing')
  assert.equal(state.catalog.length, 1)
  assert.equal(state.grants.length, 1)
  if (withContent) state.content = await query(client, frozenFile('checks/backup_content_inventory.sql'), 'content')
  return state
}

async function pauseAudit(client, label) {
  const rows = await query(client, frozenFile('checks/reservation_write_pause_readonly.sql'), 'pause audit')
  assert.equal(rows.length, 66, `${label}: pause audit row count differs`)
  assert.ok(rows.every(row => row.violation === false), `${label}: reservation writes are not paused`)
  return rows.length
}

async function checks(client, database, kind) {
  const rows = await query(client, frozenFile(`checks/club_platform_${kind}.sql`), kind)
  save(`${database}-${kind}.json`, rows)
  return evaluateChecks(rows, kind)
}

function bootstrap(database) {
  const sql = [
    'begin;',
    'create schema private authorization postgres;',
    'create schema extensions authorization postgres;',
    'grant usage on schema extensions to public;',
    'create extension pgcrypto with schema extensions;',
    'create publication supabase_realtime;',
    ...bootstrapReferences.map(([path]) => readText(join(root, path))),
    'commit;',
    'create extension if not exists pgtap with schema extensions;',
  ].join('\n')
  psql(database, sql, 'supabase_admin')
  record({ phase: 'bootstrap', database, role: 'supabase_admin' })
}

async function applyMigration(client, database, name) {
  phase = `apply-${database}-${name}`
  const sql = frozenFile('database/supabase/migrations/' + name)
  const version = name.split('_')[0]
  psql(database, `set search_path = public, extensions;\n${sql}`)
  await client.query('insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)',
    [version, [sql], name.slice(version.length + 1, -4)])
  record({ phase: 'migration', database, version, sha256: sha(sql) })
}

function tap(database, path, name, expectedPlan) {
  const text = psql(database, frozenFile(path))
  save(`${database}-${name}.tap.json`, { name, lines: text.split(/\r?\n/) })
  return parseTapOutput(text, name, expectedPlan)
}

async function rehearseStagingOrder(client, database) {
  phase = 'stage-bootstrap'
  bootstrap(database)
  for (const name of stagingMigrations) await applyMigration(client, database, name)
  phase = 'stage-seed'
  psql(database, frozenFile('database/supabase/seed.sql'))
  phase = 'stage-preflight'
  const preflight = await checks(client, database, 'preflight')
  await pauseAudit(client, 'before the package')
  const before = await snapshot(client)
  for (const name of packageMigrations) await applyMigration(client, database, name)
  phase = 'stage-postflight'
  const postflight = await checks(client, database, 'postflight')
  await pauseAudit(client, 'after the package')
  const after = await snapshot(client)
  assert.ok(!isDeepStrictEqual(before.fingerprint, after.fingerprint), 'The package did not change the schema')
  return { preflight, postflight, after }
}

async function rehearseCleanOrder(client, database, order) {
  phase = 'clean-bootstrap'
  bootstrap(database)
  for (const name of order) await applyMigration(client, database, name)
  phase = 'clean-seed'
  psql(database, frozenFile('database/supabase/seed.sql'))
  phase = 'clean-postflight'
  const postflight = await checks(client, database, 'postflight')
  await pauseAudit(client, 'clean order')
  return { postflight, after: await snapshot(client) }
}

async function suitesWithTemporaryGrants(client, database) {
  phase = 'stage-suites'
  const before = await snapshot(client, true)
  const results = []
  // Two September suites call the paused booking functions, so only this
  // disposable database grants them for the run, exactly as the resume rehearsal did.
  for (const rpc of reservationRpcs) await client.query(`grant execute on function public.${rpc} to authenticated`)
  try {
    for (const name of sqlSuites) results.push(tap(database, 'database/supabase/tests/database/' + name, name))
  } finally {
    for (const rpc of reservationRpcs) await client.query(`revoke execute on function public.${rpc} from authenticated`)
  }
  await pauseAudit(client, 'after the suites')
  const after = await snapshot(client, true)
  assert.ok(isDeepStrictEqual(before, after), 'The suites or temporary grants left the database changed')
  return results
}

async function main() {
  assert.equal(process.argv.length, 3, 'One explicit mode is required')
  const mode = process.argv[2]
  assert.ok(['--verify-local', '--execute-local'].includes(mode), 'Use --verify-local or --execute-local')
  const verified = verifyClubPlatformPackage(frozen)
  const manifest = JSON.parse(frozenFile('manifest.json'))
  if (mode === '--verify-local') {
    console.log(JSON.stringify({ result: 'LOCAL_FILES_VERIFIED_NOT_REHEARSED', manifestSha256: verified.manifestSha256,
      databases, databaseContacted: false }))
    return
  }
  assert.ok(existsSync(dockerExe), 'Pinned Docker Desktop client not found')
  assert.ok(!existsSync(evidence), 'Rehearsal evidence already exists; this rehearsal is one-shot')
  mkdirSync(evidence, { recursive: true })
  save('ATTEMPT.json', { kind: 'one-shot-disposable-local-club-platform-rehearsal', manifestSha256: verified.manifestSha256,
    databases, startedAt: new Date().toISOString(),
    runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    checksSha256: sha(readFileSync(join(root, 'scripts/club-platform-checks.mjs'))),
    stagingContacted: false })

  phase = 'docker-identity'
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT && !process.env.DOCKER_TLS_VERIFY,
    'Docker target overrides are not allowed')
  verifyDockerEndpoint(JSON.parse(docker(['context', 'inspect'])))
  const local = verifyContainer(JSON.parse(docker(['inspect', container])))
  password = local.password
  const socket = socketIdentity()
  record({ phase: 'docker-identity', clusterId: socket.cluster_id })

  phase = 'maintenance-identity'
  const admin = await connect('postgres')
  try {
    await identity(admin, 'postgres', local.addresses, socket)
    const roles = (await admin.query('select rolname from pg_roles where rolname = any($1::text[]) order by rolname',
      [requiredRoles])).rows.map(row => row.rolname)
    assert.deepEqual(roles, [...requiredRoles].sort(), 'Local Supabase roles missing')
    const existing = (await admin.query('select datname from pg_database where datname = any($1::text[])', [databases])).rows
    assert.deepEqual(existing, [], 'Rehearsal databases already exist; no reuse or reset path exists')
    for (const database of databases) await admin.query(`create database "${database}" owner postgres template template0`)
  } finally { await admin.end() }

  const [stageName, cleanName] = databases
  const stageClient = await connect(stageName)
  const cleanClient = await connect(cleanName)
  try {
    await identity(stageClient, stageName, local.addresses, socket)
    await identity(cleanClient, cleanName, local.addresses, socket)
    const stage = await rehearseStagingOrder(stageClient, stageName)
    const clean = await rehearseCleanOrder(cleanClient, cleanName, manifest.orders.clean)

    phase = 'compare-orders'
    assert.ok(isDeepStrictEqual(stage.after.fingerprint, clean.after.fingerprint), 'Staging order and clean order end in different schemas')
    assert.ok(isDeepStrictEqual(stage.after.catalog, clean.after.catalog), 'Staging order and clean order end in different catalogs')
    assert.ok(isDeepStrictEqual(stage.after.grants, clean.after.grants), 'Staging order and clean order end with different grants')
    const marker = stage.after.fingerprint.find(row => row.category === '!fingerprint')
    save('post-package-fingerprint.json', stage.after.fingerprint)

    phase = 'two-club-isolation'
    const isolation = {
      stage: tap(stageName, 'checks/two_club_isolation.sql', 'two_club_isolation', isolationCheckCount),
      clean: tap(cleanName, 'checks/two_club_isolation.sql', 'two_club_isolation', isolationCheckCount),
    }
    const suites = await suitesWithTemporaryGrants(stageClient, stageName)

    phase = 'complete'
    save('RESULT.json', { result: 'PASS', scope: 'two new disposable local databases only',
      manifestSha256: verified.manifestSha256, databases,
      stagingOrder: { preflight: stage.preflight, postflight: stage.postflight, packageMigrations: [...packageMigrations] },
      cleanOrder: { postflight: clean.postflight, migrations: manifest.orders.clean.length },
      ordersConverge: true, postPackageFingerprint: marker, isolation,
      suites: { count: suites.length, checks: suites.reduce((sum, suite) => sum + suite.planned, 0), results: suites },
      pauseAudit: 'all 66 rows passed before the package, after it, and after the suites',
      journal, stagingContacted: false, productionContacted: false })
    console.log(JSON.stringify({ result: 'PASS', evidence, databases, stagingContacted: false }))
  } finally {
    await stageClient.end()
    await cleanClient.end()
  }
}

main().catch(error => {
  const reason = String(error?.message || 'Unknown failure').replaceAll(password || '\0', '[redacted]').slice(0, 4096)
  if (existsSync(evidence)) {
    if (!existsSync(join(evidence, 'STOP.json'))) {
      save('STOP.json', { result: 'STOP', phase, reason, code: error?.code ?? null, journal,
        automaticRetry: false, stagingContacted: false })
    }
    console.error(JSON.stringify({ result: 'STOP', phase, evidence, reason }))
  } else console.error(JSON.stringify({ result: 'LOCAL_PRECHECK_FAILED', reason }))
  process.exitCode = 1
})
