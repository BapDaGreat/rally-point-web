import { demoStore } from './demoStore'
import { isDemoMode, supabase } from './supabase'
import { paymentConfig, simulateCheckout, startCheckout } from './payments'
import type {
  Booking,
  CheckIn,
  Court,
  CourtDayAvailability,
  CourtSession,
  DashboardStats,
  Member,
  MembershipType,
  MemberStatus,
  Notification,
  PaymentMethod,
  Profile,
  Role,
  Transaction,
  WalkIn,
} from '../types'
import { CLUB_CLOSE_HOUR, CLUB_OPEN_HOUR, hourLabel, localRangeISO } from '../types'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)
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
          input.expiry_date ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
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

  async availability(dateYmd: string): Promise<CourtDayAvailability[]> {
    if (isDemoMode) return demoStore.availability(dateYmd)
    const courts = await this.listCourts()
    const dayStart = localRangeISO(dateYmd, CLUB_OPEN_HOUR, 1).start_at
    const dayEnd = localRangeISO(dateYmd, CLUB_CLOSE_HOUR - 1, 1).end_at
    const { data: sessions } = await supabase!
      .from('court_sessions')
      .select('*')
      .in('status', ['playing', 'scheduled', 'pending_payment'])
      .lt('start_at', dayEnd)
      .gt('end_at', dayStart)

    let bookings: Booking[] = []
    const res = await supabase!
      .from('bookings')
      .select('*')
      .in('status', ['confirmed', 'pending_payment'])
      .lt('start_at', dayEnd)
      .gt('end_at', dayStart)
    if (!res.error) bookings = (res.data ?? []) as Booking[]

    const now = new Date()
    return courts.map((court) => {
      const slots = []
      for (let h = CLUB_OPEN_HOUR; h < CLUB_CLOSE_HOUR; h++) {
        const { start_at, end_at } = localRangeISO(dateYmd, h, 1)
        let available = court.status !== 'maintenance'
        if (new Date(start_at).getTime() < now.getTime() - 5 * 60000) available = false
        for (const s of sessions ?? []) {
          if (s.court_id === court.id && overlaps(start_at, end_at, s.start_at, s.end_at)) available = false
        }
        for (const b of bookings) {
          if (b.court_id === court.id && overlaps(start_at, end_at, b.start_at, b.end_at)) available = false
        }
        slots.push({ startHour: h, label: hourLabel(h), available })
      }
      return { court, slots }
    })
  },

  async createBooking(opts: {
    court_id: string
    member_id: string
    dateYmd: string
    startHour: number
    hours: number
    user_id: string
  }): Promise<Booking> {
    if (isDemoMode) return demoStore.createBooking(opts)
    const { start_at, end_at } = localRangeISO(opts.dateYmd, opts.startHour, opts.hours)
    const { data: court, error: cErr } = await supabase!
      .from('courts')
      .select('*')
      .eq('id', opts.court_id)
      .single()
    if (cErr) throw cErr
    const amount = Number(court.hourly_rate) * opts.hours
    const { data, error } = await supabase!
      .from('bookings')
      .insert({
        court_id: opts.court_id,
        member_id: opts.member_id,
        start_at,
        end_at,
        hours: opts.hours,
        amount,
        status: 'pending_payment',
      })
      .select('*, court:courts(*), member:members(*)')
      .single()
    if (error) throw error
    return {
      ...data,
      court: data.court as Court,
      member: data.member as Member,
    } as Booking
  },

  async payBooking(opts: {
    booking_id: string
    method: PaymentMethod
    user_id: string
  }): Promise<Booking> {
    if (isDemoMode) {
      const intent = await startCheckout({
        bookingId: opts.booking_id,
        amount: 1,
        method: opts.method,
        description: 'Court booking',
      })
      const paid = await simulateCheckout(intent)
      if (paid.status !== 'paid') throw new Error('Payment failed')
      return demoStore.confirmBookingPayment(opts)
    }

    const { data: booking, error } = await supabase!
      .from('bookings')
      .select('*, court:courts(*)')
      .eq('id', opts.booking_id)
      .single()
    if (error) throw error

    const intent = await startCheckout({
      bookingId: opts.booking_id,
      amount: Number(booking.amount),
      method: opts.method,
      description: `Court booking ${opts.booking_id}`,
    })
    const result = await simulateCheckout({ ...intent, amount: Number(booking.amount) })
    if (result.status !== 'paid') throw new Error('Payment failed or cancelled')

    const { data: session, error: sErr } = await supabase!
      .from('court_sessions')
      .insert({
        court_id: booking.court_id,
        member_id: booking.member_id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        status: 'scheduled',
        amount: booking.amount,
        created_by: opts.user_id,
        notes: `Online booking · ${opts.method} · ${result.ref}`,
      })
      .select()
      .single()
    if (sErr) throw sErr

    await supabase!
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_method: opts.method,
        payment_ref: result.ref,
        session_id: session.id,
      })
      .eq('id', opts.booking_id)

    await supabase!.from('transactions').insert({
      member_id: booking.member_id,
      amount: booking.amount,
      type: 'booking',
      description: `${(booking.court as Court)?.name ?? 'Court'} booking · ${opts.method.toUpperCase()} · ${result.ref}`,
      created_by: opts.user_id,
    })

    await supabase!.from('notifications').insert({
      user_id: opts.user_id,
      title: 'Booking confirmed',
      body: 'Your court is reserved. Show this confirmation at the desk.',
      read: false,
    })

    const { data: final } = await supabase!
      .from('bookings')
      .select('*, court:courts(*), member:members(*)')
      .eq('id', opts.booking_id)
      .single()
    return {
      ...final,
      court: final?.court as Court,
      member: final?.member as Member,
    } as Booking
  },

  async myBookings(memberId: string): Promise<Booking[]> {
    if (isDemoMode) return demoStore.myBookings(memberId)
    const { data, error } = await supabase!
      .from('bookings')
      .select('*, court:courts(*), member:members(*)')
      .eq('member_id', memberId)
      .order('start_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((b) => ({
      ...b,
      court: b.court as Court,
      member: b.member as Member,
    })) as Booking[]
  },

  async listBookings(): Promise<Booking[]> {
    if (isDemoMode) return demoStore.allBookings()
    const { data, error } = await supabase!
      .from('bookings')
      .select('*, court:courts(*), member:members(*)')
      .order('start_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data ?? []).map((b) => ({
      ...b,
      court: b.court as Court,
      member: b.member as Member,
    })) as Booking[]
  },

  paymentMethods() {
    return paymentConfig.methods
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
