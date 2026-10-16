// Independent historical fixture; never a filter used by a release executor.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const packet = resolve('docs/release-private/reservation-rpc-resume-20260926-r1/frozen')
const bytes = readFileSync(join(packet, 'manifest.json'))
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
assert.equal(sha(bytes), '3197f0e9a0e79db4879d80080dbf84a0b0381fd87be6cd6da20143827b6c7363')
const manifest = JSON.parse(bytes.toString('utf8')) as { files: { path: string; sha256: string }[] }
const draft = '20260926063659_reservation_rpc_resume.sql'
const migrations: string[] = [], suites: string[] = []
for (const row of manifest.files) {
  if (!row.path.startsWith('database/supabase/')) continue
  assert.equal(sha(readFileSync(join(packet, row.path))), row.sha256, 'Frozen SQL fixture changed')
  if (row.path.endsWith('/' + draft)) continue
  // The fixture requires shared historical SQL bytes to remain identical too.
  assert.equal(sha(readFileSync(resolve(row.path.slice('database/'.length)))), row.sha256, 'Shared historical SQL changed')
  if (row.path.startsWith('database/supabase/migrations/')) migrations.push(row.path.split('/').at(-1)!)
  if (row.path.startsWith('database/supabase/tests/database/')) suites.push(row.path.split('/').at(-1)!)
}
assert.equal(migrations.length, 15)
assert.equal(suites.length, 8)
export const historicalMigrations = Object.freeze(migrations.sort())
export const historicalSqlSuites = Object.freeze(suites.sort())
