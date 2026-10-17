// Guarded application of an owner-approved staging release (see `releases` in
// club-platform-staging.mjs). Usage: node scripts/run-staging-release-apply.mjs --release <id> <mode>
//   --verify-local   checks the release files and evidence and prints the manifest SHA-256; no connections.
//   --dry-run-local  restores the release's verified staging capture into a new local database and
//                    runs the exact apply flow against that copy of staging.
//   --apply-staging  runs the same flow against staging, only after every gate passes, including the
//                    owner's approval of this exact manifest (staging-release-approvals.mjs).
// Each mode writes to its own one-shot evidence folder and stops at the first failure.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateChecks, parseTapOutput } from './club-platform-checks.mjs'
import { fingerprintMarker, identitySql, keyedDifferences, loadCapture, localPsql, migrationTransactionSql,
  parseJsonOutput, parseReleaseArgs, project, readOnlyJson, readPassword, releaseManifest, restoreCaptureInto, root,
  sha, snapshotKeys, stagingPsql, stagingTarget, verifyApplyGate } from './club-platform-staging.mjs'
import { releaseApprovals } from './staging-release-approvals.mjs'

const json = path => JSON.parse(readFileSync(path, 'utf8'))

let directory = null
let secret = ''
const phases = []
const startedAt = new Date().toISOString()

function save(name, value) {
  assert.match(name, /^[a-zA-Z0-9_.-]+$/)
  const bytes = Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'
  writeFileSync(join(directory, name), bytes, { flag: 'wx' })
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

/** The apply flow, identical for the dry run and for staging. */
function applyFlow(transport, release, text) {
  const check = name => text(`supabase/verification/${name}`)
  const pauseAudit = label => {
    const audit = rows(transport, `pause-audit-${label}`, check('reservation_write_pause_readonly.sql'))
    assert.equal(audit.length, 66, `${label}: pause audit row count differs`)
    assert.ok(audit.every(row => row.violation === false), `${label}: reservation writes are not paused`)
  }
  // Application tables plus auth.users; live auth session tables may change on their own.
  const appContents = () => rows(transport, 'app-contents', check('backup_content_inventory.sql'))
    .filter(row => ['public', 'private'].includes(row.schema_name) || (row.schema_name === 'auth' && row.table_name === 'users'))

  const [identity] = rows(transport, 'identity', identitySql)
  assert.deepEqual(identity.versions, [...release.baseVersions], 'Migration history is not the release baseline: STOP')
  const state = rows(transport, 'state-check', check(release.stateCheck.file))
  save('state-check.json', state)
  const stateResult = evaluateChecks(state, release.stateCheck.kind)
  const integrity = rows(transport, 'integrity', check('staging_privacy_readonly_preflight.sql'))
  assert.ok(integrity.length === 16 && integrity.every(row => Number(row.issue_count) === 0), 'Data integrity preflight failed: STOP')
  pauseAudit('before')
  const before = rows(transport, 'before-fingerprint', check('schema_fingerprint.sql'))
  save('before-fingerprint.json', before)
  record({ phase: 'preflight', target: transport.label, fingerprint: fingerprintMarker(before), requiredChecks: stateResult.passed })

  for (const name of release.migrations) {
    const sql = text(`supabase/migrations/${name}`)
    const result = transport.run(migrationTransactionSql(name, sql), true)
    if (result.status !== 0) fail(`migration-${name}`, result)
    const [ledger] = rows(transport, `ledger-${name}`, identitySql)
    assert.ok(ledger.versions.includes(name.slice(0, 14)), `${name} is missing from the ledger after commit: STOP`)
    record({ phase: 'migration', target: transport.label, migration: name, sha256: sha(sql), committed: true })
  }
  const [afterIdentity] = rows(transport, 'after-identity', identitySql)
  assert.deepEqual(afterIdentity.versions, [...release.baseVersions, ...release.migrations.map(name => name.slice(0, 14))].sort(),
    'Unexpected migration history after the release: STOP')

  const postChecks = release.postChecks.map(({ file, kind, ignore }) => {
    const result = rows(transport, `post-${file}`, check(file))
    save(`post-${file.replace(/\.sql$/, '')}.json`, result)
    return { file, ...evaluateChecks(result, kind, { ignore }) }
  })
  pauseAudit('after')
  const after = rows(transport, 'after-fingerprint', check('schema_fingerprint.sql'))
  save('after-fingerprint.json', after)
  record({ phase: 'postflight', target: transport.label, fingerprint: fingerprintMarker(after),
    requiredChecks: Object.fromEntries(postChecks.map(result => [result.file, result.passed])) })

  const contentsBefore = appContents()
  const tap = transport.run(check(release.isolation.file))
  if (tap.status !== 0) fail('isolation', tap)
  save('isolation.tap.json', { lines: tap.stdout.split(/\r?\n/) })
  const isolation = parseTapOutput(tap.stdout, release.isolation.file, release.isolation.plan)
  const leftovers = keyedDifferences(contentsBefore, appContents(), snapshotKeys.inventory)
  assert.deepEqual(leftovers, [], 'The isolation test left rows behind')
  record({ phase: 'isolation', target: transport.label, planned: isolation.planned, passed: isolation.passed, leftovers: 0 })
  return { stateCheck: stateResult, postChecks, preReleaseMarker: fingerprintMarker(before),
    postReleaseMarker: fingerprintMarker(after), isolation }
}

function begin(target, extra, manifest, contents) {
  assert.ok(!existsSync(target), 'This evidence folder was already used; runs are one-shot')
  mkdirSync(target, { recursive: true })
  directory = target
  save('ATTEMPT.json', { startedAt, ...extra })
  // A copy of exactly what runs, so the evidence stands on its own.
  save('release-manifest.json', manifest)
  for (const [path, bytes] of contents) save(`release-${path.split('/').at(-1)}`, bytes)
}

async function main() {
  const { release, mode } = parseReleaseArgs(process.argv.slice(2), ['--verify-local', '--dry-run-local', '--apply-staging'])
  const { manifest, sha256: manifestSha256, contents } = releaseManifest(release)
  const text = path => contents.get(path).toString('utf8').replace(/^﻿/, '')
  const dirs = Object.fromEntries(Object.entries(release.dirs).map(([key, value]) => [key, join(root, value)]))
  const approvedSha = releaseApprovals[release.id] ?? null

  if (mode === '--verify-local') {
    console.log(JSON.stringify({ result: 'LOCAL_VERIFIED', release: release.id, manifestSha256,
      approved: approvedSha === manifestSha256, approvedManifestSha256: approvedSha,
      evidence: { capture: existsSync(join(dirs.capture, 'capture_manifest.json')), restore: existsSync(join(dirs.restore, 'result.json')),
        dryRun: existsSync(join(dirs.dryRun, 'RESULT.json')), applied: existsSync(join(dirs.apply, 'RESULT.json')) },
      databaseContacted: false }))
    return
  }

  const capture = loadCapture(dirs.capture, release.baseVersions)
  assert.equal(capture.manifest.release, release.id, 'The capture was made for a different release')
  const restore = json(join(dirs.restore, 'result.json'))
  assert.equal(restore.result, 'PASS', 'The backup has not been restored and verified')
  assert.equal(restore.release, release.id, 'The verified restore is for a different release')
  assert.equal(restore.captureManifestSha256, capture.manifestSha256, 'The verified restore is for a different capture')

  if (mode === '--dry-run-local') {
    const database = release.databases.dryRun
    begin(dirs.dryRun, { kind: 'staging-release-dry-run-on-restored-staging', release: release.id, database,
      manifestSha256, captureManifestSha256: capture.manifestSha256, stagingContacted: false }, manifest, contents)
    restoreCaptureInto(capture, database)
    record({ phase: 'restored', database })
    const result = applyFlow(localTransport(database), release, text)
    // Information only: the local development database, built from the migrations alone.
    const [localIdentity] = rows(localTransport('postgres'), 'local-build-identity', identitySql)
    const localMarker = fingerprintMarker(rows(localTransport('postgres'), 'local-build-fingerprint',
      text('supabase/verification/schema_fingerprint.sql')))
    const localBuild = { versions: localIdentity.versions.length, marker: localMarker, matches: localMarker === result.postReleaseMarker }
    save('RESULT.json', { result: 'PASS', release: release.id, target: `local:${database}`, manifestSha256,
      captureManifestSha256: capture.manifestSha256, ...result, localBuild,
      startedAt, endedAt: new Date().toISOString(), phases, stagingContacted: false })
    console.log(JSON.stringify({ result: 'PASS', mode, release: release.id, database, manifestSha256,
      postReleaseMarker: result.postReleaseMarker, localBuild, stagingContacted: false }))
    return
  }

  assert.ok(approvedSha === manifestSha256, approvedSha ? 'This is not the approved release manifest' : 'The owner has not approved this release')
  const dryRun = json(join(dirs.dryRun, 'RESULT.json'))
  assert.equal(dryRun.release, release.id, 'The dry run was for a different release')
  const target = stagingTarget()
  secret = readPassword()
  begin(dirs.apply, { kind: 'staging-release-apply', release: release.id, project, pooler: target.host, manifestSha256,
    approvedManifestSha256: approvedSha, captureManifestSha256: capture.manifestSha256 }, manifest, contents)
  const transport = stagingTransport(target, secret)
  const [identity] = rows(transport, 'gate-identity', identitySql)
  const liveMarker = fingerprintMarker(rows(transport, 'gate-fingerprint', text('supabase/verification/schema_fingerprint.sql')))
  const gate = verifyApplyGate({ manifestSha256, capture: capture.manifest, captureManifestSha256: capture.manifestSha256,
    restore, dryRun, liveMarker, liveVersions: identity.versions, expectedVersions: release.baseVersions, approvedSha })
  record({ phase: 'gate', ...gate, liveMarker })
  const result = applyFlow(transport, release, text)
  assert.equal(result.postReleaseMarker, dryRun.postReleaseMarker, 'Staging ended in a different schema than the dry run: STOP')
  save('RESULT.json', { result: 'PASS', release: release.id, target: 'staging', project, manifestSha256,
    captureManifestSha256: capture.manifestSha256, ...result, matchesDryRun: true,
    startedAt, endedAt: new Date().toISOString(), phases, productionContacted: false })
  console.log(JSON.stringify({ result: 'PASS', mode, release: release.id, postReleaseMarker: result.postReleaseMarker, matchesDryRun: true }))
}

main().catch(error => {
  const reason = String(error?.message || error).replaceAll(secret || '\0', '[redacted]').slice(0, 4096)
  if (directory && !existsSync(join(directory, 'STOP.json'))) {
    save('STOP.json', { result: 'STOP', startedAt, stoppedAt: new Date().toISOString(), reason, phases, automaticRetry: false })
  }
  console.error(JSON.stringify({ result: directory ? 'STOP' : 'LOCAL_PRECHECK_FAILED', reason }))
  process.exitCode = 1
})
