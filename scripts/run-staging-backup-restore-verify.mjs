// Restores a release's fresh staging capture into one new local database and proves
// it matches. Never contacts staging. One-shot: no retry, no reuse, no cleanup.
// Usage: node scripts/run-staging-backup-restore-verify.mjs --release <id> --verify-local|--execute-local
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { compareCatalog } from './restore-catalog-checks.mjs'
import { keyedDifferences, loadCapture, localImage, localPsql, localRows, parseReleaseArgs, project, restoreCaptureInto,
  root, sequenceSql, sha, snapshotKeys } from './club-platform-staging.mjs'

let directory = null
let scratch = null
const phases = []
const startedAt = new Date().toISOString()
let started = false

function save(name, value) {
  assert.match(name, /^[a-zA-Z0-9_.-]+$/)
  writeFileSync(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
function record(value) {
  phases.push({ ...value, at: new Date().toISOString() })
  console.log(JSON.stringify(value))
}
function compare(name, expected, actual, key) {
  const differences = keyedDifferences(expected, actual, key)
  if (differences.length) save(`${name}-differences.json`, differences)
  assert.equal(differences.length, 0, `${name}: ${differences.length} differences (kept privately)`)
  record({ phase: name, entries: actual.length, differences: 0 })
}

async function main() {
  const { release, mode } = parseReleaseArgs(process.argv.slice(2), ['--verify-local', '--execute-local'])
  directory = join(root, release.dirs.restore)
  scratch = release.databases.restore
  const capture = loadCapture(join(root, release.dirs.capture), release.baseVersions)
  assert.equal(capture.manifest.release, release.id, 'The capture was made for a different release')
  assert.ok(isDeepStrictEqual(capture.manifest.stateCheck, { ...release.stateCheck }), 'The capture used a different state check')
  if (mode === '--verify-local') {
    console.log(JSON.stringify({ result: 'LOCAL_READY_RESTORE_PENDING', release: release.id, captureManifestSha256: capture.manifestSha256,
      files: capture.manifest.files.length, tables: capture.inventory.length, dataFiles: capture.dataFiles,
      databaseConnected: false, stagingContacted: false }))
    return
  }
  assert.ok(!existsSync(directory), 'This restore folder was already used; restores are one-shot')
  mkdirSync(directory, { recursive: true })
  started = true
  save('ATTEMPT.json', { kind: 'disposable-local-restore', release: release.id, database: scratch, captureManifestSha256: capture.manifestSha256,
    restoreScriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))), startedAt, stagingContacted: false })

  restoreCaptureInto(capture, scratch)
  record({ phase: 'restore', database: scratch, transaction: 'committed' })

  const sql = name => capture.read(name)
  compare('public_fingerprint', capture.json('before_fingerprint.json'), localRows(scratch, sql('schema_fingerprint.sql')), snapshotKeys.fingerprint)
  compare('table_contents', capture.inventory, localRows(scratch, sql('backup_content_inventory.sql')), snapshotKeys.inventory)
  const restoredCatalog = localRows(scratch, sql('restore_catalog_snapshot.sql'))[0].objects
  const catalogDifferences = compareCatalog(capture.catalog, restoredCatalog)
  if (catalogDifferences.length) save('catalog-differences.json', catalogDifferences)
  assert.equal(catalogDifferences.length, 0, `Full catalog: ${catalogDifferences.length} differences (kept privately)`)
  record({ phase: 'full_catalog', entries: restoredCatalog.length, differences: 0 })
  assert.ok(isDeepStrictEqual(capture.json('before_grants.json')[0].snapshot, localRows(scratch, sql('tenant_grant_snapshot.sql'))[0].snapshot),
    'Effective grants or migration history differ')
  record({ phase: 'effective_grants_history', versions: capture.manifest.versions.length, differences: 0 })
  compare('sequences', capture.json('before_sequences.json'), localRows(scratch, sequenceSql), snapshotKeys.sequences)
  compare('integrity_preflight', capture.json('before_privacy.json'), localRows(scratch, sql('staging_privacy_readonly_preflight.sql')), snapshotKeys.privacy)
  compare('state_check', capture.json('before_preflight.json'), localRows(scratch, sql(release.stateCheck.file)), snapshotKeys.preflight)

  const roles = localPsql(scratch, `BEGIN;\n${sql('roles.sql')}\nROLLBACK;`, { role: 'supabase_admin', allowed: [scratch] })
  assert.equal(roles.status, 0, 'The captured role script does not run')
  record({ phase: 'role_script', transaction: 'rolled back' })

  const syntheticId = '66666666-1111-4111-8111-111111111127'
  const signup = localPsql(scratch, `BEGIN;
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${syntheticId}', 'restore-club-platform@example.invalid', '{"full_name":"Restore Check","role":"admin"}'::jsonb);
    SELECT (SELECT role::text FROM public.profiles WHERE id = '${syntheticId}') || '|' ||
      (SELECT count(*) FROM public.members m JOIN public.clubs c ON c.id = m.club_id WHERE m.user_id = '${syntheticId}' AND c.slug = 'rally-point-gensan') || '|' ||
      (SELECT count(*) FROM public.club_staff_roles WHERE user_id = '${syntheticId}');
    ROLLBACK;`, { role: 'supabase_admin', allowed: [scratch] })
  assert.equal(signup.status, 0, 'Signup probe failed to run')
  assert.equal(signup.stdout.trim(), 'member|1|0', 'Signup trigger or member-only role failure')
  record({ phase: 'signup', role: 'member', clubMemberships: 1, staffRoles: 0, transaction: 'rolled back' })
  compare('post_probe_contents', capture.inventory, localRows(scratch, sql('backup_content_inventory.sql')), snapshotKeys.inventory)

  save('result.json', { result: 'PASS', release: release.id, project, database: scratch, startedAt, endedAt: new Date().toISOString(),
    captureManifestSha256: capture.manifestSha256, restoreScriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    image: localImage, phases, stagingContacted: false, stagingChanged: false,
    limitations: ['Logical database recovery only; hosted Auth, API and Storage services are not exercised.',
      'Platform roles come from the local Supabase image; the captured role script is checked rollback-only.',
      'Encryption root keys and hosted settings are not included.',
      'The local image is 17.6.1.147; hosted staging runs a newer 17.6 build.'] })
  console.log(JSON.stringify({ result: 'PASS', database: scratch, catalogEntries: restoredCatalog.length, stagingContacted: false }))
}

main().catch(error => {
  if (started && !existsSync(join(directory, 'STOP.json'))) {
    save('STOP.json', { result: 'STOP', database: scratch, startedAt, stoppedAt: new Date().toISOString(),
      reason: String(error?.message || error).slice(0, 4096), phases })
  }
  console.error(JSON.stringify({ result: started ? 'STOP' : 'LOCAL_PRECHECK_FAILED', reason: String(error?.message || error) }))
  process.exitCode = 1
})
