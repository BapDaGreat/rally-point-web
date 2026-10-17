// Guarded application of the approved club platform package.
//   --verify-local   checks the package, the approval and the evidence files; no connections.
//   --dry-run-local  restores the verified staging capture into a new local database and
//                    runs the exact apply flow against that real copy of staging.
//   --apply-staging  runs the same flow against staging, only after every gate passes.
// Each mode writes to its own one-shot evidence folder and stops at the first failure.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateChecks, isolationCheckCount, packageMigrations, parseTapOutput } from './club-platform-checks.mjs'
import { defaultPackage, verifyClubPlatformPackage } from './club-platform-package.mjs'
import { approvedManifestSha256, expectedStagingVersions, fingerprintMarker, identitySql, keyedDifferences, loadCapture,
  localPsql, migrationTransactionSql, parseJsonOutput, readOnlyJson, readPassword, restoreCaptureInto, root, sha,
  snapshotKeys, stagingPsql, stagingTarget, verifyApplyGate } from './club-platform-staging.mjs'

const captureDirectory = join(root, 'docs/release-private/staging-backup-20261017-r1')
const restoreDirectory = join(root, 'docs/release-private/staging-backup-restore-20261017-r1')
const dryRunDirectory = join(root, 'docs/release-private/club-platform-staging-dryrun-20261017-r1')
const applyDirectory = join(root, 'docs/release-private/club-platform-staging-apply-20261017-r1')
const dryRunDatabase = 'rally_staging_backup_20261017_dryrun'
// Post-package schema fingerprint from local rehearsal r3 (migration-built staging order).
const rehearsedPostPackageMarker = '8ad4a5168428cda7b593a4d94da32ec0'
const frozen = path => readFileSync(join(defaultPackage, path), 'utf8').replace(/^﻿/, '')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

let directory = null
let secret = ''
const phases = []
const startedAt = new Date().toISOString()

function save(name, value) {
  assert.match(name, /^[a-zA-Z0-9_.-]+$/)
  writeFileSync(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
function record(value) {
  phases.push({ ...value, at: new Date().toISOString() })
  console.log(JSON.stringify(value))
}
function fail(name, result) {
  save(`failure-${name.replaceAll(/[^a-zA-Z0-9_.-]/g, '-')}.private.txt`, String(result.stderr || result.error || 'No diagnostic').slice(0, 16384))
  throw new Error(`${name} failed; diagnostic kept privately`)
}

// The only two ways this runner reaches a database.
const stagingTransport = (target, password) => ({
  label: 'staging',
  run: (sql, singleTransaction = false) => stagingPsql(target, password, sql, { singleTransaction }),
})
const localTransport = database => ({
  label: `local:${database}`,
  run: (sql, singleTransaction = false) => localPsql(database, sql, { role: 'postgres', singleTransaction, allowed: [database] }),
})

function rows(transport, name, sql) {
  const result = transport.run(readOnlyJson(sql))
  if (result.status !== 0) fail(name, result)
  return parseJsonOutput(result.stdout, name)
}

function pauseAudit(transport, label) {
  const audit = rows(transport, `pause-audit-${label}`, frozen('checks/reservation_write_pause_readonly.sql'))
  assert.equal(audit.length, 66, `${label}: pause audit row count differs`)
  assert.ok(audit.every(row => row.violation === false), `${label}: reservation writes are not paused`)
}

// Application tables plus auth.users; live auth session tables may change on their own.
const appContents = transport => rows(transport, 'app-contents', frozen('checks/backup_content_inventory.sql'))
  .filter(row => ['public', 'private'].includes(row.schema_name) || (row.schema_name === 'auth' && row.table_name === 'users'))

/** The apply flow, identical for the dry run and for staging. */
function applyFlow(transport) {
  const [identity] = rows(transport, 'identity', identitySql)
  assert.deepEqual(identity.versions, [...expectedStagingVersions], 'Migration history is not the staging baseline: STOP')
  const preflight = rows(transport, 'preflight', frozen('checks/club_platform_preflight.sql'))
  save('preflight.json', preflight)
  const preflightResult = evaluateChecks(preflight, 'preflight')
  const integrity = rows(transport, 'integrity', readFileSync(join(captureDirectory, 'staging_privacy_readonly_preflight.sql'), 'utf8'))
  assert.ok(integrity.length === 16 && integrity.every(row => Number(row.issue_count) === 0), 'Data integrity preflight failed: STOP')
  pauseAudit(transport, 'before')
  const before = rows(transport, 'before-fingerprint', frozen('checks/schema_fingerprint.sql'))
  save('before-fingerprint.json', before)
  record({ phase: 'preflight', target: transport.label, fingerprint: fingerprintMarker(before), requiredChecks: preflightResult.passed })

  for (const name of packageMigrations) {
    const sql = frozen('database/supabase/migrations/' + name)
    const result = transport.run(migrationTransactionSql(name, sql), true)
    if (result.status !== 0) fail(`migration-${name}`, result)
    const [ledger] = rows(transport, `ledger-${name}`, identitySql)
    assert.ok(ledger.versions.includes(name.slice(0, 14)), `${name} is missing from the ledger after commit: STOP`)
    record({ phase: 'migration', target: transport.label, migration: name, sha256: sha(sql), committed: true })
  }

  const postflight = rows(transport, 'postflight', frozen('checks/club_platform_postflight.sql'))
  save('postflight.json', postflight)
  const postflightResult = evaluateChecks(postflight, 'postflight')
  pauseAudit(transport, 'after')
  const after = rows(transport, 'after-fingerprint', frozen('checks/schema_fingerprint.sql'))
  save('after-fingerprint.json', after)

  const contentsBefore = appContents(transport)
  const tap = transport.run(frozen('checks/two_club_isolation.sql'))
  if (tap.status !== 0) fail('two-club-isolation', tap)
  save('two-club-isolation.tap.json', { lines: tap.stdout.split(/\r?\n/) })
  const isolation = parseTapOutput(tap.stdout, 'two_club_isolation', isolationCheckCount)
  const leftovers = keyedDifferences(contentsBefore, appContents(transport), snapshotKeys.inventory)
  assert.deepEqual(leftovers, [], 'The isolation test left rows behind')
  record({ phase: 'isolation', target: transport.label, planned: isolation.planned, passed: isolation.passed, leftovers: 0 })
  return { requiredPreflight: preflightResult.passed, requiredPostflight: postflightResult.passed,
    information: { ...preflightResult.information, ...postflightResult.information },
    prePackageMarker: fingerprintMarker(before), postPackageMarker: fingerprintMarker(after), isolation }
}

function begin(target, extra) {
  assert.ok(!existsSync(target), 'This evidence folder was already used; runs are one-shot')
  mkdirSync(target, { recursive: true })
  directory = target
  save('ATTEMPT.json', { startedAt, runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))), ...extra })
}

async function main() {
  const mode = process.argv[2]
  assert.ok(process.argv.length === 3 && ['--verify-local', '--dry-run-local', '--apply-staging'].includes(mode),
    'Use --verify-local, --dry-run-local or --apply-staging')
  const verified = verifyClubPlatformPackage(defaultPackage)
  assert.equal(verified.manifestSha256, approvedManifestSha256, 'This is not the approved release package')

  if (mode === '--verify-local') {
    console.log(JSON.stringify({ result: 'LOCAL_VERIFIED', manifestSha256: verified.manifestSha256, approved: true,
      evidence: { capture: existsSync(join(captureDirectory, 'capture_manifest.json')),
        restore: existsSync(join(restoreDirectory, 'result.json')), dryRun: existsSync(join(dryRunDirectory, 'RESULT.json')),
        applied: existsSync(join(applyDirectory, 'RESULT.json')) }, databaseContacted: false }))
    return
  }

  const capture = loadCapture(captureDirectory)
  const restore = json(join(restoreDirectory, 'result.json'))
  assert.equal(restore.result, 'PASS', 'The backup has not been restored and verified')
  assert.equal(restore.captureManifestSha256, capture.manifestSha256, 'The verified restore is for a different capture')

  if (mode === '--dry-run-local') {
    begin(dryRunDirectory, { kind: 'club-platform-dry-run-on-restored-staging', database: dryRunDatabase,
      manifestSha256: verified.manifestSha256, captureManifestSha256: capture.manifestSha256, stagingContacted: false })
    restoreCaptureInto(capture, dryRunDatabase)
    record({ phase: 'restored', database: dryRunDatabase })
    const result = applyFlow(localTransport(dryRunDatabase))
    save('RESULT.json', { result: 'PASS', target: `local:${dryRunDatabase}`, manifestSha256: verified.manifestSha256,
      captureManifestSha256: capture.manifestSha256, ...result,
      matchesRehearsedPostPackage: result.postPackageMarker === rehearsedPostPackageMarker,
      startedAt, endedAt: new Date().toISOString(), phases, stagingContacted: false })
    console.log(JSON.stringify({ result: 'PASS', mode, database: dryRunDatabase, postPackageMarker: result.postPackageMarker,
      matchesRehearsedPostPackage: result.postPackageMarker === rehearsedPostPackageMarker, stagingContacted: false }))
    return
  }

  const dryRun = json(join(dryRunDirectory, 'RESULT.json'))
  const target = stagingTarget()
  secret = readPassword()
  begin(applyDirectory, { kind: 'club-platform-staging-apply', project: 'iclrvvsiwypxlwrwgqia', pooler: target.host,
    manifestSha256: verified.manifestSha256, captureManifestSha256: capture.manifestSha256, approval: 'owner, 2026-10-17: approve, run after backup' })
  const transport = stagingTransport(target, secret)
  const [identity] = rows(transport, 'gate-identity', identitySql)
  const liveFingerprint = rows(transport, 'gate-fingerprint', frozen('checks/schema_fingerprint.sql'))
  const gate = verifyApplyGate({ manifestSha256: verified.manifestSha256, capture: capture.manifest,
    captureManifestSha256: capture.manifestSha256, restore, dryRun,
    liveMarker: fingerprintMarker(liveFingerprint), liveVersions: identity.versions })
  record({ phase: 'gate', ...gate, liveMarker: fingerprintMarker(liveFingerprint) })
  const result = applyFlow(transport)
  assert.equal(result.postPackageMarker, dryRun.postPackageMarker, 'Staging ended in a different schema than the dry run: STOP')
  save('RESULT.json', { result: 'PASS', target: 'staging', project: 'iclrvvsiwypxlwrwgqia', manifestSha256: verified.manifestSha256,
    captureManifestSha256: capture.manifestSha256, ...result, matchesDryRun: true,
    startedAt, endedAt: new Date().toISOString(), phases, productionContacted: false })
  console.log(JSON.stringify({ result: 'PASS', mode, postPackageMarker: result.postPackageMarker, matchesDryRun: true }))
}

main().catch(error => {
  const reason = String(error?.message || error).replaceAll(secret || '\0', '[redacted]').slice(0, 4096)
  if (directory && !existsSync(join(directory, 'STOP.json'))) {
    save('STOP.json', { result: 'STOP', startedAt, stoppedAt: new Date().toISOString(), reason, phases, automaticRetry: false })
  }
  console.error(JSON.stringify({ result: directory ? 'STOP' : 'LOCAL_PRECHECK_FAILED', reason }))
  process.exitCode = 1
})
