// Filesystem-only package builder for the club platform release.
// No database or network transport is present; nothing here can touch staging.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { clubPlatformOrders, clubPlatformRunPlan, isolationCheckCount, packageMigrations,
  stagingMigrations, verifySuiteInventory } from './club-platform-checks.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
export const defaultPackage = resolve(root, 'docs/release-private/club-platform-20261017-r1/frozen')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => readFileSync(join(root, path))
const equal = (a, b, message) => assert.ok(isDeepStrictEqual(a, b), message)

// The staging platform capture the disposable rehearsal databases start from.
export const bootstrapReferences = Object.freeze([
  ['docs/release-private/staging-backup-20260921/managed_before_app.sql', '1362786cb937ae58addd1c41ba135f6f73247f979f2b164df5c698f2a0a7d617'],
  ['docs/release-private/staging-backup-20260921/history_schema.sql', '18b99fbbb3ec9fbb964bb255a56171329acd99b6977ece2addd89fdf5aa5105b'],
])

const checkFiles = [
  'club_platform_preflight.sql', 'club_platform_postflight.sql', 'two_club_isolation.sql',
  'schema_fingerprint.sql', 'restore_catalog_snapshot.sql', 'tenant_grant_snapshot.sql',
  'backup_content_inventory.sql', 'reservation_write_pause_readonly.sql',
]

function packagePath(value) {
  const path = resolve(value)
  const rel = relative(root, path).replaceAll('\\', '/')
  assert.ok(/^docs\/release-private\/[a-zA-Z0-9_/-]+$/.test(rel), 'Package must stay private and repository-local')
  let partPath = root
  for (const part of rel.split('/')) {
    partPath = join(partPath, part)
    if (existsSync(partPath)) assert.ok(!lstatSync(partPath).isSymbolicLink(), 'Package links forbidden')
  }
  return path
}

function inventory(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Package links forbidden')
    const path = prefix + entry.name
    return entry.isDirectory() ? inventory(join(directory, entry.name), path + '/') : [path]
  }).sort()
}

function material() {
  for (const [path, digest] of bootstrapReferences) assert.equal(sha(read(path)), digest, 'Pinned staging bootstrap changed')
  const names = readdirSync(join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort()
  const orders = clubPlatformOrders(names)
  const suites = readdirSync(join(root, 'supabase/tests/database')).filter(name => name.endsWith('.test.sql')).sort()
  verifySuiteInventory(suites)
  const isolation = read('supabase/verification/two_club_isolation.sql').toString('utf8')
  assert.ok(isolation.includes(`select extensions.plan(${isolationCheckCount});`), 'Isolation test plan changed; review required')
  assert.ok(/\nrollback;\s*$/.test(isolation), 'Isolation test must end with rollback')

  const files = new Map()
  for (const name of names) files.set('database/supabase/migrations/' + name, read('supabase/migrations/' + name))
  files.set('database/supabase/seed.sql', read('supabase/seed.sql'))
  for (const name of suites) files.set('database/supabase/tests/database/' + name, read('supabase/tests/database/' + name))
  for (const name of checkFiles) files.set('checks/' + name, read('supabase/verification/' + name))
  files.set('checks/run-plan.json', Buffer.from(JSON.stringify(clubPlatformRunPlan(), null, 2) + '\n'))
  for (const name of ['club-platform-checks.mjs', 'club-platform-package.mjs']) files.set('source/' + name, read('scripts/' + name))
  // Provenance copy; the .txt suffix keeps it from becoming a second Vitest suite.
  files.set('regression/club-platform-package.test.ts.txt', read('tests/club-platform-package.test.ts'))

  const manifest = {
    kind: 'club-platform-release-candidate-v1',
    productionOrStagingExecutable: false,
    rehearsalProofIncluded: false,
    target: { name: 'Rally-Point-Database', ref: 'iclrvvsiwypxlwrwgqia',
      expectedLedger: stagingMigrations.map(name => name.split('_')[0]) },
    packageOrder: [...packageMigrations],
    orders,
    migrationCount: names.length,
    sqlSuites: suites,
    isolationChecks: isolationCheckCount,
    bootstrapReferences: bootstrapReferences.map(([path, sha256]) => ({ path, sha256 })),
    files: [...files].map(([path, bytes]) => ({ path, sha256: sha(bytes) })).sort((a, b) => a.path.localeCompare(b.path)),
  }
  return { files, manifest }
}

export function verifyClubPlatformPackage(directory = defaultPackage) {
  const target = packagePath(directory)
  const { files, manifest } = material()
  equal(JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8')), manifest, 'Package manifest differs from the working tree')
  equal(inventory(target), [...files.keys(), 'manifest.json'].sort(), 'Package inventory differs')
  for (const [path, bytes] of files) assert.equal(sha(readFileSync(join(target, path))), sha(bytes), `Package bytes differ: ${path}`)
  return {
    result: 'LOCAL_PREPARED_NOT_REHEARSED',
    migrationCount: manifest.migrationCount,
    packageMigrations: manifest.packageOrder.length,
    sqlSuiteCount: manifest.sqlSuites.length,
    isolationChecks: manifest.isolationChecks,
    files: files.size,
    manifestSha256: sha(readFileSync(join(target, 'manifest.json'))),
    databaseContacted: false,
    stagingExecutable: false,
  }
}

export function prepareClubPlatformPackage(directory = defaultPackage) {
  const target = packagePath(directory)
  assert.ok(!existsSync(target), 'Never overwrite a release package')
  const { files, manifest } = material()
  mkdirSync(target, { recursive: true })
  for (const [path, bytes] of files) {
    const file = join(target, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, bytes, { flag: 'wx' })
  }
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return verifyClubPlatformPackage(target)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 3 && ['--prepare-local', '--verify-local'].includes(process.argv[2]),
    'Only --prepare-local or --verify-local is supported; there is no database mode')
  console.log(JSON.stringify(process.argv[2] === '--prepare-local' ? prepareClubPlatformPackage() : verifyClubPlatformPackage(), null, 2))
}
