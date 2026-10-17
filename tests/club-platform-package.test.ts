// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Only this module substitutes directory listings, to prove unreviewed inventories are refused.
const listing = vi.hoisted(() => ({ migrations: undefined as string[] | undefined, suites: undefined as string[] | undefined }))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const path = await import('node:path')
  return { ...actual, readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
    const directory = path.resolve(String(args[0]))
    if (directory === path.resolve('supabase/migrations') && listing.migrations) return [...listing.migrations]
    if (directory === path.resolve('supabase/tests/database') && listing.suites) return [...listing.suites]
    return actual.readdirSync(...args)
  } }
})

const parents: string[] = []
const loadPackage = () => import('../scripts/club-platform-package.mjs')
const loadChecks = () => import('../scripts/club-platform-checks.mjs')
const tempParent = () => {
  const parent = mkdtempSync(join(resolve('.'), 'docs/release-private/club-platform-package-test-'))
  parents.push(parent)
  return parent
}

afterEach(() => {
  listing.migrations = undefined
  listing.suites = undefined
  for (const path of parents.splice(0)) {
    if (!path.startsWith(join(resolve('.'), 'docs/release-private/club-platform-package-test-'))) throw new Error('Unsafe cleanup')
    rmSync(path, { recursive: true, force: true })
  }
})

describe.sequential('club platform release package', () => {
  it('freezes staging order, the seven-migration package, all suites and the checks without a database', async () => {
    const { prepareClubPlatformPackage, verifyClubPlatformPackage } = await loadPackage()
    const { packageMigrations, stagingMigrations } = await loadChecks()
    const directory = join(tempParent(), 'frozen')
    const result = prepareClubPlatformPackage(directory)
    expect(result).toMatchObject({ migrationCount: 21, packageMigrations: 7, sqlSuiteCount: 14, isolationChecks: 55,
      databaseContacted: false, stagingExecutable: false })
    expect(verifyClubPlatformPackage(directory)).toEqual(result)

    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
    expect(manifest.productionOrStagingExecutable).toBe(false)
    expect(manifest.rehearsalProofIncluded).toBe(false)
    expect(manifest.orders.stage).toEqual([...stagingMigrations, ...packageMigrations])
    expect(manifest.orders.clean).toEqual([...manifest.orders.stage].sort())
    expect(manifest.packageOrder[0]).toBe('20260921111105_tenant_enforcement.sql')
    expect(manifest.target.expectedLedger).toHaveLength(14)
    expect(manifest.files.filter((row: { path: string }) => row.path.startsWith('database/supabase/migrations/'))).toHaveLength(21)
    expect(manifest.files.map((row: { path: string }) => row.path)).toContain('checks/two_club_isolation.sql')
    expect(manifest.files.filter((row: { path: string }) => /\.test\.[cm]?[jt]sx?$/.test(row.path))).toEqual([])

    const plan = JSON.parse(readFileSync(join(directory, 'checks/run-plan.json'), 'utf8'))
    expect(plan.stagingExecutable).toBe(false)
    expect(plan.transportIncluded).toBe(false)
    expect(plan.packageOrder).toEqual([...packageMigrations])

    expect(() => prepareClubPlatformPackage(directory)).toThrow(/overwrite/)
    writeFileSync(join(directory, 'unexpected.txt'), 'not reviewed')
    expect(() => verifyClubPlatformPackage(directory)).toThrow(/inventory/)
  }, 20000)

  it('rejects changed package files and output outside the private folder', async () => {
    const { prepareClubPlatformPackage, verifyClubPlatformPackage } = await loadPackage()
    expect(() => prepareClubPlatformPackage(resolve('dist/club-platform'))).toThrow(/private/)
    const directory = join(tempParent(), 'frozen')
    prepareClubPlatformPackage(directory)
    writeFileSync(join(directory, 'checks/two_club_isolation.sql'), 'select true;')
    expect(() => verifyClubPlatformPackage(directory)).toThrow(/bytes differ/)
  }, 20000)

  it('refuses an unreviewed migration before writing anything', async () => {
    const { prepareClubPlatformPackage } = await loadPackage()
    const { packageMigrations, stagingMigrations } = await loadChecks()
    listing.migrations = [...stagingMigrations, ...packageMigrations, '20261101000000_unreviewed.sql']
    const directory = join(tempParent(), 'rejected-migration')
    expect(() => prepareClubPlatformPackage(directory)).toThrow('Unreviewed or missing migration')
    expect(existsSync(directory)).toBe(false)
  })

  it('refuses a changed SQL suite inventory before writing anything', async () => {
    const { prepareClubPlatformPackage } = await loadPackage()
    const { sqlSuites } = await loadChecks()
    listing.suites = sqlSuites.filter(name => name !== 'tenant_boundary.test.sql')
    const directory = join(tempParent(), 'rejected-suites')
    expect(() => prepareClubPlatformPackage(directory)).toThrow('SQL suite inventory changed; review required')
    expect(existsSync(directory)).toBe(false)
  })
})

describe('club platform release rules', () => {
  it('judges required check rows and reports information rows', async () => {
    const { evaluateChecks, preflightChecks } = await loadChecks()
    const rows = preflightChecks.map(name => ({ check_name: name, required: !['auth_users_insertable', 'pgtap_available', 'club_count'].includes(name), ok: true, detail: name }))
    expect(evaluateChecks(rows, 'preflight')).toMatchObject({ passed: 8, information: { club_count: { ok: true, detail: 'club_count' } } })
    const failing = rows.map(row => row.check_name === 'reservation_writes_paused' ? { ...row, ok: false } : row)
    expect(() => evaluateChecks(failing, 'preflight')).toThrow('preflight failed: reservation_writes_paused')
    const informational = rows.map(row => row.check_name === 'auth_users_insertable' ? { ...row, ok: false } : row)
    expect(evaluateChecks(informational, 'preflight').information.auth_users_insertable.ok).toBe(false)
    expect(() => evaluateChecks(rows.slice(1), 'preflight')).toThrow('check list changed')
    expect(() => evaluateChecks(rows, 'sideflight')).toThrow('Unknown check kind')
  })

  it('reads pgTAP through psql noise but fails on any failure, skip or gap', async () => {
    const { parseTapOutput } = await loadChecks()
    const good = ['{"x-club-id":"c"}', '1..3', 'ok 1 - first', '2c000000-0000-4000-8000-000000000001', 'ok 2 - second', '', 'ok 3 - third'].join('\n')
    expect(parseTapOutput(good, 'good', 3)).toEqual({ name: 'good', planned: 3, passed: 3 })
    expect(() => parseTapOutput(good, 'good', 4)).toThrow('TAP plan changed')
    expect(() => parseTapOutput(good.replace('ok 2', 'not ok 2'), 'bad')).toThrow('not ok 2')
    expect(() => parseTapOutput(good.replace('ok 3 - third', 'ok 3 # SKIP later'), 'skip')).toThrow('SKIP')
    expect(() => parseTapOutput(good.replace('ok 3 - third', ''), 'gap')).toThrow('incomplete')
    expect(() => parseTapOutput(good.replace('1..3', ''), 'plan')).toThrow('TAP plan')
    expect(() => parseTapOutput(good + '\n# Looks like you planned 3 tests but ran 4', 'extra')).toThrow('Looks like')
  })

  it('keeps the package order and plan fixed to what was reviewed', async () => {
    const { clubPlatformOrders, clubPlatformRunPlan, packageMigrations, stagingMigrations } = await loadChecks()
    const names = [...stagingMigrations, ...packageMigrations].sort()
    expect(clubPlatformOrders(names).stage.slice(14)).toEqual([...packageMigrations])
    expect(() => clubPlatformOrders(names.slice(1))).toThrow('Unreviewed or missing migration')
    const plan = clubPlatformRunPlan()
    expect(plan.stagingExecutable).toBe(false)
    expect(plan.requiresBeforeAnyWrite).toContain('a fresh, verified backup of the target')
    expect(plan.notIncluded).toContain('production')
  })
})
