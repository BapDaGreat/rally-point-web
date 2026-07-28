import { demoStore } from './demoStore'
import { isDemoMode, supabase } from './supabase'
import type {
  CheckIn,
  Court,
  CourtSession,
  DashboardStats,
  Member,
  MembershipType,
  MemberStatus,
  Notification,
  Profile,
  Role,
  Transaction,
  WalkIn,
} from '../types'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const api = {
  async stats(): Promise<DashboardStats> {
    if (isDemoMode) return demoStore.stats()
    if (!supabase) throw new Error('No backend')
    const [{ count: members }, { data: playing }, { data: txs }, { data: courts }] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('court_sessions').select('id').eq('status', 'playing'),
      supabase.from('transactions').select('amount').gte('created_at', startOfToday()),
      supabase.from('courts').select('status'),
    ])
    return {
      members: members ?? 0,
      active_now: playing?.length ?? 0,
      revenue_today: (txs ?? []).reduce((a, t) => a + Number(t.amount), 0),
      courts_occupied: (courts ?? []).filter((c) => c.status === 'occupied').length,
    }
  },

  async listMembers(): Promise<Member[]> {
    if (isDemoMode) return demoStore.members()
    const { data, error } = await supabase!.from('members').select('*').order('full_name')
    if (error) throw error
    return data as Member[]
  },

  async getMember(id: string): Promise<Member | null> {
    if (isDemoMode) return demoStore.member(id)
    const { data, error } = await supabase!.from('members').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as Member | null
  },

  async memberForUser(userId: string): Promise<Member | null> {
    if (isDemoMode) return demoStore.memberByUser(userId)
    const { data, error } = await supabase!.from('members').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data as Member | null
  },

  async saveMember(input: {
    id?: string
    full_name: string
    email?: string
    phone?: string
    membership_type: MembershipType
    status?: MemberStatus
    join_date?: string
    expiry_date?: string
    notes?: string
  }) {
    if (isDemoMode) {
      demoStore.upsertMember(input)
      return
    }
    if (input.id) {
      const { error } = await supabase!.from('members').update(input).eq('id', input.id)
      if (error) throw error
    } else {
      const code = `RP-${Date.now().toString().slice(-6)}`
      const { error } = await supabase!.from('members').insert({
        ...input,
        member_code: code,
        status: input.status ?? 'active',
        join_date: input.join_date ?? new Date().toISOString().slice(0, 10),
        expiry_date:
          input.expiry_date ??
          new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      })
      if (error) throw error
    }
  },

  async listCourts(): Promise<Court[]> {
    if (isDemoMode) return demoStore.courts()
    const { data, error } = await supabase!.from('courts').select('*').order('name')
    if (error) throw error
    return data as Court[]
  },

  async playingSessions(): Promise<CourtSession[]> {
    if (isDemoMode) return demoStore.sessionsPlaying()
    const { data, error } = await supabase!
      .from('court_sessions')
      .select('*, court:courts(*), member:members(*)')
      .in('status', ['playing', 'scheduled'])
      .order('start_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => ({
      ...row,
      court: row.court as Court,
      member: row.member as Member,
    })) as CourtSession[]
  },

  async createRental(opts: {
    court_id: string
    member_id?: string
    guest_name?: string
    hours: number
    created_by?: string
  }) {
    if (isDemoMode) return demoStore.createRental(opts)
    const { data: court, error: cErr } = await supabase!
      .from('courts')
      .select('*')
      .eq('id', opts.court_id)
      .single()
    if (cErr) throw cErr
    const start = new Date()
    const end = new Date(start.getTime() + opts.hours * 3600000)
    const amount = Number(court.hourly_rate) * opts.hours
    const { data, error } = await supabase!
      .from('court_sessions')
      .insert({
        court_id: opts.court_id,
        member_id: opts.member_id ?? null,
        guest_name: opts.guest_name ?? null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: 'playing',
        amount,
        created_by: opts.created_by ?? null,
      })
      .select()
      .single()
    if (error) throw error
    await supabase!.from('courts').update({ status: 'occupied' }).eq('id', opts.court_id)
    await supabase!.from('transactions').insert({
      member_id: opts.member_id ?? null,
      amount,
      type: 'court_rental',
      description: `${court.name} — ${opts.hours}h rental`,
      created_by: opts.created_by ?? null,
    })
    return data as CourtSession
  },

  async extendSession(sessionId: string, hours: number, created_by?: string) {
    if (isDemoMode) return demoStore.extendSession(sessionId, hours, created_by)
    const { data: s, error } = await supabase!
      .from('court_sessions')
      .select('*, court:courts(*)')
      .eq('id', sessionId)
      .single()
    if (error) throw error
    const rate = Number((s.court as Court).hourly_rate)
    const add = rate * hours
    const end = new Date(new Date(s.end_at).getTime() + hours * 3600000).toISOString()
    const { error: uErr } = await supabase!
      .from('court_sessions')
      .update({ end_at: end, amount: Number(s.amount) + add })
      .eq('id', sessionId)
    if (uErr) throw uErr
    await supabase!.from('transactions').insert({
      member_id: s.member_id,
      amount: add,
      type: 'extension',
      description: `Extend ${(s.court as Court).name} +${hours}h`,
      created_by: created_by ?? null,
    })
  },

  async endSession(sessionId: string) {
    if (isDemoMode) return demoStore.endSession(sessionId)
    const { data: s, error } = await supabase!
      .from('court_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (error) throw error
    await supabase!.from('court_sessions').update({ status: 'completed' }).eq('id', sessionId)
    const { data: others } = await supabase!
      .from('court_sessions')
      .select('id')
      .eq('court_id', s.court_id)
      .eq('status', 'playing')
    if (!others?.length) {
      await supabase!.from('courts').update({ status: 'available' }).eq('id', s.court_id)
    }
  },

  async checkIn(memberId: string, staffId?: string, note?: string) {
    if (isDemoMode) return demoStore.checkIn(memberId, staffId, note)
    const { data, error } = await supabase!
      .from('checkins')
      .insert({ member_id: memberId, staff_id: staffId ?? null, note: note ?? null })
      .select()
      .single()
    if (error) throw error
    return data as CheckIn
  },

  async recentCheckins(): Promise<CheckIn[]> {
    if (isDemoMode) return demoStore.recentCheckins()
    const { data, error } = await supabase!
      .from('checkins')
      .select('*, member:members(*)')
      .order('checked_in_at', { ascending: false })
      .limit(30)
    if (error) throw error
    return (data ?? []).map((r) => ({ ...r, member: r.member as Member })) as CheckIn[]
  },

  async transactions(userId?: string, role?: Role): Promise<Transaction[]> {
    if (isDemoMode) return demoStore.transactions(userId, role)
    let q = supabase!.from('transactions').select('*, member:members(*)').order('created_at', {
      ascending: false,
    })
    if (role === 'member' && userId) {
      const mem = await this.memberForUser(userId)
      if (!mem) return []
      q = q.eq('member_id', mem.id)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => ({ ...r, member: r.member as Member | undefined })) as Transaction[]
  },

  async notifications(userId: string): Promise<Notification[]> {
    if (isDemoMode) return demoStore.notifications(userId)
    const { data, error } = await supabase!
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as Notification[]
  },

  async markNotifRead(id: string) {
    if (isDemoMode) return demoStore.markNotifRead(id)
    const { error } = await supabase!.from('notifications').update({ read: true }).eq('id', id)
    if (error) throw error
  },

  async createWalkIn(input: {
    full_name: string
    phone?: string
    purpose: string
    amount: number
    created_by?: string
  }): Promise<WalkIn> {
    if (isDemoMode) return demoStore.createWalkIn(input)
    const { data, error } = await supabase!.from('walkins').insert(input).select().single()
    if (error) throw error
    await supabase!.from('transactions').insert({
      amount: input.amount,
      type: 'walk_in',
      description: `Walk-in: ${input.full_name} — ${input.purpose}`,
      created_by: input.created_by ?? null,
    })
    return data as WalkIn
  },

  async users(): Promise<Profile[]> {
    if (isDemoMode) return demoStore.users()
    const { data, error } = await supabase!.from('profiles').select('*').order('full_name')
    if (error) throw error
    return data as Profile[]
  },

  async payMembership(memberId: string, amount: number, userId: string) {
    if (isDemoMode) return demoStore.payMembership(memberId, amount, userId)
    const { data: m, error } = await supabase!.from('members').select('*').eq('id', memberId).single()
    if (error) throw error
    const exp = new Date(m.expiry_date)
    if (exp < new Date()) exp.setTime(Date.now())
    exp.setDate(exp.getDate() + 30)
    await supabase!
      .from('members')
      .update({ expiry_date: exp.toISOString().slice(0, 10), status: 'active' })
      .eq('id', memberId)
    await supabase!.from('transactions').insert({
      member_id: memberId,
      amount,
      type: 'membership',
      description: 'Online membership payment',
      created_by: userId,
    })
    await supabase!.from('notifications').insert({
      user_id: userId,
      title: 'Payment successful',
      body: `Membership extended. Thank you!`,
      read: false,
    })
  },
}
