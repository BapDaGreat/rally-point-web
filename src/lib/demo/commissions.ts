import type { ClubAccount, Transaction } from '../../types'
import { todayISO, uid } from './common'
import type { DemoDB } from './model'

/** Court time earns platform commission. Walk-ins and membership fees stay with the club. */
export const COMMISSION_TYPES: ReadonlyArray<Transaction['type']> = ['booking', 'court_rental', 'extension']
export const DEFAULT_COMMISSION_RATE = 5

/** Rounds to the centavo, half away from zero (matches Postgres numeric rounding for amounts). */
export function round2(value: number) {
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100
}

/** The account every club gets automatically (mirrors the clubs insert trigger). */
export function defaultClubAccount(clubId: string, isActive: boolean, now = todayISO()): ClubAccount {
  return {
    club_id: clubId,
    status: isActive ? 'active' : 'provisioning',
    commission_rate: DEFAULT_COMMISSION_RATE,
    city: null,
    address: null,
    contact_email: null,
    contact_phone: null,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Mirrors the transactions trigger: a court-time charge records one commission
 * line at the club's current rate. Recorded charges are not collected money.
 */
export function recordCommission(db: DemoDB, tx: Transaction) {
  if (!tx.club_id || !COMMISSION_TYPES.includes(tx.type) || !(tx.amount > 0)) return
  if (db.commissions.some((line) => line.transaction_id === tx.id)) return
  const rate = db.clubAccounts.find((account) => account.club_id === tx.club_id)?.commission_rate ?? DEFAULT_COMMISSION_RATE
  const commission = round2((tx.amount * rate) / 100)
  db.commissions.unshift({
    id: uid('commission'),
    club_id: tx.club_id,
    venue_id: tx.venue_id ?? null,
    transaction_id: tx.id,
    gross_amount: tx.amount,
    commission_rate: rate,
    commission_amount: commission,
    club_net_amount: round2(tx.amount - commission),
    verification_status: tx.verification_status ?? 'unverified',
    created_at: tx.created_at || todayISO(),
  })
}

/** Records a charge (newest first or last, as each caller already did) and its commission line. */
export function recordTransaction(db: DemoDB, tx: Transaction, position: 'first' | 'last' = 'last'): Transaction {
  const row: Transaction = { ...tx, verification_status: tx.verification_status ?? 'unverified' }
  if (position === 'first') db.transactions.unshift(row)
  else db.transactions.push(row)
  recordCommission(db, row)
  return row
}
