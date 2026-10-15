import type { Branch, PlatformCommission, SuperadminStats } from '../../types'
import { todayISO, uid } from './common'
import { load, save } from './persistence'

function requireSuperadmin(db: ReturnType<typeof load>) {
  const actor = db.profiles.find((profile) => profile.id === db.sessionUserId)
  if (actor?.role !== 'superadmin') throw new Error('Only superadmins can manage platform branches')
}

export const superadminOperations = {
  listBranches(): Branch[] {
    return load().branches
  },
  createBranch(input: Omit<Branch, 'id' | 'created_at'>): Branch {
    const db = load()
    requireSuperadmin(db)
    const slug = input.slug.trim().toLowerCase()
    if (db.branches.some((branch) => branch.slug.toLowerCase() === slug)) throw new Error('Branch slug already exists')
    const branch: Branch = { ...input, slug, id: uid('branch'), created_at: todayISO() }
    db.branches.push(branch)
    save(db)
    return branch
  },
  updateBranchStatus(id: string, status: Branch['status']): Branch {
    const db = load()
    requireSuperadmin(db)
    const index = db.branches.findIndex((branch) => branch.id === id)
    if (index < 0) throw new Error('Branch not found')
    db.branches[index] = { ...db.branches[index], status }
    save(db)
    return db.branches[index]
  },
  listCommissions(): PlatformCommission[] {
    return load().commissions.slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  },
  superadminStats(): SuperadminStats {
    const db = load()
    return {
      totalGrossVolume: db.commissions.reduce((sum, commission) => sum + commission.gross_amount, 0),
      totalCommissionsEarned: db.commissions.reduce((sum, commission) => sum + commission.commission_amount, 0),
      activeBranchesCount: db.branches.filter((branch) => branch.status === 'active').length,
      totalBookingsCount: db.commissions.length,
    }
  },
}
