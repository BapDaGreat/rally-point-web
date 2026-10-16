// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { historicalMigrations, historicalSqlSuites } from './fixtures/reservation-resume-baseline'

// Only this unit-test module substitutes historical directory listings. Real
// packager code and negative tests still see/reject the larger working tree.
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
const useHistoricalInventory = () => { listing.migrations = [...historicalMigrations]; listing.suites = [...historicalSqlSuites] }

const parents: string[] = []
const load = () => import('../scripts/reservation-resume-package.mjs')
afterEach(() => {
  listing.migrations = undefined
  listing.suites = undefined
  for (const path of parents.splice(0)) {
    if (!path.startsWith(join(resolve('.'), 'docs/release-private/resume-package-test-'))) throw new Error('Unsafe cleanup')
    rmSync(path, { recursive: true, force: true })
  }
})

describe.sequential('local-only resume verification package', () => {
  it('freezes the 16 historical SQL files, eight historical suites, seed and guard checks without a DB transport', async () => {
    useHistoricalInventory()
    const { prepareResumePackage, verifyResumePackage } = await load()
    const parent = mkdtempSync(join(resolve('.'), 'docs/release-private/resume-package-test-'))
    parents.push(parent)
    const directory = join(parent, 'frozen')
    const result = prepareResumePackage(directory)
    expect(result.databaseContacted).toBe(false)
    expect(result.migrationCount).toBe(16)
    expect(result.sqlSuiteCount).toBe(8)
    expect(result.rehearsalExecuted).toBe(false)
    expect(verifyResumePackage(directory)).toEqual(result)
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
    expect(manifest.productionOrStagingExecutable).toBe(false)
    expect(manifest.readyProofIncluded).toBe(false)
    expect(manifest.orders).toHaveLength(2)
    expect(manifest.gate3.cleanReplaysRequired).toBe(2)
    expect(manifest.files.filter((r: { path: string }) => r.path.startsWith('database/supabase/migrations/'))).toHaveLength(16)
    expect(manifest.files.filter((r: { path: string }) => /\.test\.[cm]?[jt]sx?$/.test(r.path))).toEqual([])
    expect(() => prepareResumePackage(directory)).toThrow(/overwrite/)
    writeFileSync(join(directory, 'unexpected.txt'), 'not authorized')
    expect(() => verifyResumePackage(directory)).toThrow()
  }, 20000)

  it('rejects changed package files and unsafe output locations', async () => {
    useHistoricalInventory()
    const { prepareResumePackage, verifyResumePackage } = await load()
    expect(() => prepareResumePackage(resolve('dist'))).toThrow()
    const parent = mkdtempSync(join(resolve('.'), 'docs/release-private/resume-package-test-'))
    parents.push(parent)
    const directory = join(parent, 'frozen')
    prepareResumePackage(directory)
    writeFileSync(join(directory, 'checks/reservation_resume_state.sql'), 'select true;')
    expect(() => verifyResumePackage(directory)).toThrow()
  }, 20000)

  it('prepares negative tests for missing proof, wrong role, stale binding and absent enforcement', async () => {
    const { resumeNegativeSql, resumeRunPlan } = await load()
    const sql = resumeNegativeSql('do $draft$ begin raise exception \'dummy\'; end $draft$;')
    expect(sql).toContain('extensions.is(pg_temp.resume_attempt(')
    expect(sql).toContain('exception when others then')
    expect(sql).not.toContain('rollback to savepoint')
    expect(sql).toContain('rollback;')
    const plan = resumeRunPlan()
    expect(plan.probeTargetsAreDisposableOnly).toBe(true)
    expect(plan.targetWritesUntilProof).toBe('blocked')
    expect(plan.requiredNegativeCases).toContain('wrong-exclusion-definition')
    expect(plan.requiredNegativeCases).toContain('direct-column-grant')
    expect(plan.requiredNegativeCases).toContain('stale-transaction')
    expect(plan.requiredNegativeCases).toContain('missing-enforcement')
    expect(plan.requiredPostflight).toContain('only-nine-authenticated-execute-grants-and-ledger-entry')
    expect(plan.requiredPostflight).toContain('both-sequences-and-unrelated-data-unchanged')
    expect(plan.stagingResumeAuthorized).toBe(false)
  })

  it('rejects the real expanded migration inventory before creating any package', async () => {
    const { prepareResumePackage } = await load()
    const parent = mkdtempSync(join(resolve('.'), 'docs/release-private/resume-package-test-'))
    parents.push(parent)
    const directory = join(parent, 'rejected-current-inventory')
    expect(() => prepareResumePackage(directory)).toThrow('Unreviewed or missing migration')
    expect(existsSync(directory)).toBe(false)
  })

  it('also rejects a larger SQL suite inventory when migration input is historical', async () => {
    const { prepareResumePackage } = await load()
    listing.migrations = [...historicalMigrations]
    const parent = mkdtempSync(join(resolve('.'), 'docs/release-private/resume-package-test-'))
    parents.push(parent)
    const directory = join(parent, 'rejected-current-suites')
    expect(() => prepareResumePackage(directory)).toThrow('SQL suite inventory changed; review required')
    expect(existsSync(directory)).toBe(false)
  })
})
