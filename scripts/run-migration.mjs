/**
 * One-shot: apply 001_rally_point.sql using the DB password.
 * Usage:
 *   SB_DB_PASSWORD='your-db-password' node scripts/run-migration.mjs
 *
 * Never commit passwords. Service role key cannot run DDL.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const ref = 'ausgoiwwhevrplfetccm'
const password = process.env.SB_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('Set SB_DB_PASSWORD to your Supabase database password.')
  console.error('Dashboard → Project Settings → Database → Database password')
  process.exit(1)
}

const sql = readFileSync(join(root, 'supabase/migrations/001_rally_point.sql'), 'utf8')

const configs = [
  {
    label: 'pooler-session-ap-se-1',
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  },
  {
    label: 'pooler-transaction-ap-se-1',
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  },
  {
    label: 'pooler-session-ap-se-1-alt-user',
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
  },
]

async function connect() {
  let lastErr
  for (const cfg of configs) {
    const client = new pg.Client({
      connectionString: cfg.connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    })
    try {
      await client.connect()
      console.log('connected via', cfg.label)
      return client
    } catch (e) {
      lastErr = e
      console.log('skip', cfg.label, '-', e.message.slice(0, 100))
      try {
        await client.end()
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr
}

const client = await connect()
try {
  console.log('applying migration…')
  await client.query(sql)
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `)
  console.log(
    'public tables:',
    tables.rows.map((r) => r.table_name).join(', '),
  )
  const courts = await client.query('select name, hourly_rate from public.courts order by name')
  console.log('courts:', courts.rows)
  console.log('MIGRATION_OK')
} finally {
  await client.end()
}
