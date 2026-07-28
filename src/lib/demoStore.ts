import type {
  CheckIn,
  Court,
  CourtSession,
  DashboardStats,
  Member,
  MembershipType,
  Notification,
  Profile,
  Role,
  Transaction,
  WalkIn,
} from '../types'

const KEY = 'rally_point_demo_v1'

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

function todayISO() {
  return new Date().toISOString()
}

function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface DemoDB {
  profiles: Profile[]
  members: Member[]
  courts: Court[]
  sessions: CourtSession[]
  checkins: CheckIn[]
  transactions: Transaction[]
  notifications: Notification[]
  walkins: WalkIn[]
  passwords: Record<string, string>
  sessionUserId: string | null
}

function seed(): DemoDB {
  const adminId = 'user_admin'
  const staffId = 'user_staff'
  const memberUserId = 'user_member'

  const profiles: Profile[] = [
    {
      id: adminId,
      email: 'admin@rallypoint.local',
      full_name: 'Alex Admin',
      role: 'admin',
      phone: '+63 917 000 0001',
      created_at: todayISO(),
    },
    {
      id: staffId,
      email: 'staff@rallypoint.local',
      full_name: 'Sam Staff',
      role: 'staff',
      phone: '+63 917 000 0002',
      created_at: todayISO(),
    },
    {
      id: memberUserId,
      email: 'member@rallypoint.local',
      full_name: 'Mia Member',
      role: 'member',
      phone: '+63 917 555 0101',
      created_at: todayISO(),
    },
  ]

  const members: Member[] = [
    {
      id: 'mem_001',
      user_id: memberUserId,
      member_code: 'RP-1001',
      full_name: 'Mia Member',
      email: 'member@rallypoint.local',
      phone: '+63 917 555 0101',
      membership_type: 'premium',
      status: 'active',
      join_date: daysFromNow(-120),
      expiry_date: daysFromNow(45),
      created_at: todayISO(),
    },
    {
      id: 'mem_002',
      user_id: null,
      member_code: 'RP-1002',
      full_name: 'Jonah Cruz',
      email: 'jonah@email.com',
      phone: '+63 918 222 3344',
      membership_type: 'standard',
      status: 'active',
      join_date: daysFromNow(-40),
      expiry_date: daysFromNow(20),
      created_at: todayISO(),
    },
    {
      id: 'mem_003',
      user_id: null,
      member_code: 'RP-1003',
      full_name: 'Liza Santos',
      email: 'liza@email.com',
      phone: '+63 919 888 1212',
      membership_type: 'basic',
      status: 'expired',
      join_date: daysFromNow(-400),
      expiry_date: daysFromNow(-10),
      created_at: todayISO(),
    },
  ]

  // pad to ~40 for admin stats like Figma
  for (let i = 4; i <= 40; i++) {
    members.push({
      id: `mem_${String(i).padStart(3, '0')}`,
      user_id: null,
      member_code: `RP-${1000 + i}`,
      full_name: `Member ${i}`,
      email: `member${i}@email.com`,
      phone: `+63 900 000 ${String(i).padStart(4, '0')}`,
      membership_type: (['basic', 'standard', 'premium'] as MembershipType[])[i % 3],
      status: i % 9 === 0 ? 'expired' : 'active',
      join_date: daysFromNow(-30 - i),
      expiry_date: daysFromNow(60 - (i % 20)),
      created_at: todayISO(),
    })
  }

  const courts: Court[] = [
    { id: 'court_1', name: 'Court A', status: 'occupied', hourly_rate: 500 },
    { id: 'court_2', name: 'Court B', status: 'available', hourly_rate: 500 },
    { id: 'court_3', name: 'Court C', status: 'occupied', hourly_rate: 650 },
    { id: 'court_4', name: 'Court D', status: 'available', hourly_rate: 650 },
  ]

  const now = Date.now()
  const sessions: CourtSession[] = [
    {
      id: 'ses_1',
      court_id: 'court_1',
      member_id: 'mem_001',
      start_at: new Date(now - 40 * 60000).toISOString(),
      end_at: new Date(now + 20 * 60000).toISOString(),
      status: 'playing',
      amount: 500,
      created_by: staffId,
    },
    {
      id: 'ses_2',
      court_id: 'court_3',
      member_id: 'mem_002',
      start_at: new Date(now - 15 * 60000).toISOString(),
      end_at: new Date(now + 45 * 60000).toISOString(),
      status: 'playing',
      amount: 650,
      created_by: staffId,
    },
  ]

  const checkins: CheckIn[] = [
    {
      id: 'ci_1',
      member_id: 'mem_001',
      checked_in_at: new Date(now - 50 * 60000).toISOString(),
      staff_id: staffId,
    },
    {
      id: 'ci_2',
      member_id: 'mem_002',
      checked_in_at: new Date(now - 20 * 60000).toISOString(),
      staff_id: staffId,
    },
  ]

  const transactions: Transaction[] = [
    {
      id: 'tx_1',
      member_id: 'mem_001',
      amount: 2500,
      type: 'membership',
      description: 'Premium membership renewal',
      created_at: new Date(now - 2 * 3600000).toISOString(),
      created_by: adminId,
    },
    {
      id: 'tx_2',
      member_id: 'mem_002',
      amount: 500,
      type: 'court_rental',
      description: 'Court A — 1 hour',
      created_at: new Date(now - 90 * 60000).toISOString(),
      created_by: staffId,
    },
    {
      id: 'tx_3',
      member_id: null,
      amount: 350,
      type: 'walk_in',
      description: 'Walk-in day pass',
      created_at: new Date(now - 30 * 60000).toISOString(),
      created_by: staffId,
    },
    {
      id: 'tx_4',
      member_id: 'mem_001',
      amount: 500,
      type: 'extension',
      description: 'Extend Court A +1 hour',
      created_at: new Date(now - 10 * 60000).toISOString(),
      created_by: staffId,
    },
  ]

  // bulk today revenue to ~20040 like Figma
  let sum = transactions.reduce((a, t) => a + t.amount, 0)
  let k = 5
  while (sum < 20040) {
    const add = Math.min(800, 20040 - sum)
    transactions.push({
      id: `tx_${k++}`,
      member_id: members[k % members.length].id,
      amount: add,
      type: k % 2 === 0 ? 'court_rental' : 'membership',
      description: k % 2 === 0 ? 'Court rental' : 'Membership fee',
      created_at: new Date(now - k * 600000).toISOString(),
      created_by: adminId,
    })
    sum += add
  }

  const notifications: Notification[] = [
    {
      id: 'n1',
      user_id: memberUserId,
      title: 'Court booking confirmed',
      body: 'Court A is ready. Enjoy your game!',
      read: false,
      created_at: new Date(now - 3600000).toISOString(),
    },
    {
      id: 'n2',
      user_id: memberUserId,
      title: 'Membership reminder',
      body: 'Your premium plan expires in 45 days.',
      read: false,
      created_at: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'n3',
      user_id: memberUserId,
      title: 'Payment received',
      body: 'We received Php 2,500.00 for your renewal.',
      read: true,
      created_at: new Date(now - 2 * 86400000).toISOString(),
    },
  ]

  return {
    profiles,
    members,
    courts,
    sessions,
    checkins,
    transactions,
    notifications,
    walkins: [],
    passwords: {
      'admin@rallypoint.local': 'admin123',
      'staff@rallypoint.local': 'staff123',
      'member@rallypoint.local': 'member123',
    },
    sessionUserId: null,
  }
}

function load(): DemoDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoDB
  } catch {
    /* ignore */
  }
  const db = seed()
  save(db)
  return db
}

function save(db: DemoDB) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export const demoStore = {
  reset() {
    localStorage.removeItem(KEY)
    return load()
  },
  get() {
    return load()
  },
  set(db: DemoDB) {
    save(db)
  },
  login(email: string, password: string): Profile {
    const db = load()
    const e = email.trim().toLowerCase()
    if (db.passwords[e] !== password) throw new Error('Invalid email or password')
    const profile = db.profiles.find((p) => p.email.toLowerCase() === e)
    if (!profile) throw new Error('Account not found')
    db.sessionUserId = profile.id
    save(db)
    return profile
  },
  logout() {
    const db = load()
    db.sessionUserId = null
    save(db)
  },
  currentUser(): Profile | null {
    const db = load()
    if (!db.sessionUserId) return null
    return db.profiles.find((p) => p.id === db.sessionUserId) ?? null
  },
  stats(): DashboardStats {
    const db = load()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const revenue = db.transactions
      .filter((t) => new Date(t.created_at) >= start)
      .reduce((a, t) => a + t.amount, 0)
    return {
      members: db.members.length,
      active_now: db.sessions.filter((s) => s.status === 'playing').length + db.checkins.filter((c) => {
        const age = Date.now() - new Date(c.checked_in_at).getTime()
        return age < 4 * 3600000
      }).length,
      revenue_today: revenue,
      courts_occupied: db.courts.filter((c) => c.status === 'occupied').length,
    }
  },
  members() {
    return load().members.slice().sort((a, b) => a.full_name.localeCompare(b.full_name))
  },
  member(id: string) {
    return load().members.find((m) => m.id === id) ?? null
  },
  memberByUser(userId: string) {
    return load().members.find((m) => m.user_id === userId) ?? null
  },
  upsertMember(input: Partial<Member> & { full_name: string; membership_type: MembershipType }) {
    const db = load()
    if (input.id) {
      const i = db.members.findIndex((m) => m.id === input.id)
      if (i >= 0) db.members[i] = { ...db.members[i], ...input }
    } else {
      const codeNum = 1000 + db.members.length + 1
      db.members.push({
        id: uid('mem'),
        user_id: input.user_id ?? null,
        member_code: input.member_code ?? `RP-${codeNum}`,
        full_name: input.full_name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        membership_type: input.membership_type,
        status: input.status ?? 'active',
        join_date: input.join_date ?? new Date().toISOString().slice(0, 10),
        expiry_date: input.expiry_date ?? daysFromNow(30),
        notes: input.notes ?? null,
        created_at: todayISO(),
      })
    }
    save(db)
    return db.members
  },
  courts() {
    return load().courts
  },
  sessionsPlaying() {
    const db = load()
    return db.sessions
      .filter((s) => s.status === 'playing' || s.status === 'scheduled')
      .map((s) => ({
        ...s,
        court: db.courts.find((c) => c.id === s.court_id),
        member: s.member_id ? db.members.find((m) => m.id === s.member_id) : undefined,
      }))
  },
  createRental(opts: {
    court_id: string
    member_id?: string
    guest_name?: string
    hours: number
    created_by?: string
  }) {
    const db = load()
    const court = db.courts.find((c) => c.id === opts.court_id)
    if (!court) throw new Error('Court not found')
    if (court.status === 'maintenance') throw new Error('Court under maintenance')
    const start = new Date()
    const end = new Date(start.getTime() + opts.hours * 3600000)
    const amount = court.hourly_rate * opts.hours
    const session: CourtSession = {
      id: uid('ses'),
      court_id: opts.court_id,
      member_id: opts.member_id ?? null,
      guest_name: opts.guest_name ?? null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: 'playing',
      amount,
      created_by: opts.created_by ?? null,
    }
    db.sessions.push(session)
    court.status = 'occupied'
    db.transactions.push({
      id: uid('tx'),
      member_id: opts.member_id ?? null,
      amount,
      type: 'court_rental',
      description: `${court.name} — ${opts.hours}h rental`,
      created_at: todayISO(),
      created_by: opts.created_by ?? null,
    })
    save(db)
    return session
  },
  extendSession(sessionId: string, hours: number, created_by?: string) {
    const db = load()
    const s = db.sessions.find((x) => x.id === sessionId)
    if (!s) throw new Error('Session not found')
    const court = db.courts.find((c) => c.id === s.court_id)
    const add = (court?.hourly_rate ?? 500) * hours
    s.end_at = new Date(new Date(s.end_at).getTime() + hours * 3600000).toISOString()
    s.amount += add
    db.transactions.push({
      id: uid('tx'),
      member_id: s.member_id ?? null,
      amount: add,
      type: 'extension',
      description: `Extend ${court?.name ?? 'court'} +${hours}h`,
      created_at: todayISO(),
      created_by: created_by ?? null,
    })
    save(db)
    return s
  },
  endSession(sessionId: string) {
    const db = load()
    const s = db.sessions.find((x) => x.id === sessionId)
    if (!s) throw new Error('Session not found')
    s.status = 'completed'
    const court = db.courts.find((c) => c.id === s.court_id)
    if (court) {
      const still = db.sessions.some(
        (x) => x.court_id === court.id && x.id !== s.id && x.status === 'playing',
      )
      if (!still) court.status = 'available'
    }
    save(db)
  },
  checkIn(memberId: string, staffId?: string, note?: string) {
    const db = load()
    if (!db.members.find((m) => m.id === memberId)) throw new Error('Member not found')
    const row: CheckIn = {
      id: uid('ci'),
      member_id: memberId,
      checked_in_at: todayISO(),
      staff_id: staffId ?? null,
      note: note ?? null,
    }
    db.checkins.unshift(row)
    save(db)
    return row
  },
  recentCheckins() {
    const db = load()
    return db.checkins.slice(0, 30).map((c) => ({
      ...c,
      member: db.members.find((m) => m.id === c.member_id),
    }))
  },
  transactions(userId?: string, role?: Role) {
    const db = load()
    let list = db.transactions.slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    if (role === 'member' && userId) {
      const mem = db.members.find((m) => m.user_id === userId)
      list = list.filter((t) => t.member_id && mem && t.member_id === mem.id)
    }
    return list.map((t) => ({
      ...t,
      member: t.member_id ? db.members.find((m) => m.id === t.member_id) : undefined,
    }))
  },
  notifications(userId: string) {
    return load()
      .notifications.filter((n) => n.user_id === userId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  },
  markNotifRead(id: string) {
    const db = load()
    const n = db.notifications.find((x) => x.id === id)
    if (n) n.read = true
    save(db)
  },
  createWalkIn(input: { full_name: string; phone?: string; purpose: string; amount: number; created_by?: string }) {
    const db = load()
    const row: WalkIn = {
      id: uid('wi'),
      full_name: input.full_name,
      phone: input.phone ?? null,
      purpose: input.purpose,
      amount: input.amount,
      created_at: todayISO(),
      created_by: input.created_by ?? null,
    }
    db.walkins.unshift(row)
    db.transactions.push({
      id: uid('tx'),
      member_id: null,
      amount: input.amount,
      type: 'walk_in',
      description: `Walk-in: ${input.full_name} — ${input.purpose}`,
      created_at: todayISO(),
      created_by: input.created_by ?? null,
    })
    save(db)
    return row
  },
  users() {
    return load().profiles
  },
  payMembership(memberId: string, amount: number, userId: string) {
    const db = load()
    const m = db.members.find((x) => x.id === memberId)
    if (!m) throw new Error('Member not found')
    const exp = new Date(m.expiry_date)
    if (exp < new Date()) exp.setTime(Date.now())
    exp.setDate(exp.getDate() + 30)
    m.expiry_date = exp.toISOString().slice(0, 10)
    m.status = 'active'
    db.transactions.push({
      id: uid('tx'),
      member_id: memberId,
      amount,
      type: 'membership',
      description: 'Online membership payment',
      created_at: todayISO(),
      created_by: userId,
    })
    db.notifications.unshift({
      id: uid('n'),
      user_id: userId,
      title: 'Payment successful',
      body: `Received ${amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} for membership.`,
      read: false,
      created_at: todayISO(),
    })
    save(db)
  },
}
