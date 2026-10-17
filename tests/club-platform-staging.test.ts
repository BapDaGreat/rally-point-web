// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const load = () => import('../scripts/club-platform-staging.mjs')
const temps: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'club-platform-staging-test-'))
  temps.push(dir)
  return dir
}
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function linkFiles(ref: string, url: string) {
  const dir = tempDir()
  mkdirSync(join(dir, 'supabase/.temp'), { recursive: true })
  writeFileSync(join(dir, 'supabase/.temp/project-ref'), ref + '\n')
  writeFileSync(join(dir, 'supabase/.temp/pooler-url'), url + '\n')
  return dir
}

async function goodCapture() {
  const { captureFiles, expectedStagingVersions, snapshotNames } = await load()
  const files = [...captureFiles, ...snapshotNames.flatMap((name: string) => [`before_${name}.json`, `after_${name}.json`])]
    .map((file: string) => ({ file, bytes: 10, sha256: 'a'.repeat(64) }))
  return { result: 'CAPTURE_PASS_RESTORE_PENDING', project: 'iclrvvsiwypxlwrwgqia', versions: [...expectedStagingVersions],
    publicFingerprint: 'b'.repeat(32), storageObjects: 0, activeClientsObserved: 0, writeCounterChanges: 0,
    stagingWritesAuthorized: false, startedAt: '2026-10-17T10:00:00Z', endedAt: '2026-10-17T10:05:00Z', tables: 54, files }
}

describe('staging target and secrets', () => {
  it('accepts only the staging session pooler from the CLI link files', async () => {
    const { stagingTarget } = await load()
    const pooler = 'postgresql://postgres.iclrvvsiwypxlwrwgqia@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
    expect(stagingTarget(linkFiles('iclrvvsiwypxlwrwgqia', pooler))).toEqual({ host: 'aws-0-ap-northeast-1.pooler.supabase.com',
      port: '5432', user: 'postgres.iclrvvsiwypxlwrwgqia', database: 'postgres' })
    expect(() => stagingTarget(linkFiles('otherproject', pooler))).toThrow('not staging')
    expect(() => stagingTarget(linkFiles('iclrvvsiwypxlwrwgqia', pooler.replace('@', ':secret@')))).toThrow('must not contain a password')
    expect(() => stagingTarget(linkFiles('iclrvvsiwypxlwrwgqia', pooler.replace('postgres.iclrv', 'postgres.zzzzv')))).toThrow('pooler user')
    expect(() => stagingTarget(linkFiles('iclrvvsiwypxlwrwgqia', pooler.replace('aws-0-ap-northeast-1.pooler.supabase.com', 'evil.example.com')))).toThrow('pooler host')
    expect(() => stagingTarget(linkFiles('iclrvvsiwypxlwrwgqia', pooler.replace(':5432', ':6543')))).toThrow('session pooler')
  })

  it('reads one password from the file and never echoes it in errors', async () => {
    const { readPassword, redact } = await load()
    const dir = tempDir()
    writeFileSync(join(dir, 'ok.local'), '\uFEFF  correct-horse-battery  \r\n')
    expect(readPassword(join(dir, 'ok.local'))).toBe('correct-horse-battery')
    writeFileSync(join(dir, 'two.local'), 'first-password-line\nsecond-line')
    expect(() => readPassword(join(dir, 'two.local'))).toThrow(/one password on one line/)
    try { readPassword(join(dir, 'two.local')) } catch (error) { expect(String(error)).not.toContain('first-password-line') }
    writeFileSync(join(dir, 'short.local'), 'short')
    expect(() => readPassword(join(dir, 'short.local'))).toThrow()
    expect(() => readPassword(join(dir, 'missing.local'))).toThrow('Password file not found')
    expect(redact('url p@ss/word and p%40ss%2Fword', 'p@ss/word')).toBe('url [redacted] and [redacted]')
  })

  it('gives child processes only system variables and named credentials, and refuses target overrides', async () => {
    const { childEnv } = await load()
    const env = childEnv({ PGPASSWORD: 'x'.repeat(10) }, { PATH: 'C:/bin', USERPROFILE: 'C:/u', SUPABASE_ACCESS_TOKEN: 'tok', RANDOM: '1' })
    expect(env).toEqual({ PATH: 'C:/bin', USERPROFILE: 'C:/u', PGPASSWORD: 'x'.repeat(10) })
    expect(() => childEnv({}, { PATH: 'C:/bin', PGHOST: 'elsewhere' })).toThrow('PGHOST')
    expect(() => childEnv({}, { DOCKER_HOST: 'tcp://remote' })).toThrow('DOCKER_HOST')
  })

  it('passes the password to psql only through the environment', async () => {
    const { stagingPsqlArgs } = await load()
    const target = { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: '5432', user: 'postgres.iclrvvsiwypxlwrwgqia', database: 'postgres' }
    const args = stagingPsqlArgs(target, { singleTransaction: true })
    expect(args.slice(0, 3)).toEqual(['exec', '-i', '-e'])
    expect(args).toContain('PGPASSWORD')
    expect(args).toContain('--single-transaction')
    expect(args).toContain('ON_ERROR_STOP=1')
    expect(args.join(' ')).not.toMatch(/password=|:\/\//)
    expect(stagingPsqlArgs(target)).not.toContain('--single-transaction')
  })
})

describe('query and migration wrappers', () => {
  it('wraps a read-only query file and refuses extra statements', async () => {
    const { readOnlyJson } = await load()
    const wrapped = readOnlyJson("-- note\nset search_path = public, extensions;\nwith x as (select 1 as a)\nselect a from x;\n")
    expect(wrapped.startsWith('BEGIN READ ONLY;')).toBe(true)
    expect(wrapped).toContain('set search_path = public, extensions;')
    expect(wrapped).toContain("select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (\nwith x as (select 1 as a)\nselect a from x\n) r;")
    expect(wrapped.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(() => readOnlyJson('select 1; delete from public.members')).toThrow('single SELECT')
    expect(readOnlyJson("select ';' as semi")).toContain("select ';' as semi")
    expect(() => readOnlyJson('delete from public.members')).toThrow('Missing read-only SELECT')
  })

  it('applies one migration and its ledger row in one transaction', async () => {
    const { migrationTransactionSql } = await load()
    const sql = 'create table public.example (id int);'
    const wrapped = migrationTransactionSql('20261017090000_club_context.sql', sql)
    expect(wrapped).toContain("set local lock_timeout = '15s';")
    expect(wrapped).toContain(sql)
    expect(wrapped).toMatch(/insert into supabase_migrations\.schema_migrations \(version, statements, name\) values \('20261017090000', array\[\$migration_[a-f0-9]{16}\$create table public\.example \(id int\);\$migration_[a-f0-9]{16}\$\], 'club_context'\);$/)
    expect(() => migrationTransactionSql('club_context.sql', sql)).toThrow('Unexpected migration name')
    expect(() => migrationTransactionSql('20261017090000_club_context.sql', 'begin;\nselect 1;\ncommit;')).toThrow('own transaction control')
  })

  it('finds every changed, added or removed snapshot row', async () => {
    const { keyedDifferences, snapshotKeys } = await load()
    const before = [{ schema_name: 'public', table_name: 'a', row_count: 1 }, { schema_name: 'public', table_name: 'b', row_count: 2 }]
    expect(keyedDifferences(before, before, snapshotKeys.inventory)).toEqual([])
    const after = [{ schema_name: 'public', table_name: 'a', row_count: 9 }, { schema_name: 'public', table_name: 'c', row_count: 2 }]
    expect(keyedDifferences(before, after, snapshotKeys.inventory)).toEqual(['public.a', 'public.b', 'public.c'])
    expect(() => keyedDifferences([before[0], before[0]], before, snapshotKeys.inventory)).toThrow('Duplicate')
  })
})

describe('backup and approval gates', () => {
  it('accepts a complete capture of the staging baseline and rejects anything weaker', async () => {
    const { validateCaptureManifest } = await load()
    const capture = await goodCapture()
    expect(validateCaptureManifest(capture).versions).toBe(14)
    expect(() => validateCaptureManifest({ ...capture, versions: capture.versions.slice(1) })).toThrow('migration history')
    expect(() => validateCaptureManifest({ ...capture, activeClientsObserved: 1 })).toThrow('active client')
    expect(() => validateCaptureManifest({ ...capture, writeCounterChanges: 2 })).toThrow('Writes')
    expect(() => validateCaptureManifest({ ...capture, files: capture.files.filter((f: { file: string }) => f.file !== 'data.sql') })).toThrow('data.sql')
  })

  it('opens the staging gate only for the approved package, a fresh verified backup, a passing dry run and unchanged staging', async () => {
    const { approvedManifestSha256, expectedStagingVersions, verifyApplyGate } = await load()
    const capture = await goodCapture()
    const captureManifestSha256 = 'c'.repeat(64)
    const good = { manifestSha256: approvedManifestSha256, capture, captureManifestSha256,
      restore: { result: 'PASS', captureManifestSha256 },
      dryRun: { result: 'PASS', captureManifestSha256, manifestSha256: approvedManifestSha256 },
      liveMarker: capture.publicFingerprint, liveVersions: [...expectedStagingVersions], now: Date.parse('2026-10-17T11:05:00Z') }
    expect(verifyApplyGate(good)).toEqual({ captureAgeMinutes: 60 })
    expect(() => verifyApplyGate({ ...good, manifestSha256: 'd'.repeat(64) })).toThrow('not the approved release package')
    expect(() => verifyApplyGate({ ...good, now: Date.parse('2026-10-18T10:06:00Z') })).toThrow('older than 12 hours')
    expect(() => verifyApplyGate({ ...good, restore: { result: 'STOP', captureManifestSha256 } })).toThrow('restored and verified')
    expect(() => verifyApplyGate({ ...good, restore: { result: 'PASS', captureManifestSha256: 'e'.repeat(64) } })).toThrow('different capture')
    expect(() => verifyApplyGate({ ...good, dryRun: { ...good.dryRun, result: 'STOP' } })).toThrow('dry run')
    expect(() => verifyApplyGate({ ...good, dryRun: { ...good.dryRun, manifestSha256: 'f'.repeat(64) } })).toThrow('different package')
    expect(() => verifyApplyGate({ ...good, liveMarker: '0'.repeat(32) })).toThrow('Staging schema changed')
    expect(() => verifyApplyGate({ ...good, liveVersions: [...expectedStagingVersions, '20260921111105'] })).toThrow('history changed')
  })
})
