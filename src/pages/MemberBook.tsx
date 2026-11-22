import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ban, Check, CheckCircle2, ChevronLeft, Circle, Clock, Hourglass, Loader2, Lock, Timer, Wrench, type LucideIcon } from 'lucide-react'
import { AppHeader, AppShell, SignOutButton } from '../components/Shell'
import { LoadingShapes, SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type {
  Booking,
  CheckoutPaymentMethod,
  CourtDayAvailability,
  Member,
  TimeSlot,
  Venue,
} from '../types'
import {
  APP_TIME_ZONE,
  BOOKING_HOLD_MINUTES,
  CLUB_CLOSE_HOUR,
  CLUB_OPEN_HOUR,
  CONFIRM_PAYMENT_MINUTES,
  checkoutState,
  courtRateFor,
  fmtDate,
  fmtTime,
  hasActiveMembership,
  fmtDateTime,
  hourLabel,
  peso,
  ymdLocal,
} from '../types'

type Step = 'pick' | 'pay' | 'waiting' | 'done'

/** How often the waiting screen asks whether the club has decided. */
const PAYMENT_CHECK_MS = 15000

/** A GCash reference, once the spaces GCash shows in it are taken out. */
const REFERENCE_PATTERN = /^[A-Za-z0-9]{6,30}$/

/** The club refused the reference itself (its format), so nothing was sent. */
const REFERENCE_REFUSED = /6 to 30 letters/i

const HOLD_RAN_OUT = `Your ${BOOKING_HOLD_MINUTES} minutes to pay ran out, so those hours were released. Pick a time again.`

/** A message above the times, and whether it should point to the player's notifications. */
type Notice = { text: string; notifications?: boolean }

/** A newer copy of a booking, keeping the court it was shown with. */
function withLatest(shown: Booking, latest: Booking): Booking {
  return { ...shown, ...latest, court: latest.court ?? shown.court }
}

function cleanReference(raw: string) {
  return raw.replace(/\s+/g, '')
}

/** What is wrong with a typed reference number, in plain words, or null when it looks right. */
function referenceProblem(reference: string, app: string) {
  if (!reference) return `Type the reference number ${app} showed you after you paid.`
  if (!REFERENCE_PATTERN.test(reference)) {
    return `That does not look like a ${app} reference number. It should be 6 to 30 letters or numbers, with no other symbols.`
  }
  return null
}

/** When the club should have checked a sent payment. */
function confirmDeadline(booking: Booking) {
  if (booking.confirm_by) return new Date(booking.confirm_by).getTime()
  const sentAt = booking.payment_submitted_at ? new Date(booking.payment_submitted_at).getTime() : Date.now()
  return sentAt + CONFIRM_PAYMENT_MINUTES * 60000
}

/** The status word a player sees for one of their bookings. */
function bookingStatusWord(booking: Booking) {
  if (booking.status === 'pending_payment') {
    const state = checkoutState(booking)
    if (state === 'awaiting_confirmation') return 'Waiting for the club to confirm'
    return state === 'released' ? 'Time to pay ran out' : 'Waiting for payment'
  }
  if (booking.status === 'confirmed') return 'Booked'
  const word = booking.status.replace('_', ' ')
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** "2:00 PM – 4:00 PM" for a booking's hours. */
function timeRange(booking: Pick<Booking, 'start_at' | 'end_at'>) {
  return `${fmtTime(booking.start_at)} – ${fmtTime(booking.end_at)}`
}

/** The time now, updated every second, for the countdowns. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])
  return now
}

function minutesAndSeconds(ms: number) {
  const wholeSeconds = Math.ceil(ms / 1000)
  return { minutes: Math.floor(wholeSeconds / 60), seconds: wholeSeconds % 60 }
}

type SlotLook = { word: string; Icon: LucideIcon | null; tone: string; pickable: boolean }

const MUTED_TONE = 'border-slate-200 bg-slate-100 text-slate-600'

/**
 * What one hour of the time grid says. Every hour of a paid or held booking reads
 * "Booked", so a 2-hour booking shows as two booked hours.
 */
function slotLook(slot: TimeSlot, opts: { selected: boolean; freeHours: number; wanted: number }): SlotLook {
  if (slot.blocked === 'booked') return { word: 'Booked', Icon: Lock, tone: 'border-rose-300 bg-rose-50 text-rose-800', pickable: false }
  if (slot.blocked === 'passed') return { word: 'Passed', Icon: Clock, tone: MUTED_TONE, pickable: false }
  if (slot.blocked === 'out_of_service') return { word: 'Out of service', Icon: Wrench, tone: MUTED_TONE, pickable: false }
  if (!slot.available) return { word: 'Unavailable', Icon: Ban, tone: MUTED_TONE, pickable: false }
  const pickable = opts.freeHours >= opts.wanted
  if (opts.selected) return { word: 'Selected', Icon: Check, tone: 'border-brand-700 bg-brand-700 text-white', pickable }
  // Free, but the next hours are taken or the day ends before the chosen length.
  if (!pickable) return { word: `Only ${opts.freeHours}h free`, Icon: null, tone: 'border-slate-200 bg-white text-slate-700', pickable }
  return { word: 'Available', Icon: Circle, tone: 'border-emerald-300 bg-emerald-50 text-emerald-900', pickable }
}

/** How long the player has left to pay before the held hours are released. */
function HoldCountdown({ endsAt }: { endsAt: number }) {
  const now = useNow()
  const left = Math.max(0, endsAt - now)
  const { minutes, seconds } = minutesAndSeconds(left)
  const share = Math.min(1, left / (BOOKING_HOLD_MINUTES * 60000))
  const urgent = left <= 2 * 60000
  // Screen readers hear the time left at 5 minutes and at 1 minute, not every second.
  const minutesLeft = Math.ceil(left / 60000)
  const spoken = minutesLeft === 5 || minutesLeft === 1 ? `${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'} left to pay` : ''
  return (
    <div className={`rounded-xl border p-3 ${urgent ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-brand-200 bg-brand-50 text-brand-900'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-bold">
          <Timer size={18} aria-hidden /> Time left to pay
        </p>
        <p role="timer" aria-label={`${minutes} min ${seconds} sec left to pay`} className="text-2xl font-extrabold tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden>
        <div className={`h-full rounded-full ${urgent ? 'bg-rose-600' : 'bg-brand-700'}`} style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-2 text-sm">
        We hold these hours for {BOOKING_HOLD_MINUTES} minutes. If time runs out, they are released and you go back to the times.
      </p>
      <p className="sr-only" aria-live="polite">{spoken}</p>
    </div>
  )
}

/**
 * How long the club has left to check a sent payment. Once that time is up the hours
 * still stay held: the player may already have paid, and there are no refunds.
 */
function ConfirmCountdown({ endsAt }: { endsAt: number }) {
  const now = useNow()
  const left = Math.max(0, endsAt - now)
  if (left === 0) {
    return (
      <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
        <p className="font-extrabold">The club is taking longer than usual.</p>
        <p className="mt-1 text-sm">
          Your hours stay held for you, so you do not need to pay again. We keep checking and will show the answer here.
        </p>
      </div>
    )
  }
  const { minutes, seconds } = minutesAndSeconds(left)
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-900">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-bold">
          <Hourglass size={18} aria-hidden /> Club checks within
        </p>
        <p role="timer" aria-label={`${minutes} min ${seconds} sec left for the club to confirm`} className="text-2xl font-extrabold tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </p>
      </div>
      <p className="mt-2 text-sm">
        The club has {CONFIRM_PAYMENT_MINUTES} minutes to check your payment. Your hours stay held while you wait.
      </p>
    </div>
  )
}

/** One way to pay the club: its QR code, account name and number. */
function PayMethodCard({ method }: { method: CheckoutPaymentMethod }) {
  return (
    <div className="space-y-3 rounded-xl border-2 border-slate-200 p-3">
      <p className="text-title font-extrabold text-slate-900">{method.label}</p>
      {method.qr_url ? (
        <img
          src={method.qr_url}
          alt={`${method.label} QR code to pay ${method.account_name ?? 'the club'}`}
          className="mx-auto aspect-square w-full max-w-72 rounded-lg border border-slate-200 bg-white object-contain"
        />
      ) : null}
      {method.account_name || method.account_number ? (
        <dl className="space-y-2">
          {method.account_name ? (
            <div>
              <dt className="text-sm text-slate-600">Account name</dt>
              <dd className="text-subtitle font-bold text-slate-900">{method.account_name}</dd>
            </div>
          ) : null}
          {method.account_number ? (
            <div>
              <dt className="text-sm text-slate-600">Number to send to</dt>
              <dd className="font-mono text-title font-extrabold tracking-wider text-slate-900">{method.account_number}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}

/** The court picker, the time grid and the continue button, while a day's availability loads. */
function AvailabilityLoading() {
  return (
    <LoadingShapes label="Loading available courts and times…">
      <div className="space-y-4" aria-hidden>
        <div className="card p-3 space-y-3">
          <SkeletonLine className="w-14 px-1" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((key) => (
              <SkeletonBlock key={key} className="h-16 rounded-xl!" />
            ))}
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <SkeletonLine className="w-1/2" />
            <SkeletonLine size="caption" className="w-12" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Array.from({ length: CLUB_CLOSE_HOUR - CLUB_OPEN_HOUR }, (_, key) => (
              <SkeletonBlock key={key} className="h-12 rounded-xl!" />
            ))}
          </div>
        </div>
        <SkeletonBlock className="h-[54px] w-full rounded-[16px]!" />
      </div>
    </LoadingShapes>
  )
}

function nextDays(n: number) {
  // Days are counted in Philippine time, so "Today" matches the club's calendar on any phone.
  const out: { ymd: string; label: string }[] = []
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    const ymd = ymdLocal(new Date(now + i * 86400000))
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: APP_TIME_ZONE,
          })
    out.push({ ymd, label })
  }
  return out
}

export function MemberBook() {
  const { user } = useAuth()
  const days = useMemo(() => nextDays(7), [])
  const [dateYmd, setDateYmd] = useState(days[0].ymd)
  const [venues, setVenues] = useState<Venue[]>([])
  // A club page can open this screen on one of its venues.
  const location = useLocation()
  const [venueId, setVenueId] = useState(() => {
    const requested = (location.state as { venueId?: unknown } | null)?.venueId
    return typeof requested === 'string' ? requested : ''
  })
  const [hours, setHours] = useState(1)
  const [courtId, setCourtId] = useState<string | null>(null)
  const [startHour, setStartHour] = useState<number | null>(null)
  const [avail, setAvail] = useState<CourtDayAvailability[]>([])
  const [member, setMember] = useState<Member | null>(null)
  const [mine, setMine] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('pick')
  // The club's ways to be paid (null while loading); a club without one cannot take checkouts.
  const [payMethods, setPayMethods] = useState<CheckoutPaymentMethod[] | null>(null)
  const [payMethodsFailed, setPayMethodsFailed] = useState(false)
  const [pending, setPending] = useState<Booking | null>(null)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // When the held hours are let go, and why the player was sent back from checkout.
  const [holdEnds, setHoldEnds] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  // While the time to pay runs out, the app first asks whether a payment was sent after all.
  const [checkingHold, setCheckingHold] = useState(false)
  // A checkout being reopened from Your bookings.
  const [resumingId, setResumingId] = useState<string | null>(null)
  // The reference number the player types after paying, and when the club should have checked it.
  const [reference, setReference] = useState('')
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [confirmEnds, setConfirmEnds] = useState<number | null>(null)
  const referenceField = useRef<HTMLInputElement>(null)
  // Each checkout step's heading takes focus, so screen readers hear where the player is.
  const stepHeading = useRef<HTMLHeadingElement>(null)

  async function loadPayMethods() {
    setPayMethodsFailed(false)
    try {
      setPayMethods(await api.checkoutPaymentMethods())
    } catch {
      setPayMethods(null)
      setPayMethodsFailed(true)
    }
  }

  useEffect(() => {
    if (user) void loadPayMethods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (step !== 'pick') stepHeading.current?.focus()
  }, [step])

  async function reload() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const m = await api.memberForUser(user.id)
      setMember(m)
      const accessibleVenues = typeof api.listVenues === 'function' ? await api.listVenues(user.id, user.role) : []
      setVenues(accessibleVenues)
      const nextVenueId = venueId && accessibleVenues.some((venue) => venue.id === venueId)
        ? venueId
        : accessibleVenues[0]?.id ?? ''
      if (nextVenueId !== venueId) setVenueId(nextVenueId)
      const [a, b] = await Promise.all([
        api.availability(dateYmd, nextVenueId || undefined),
        m ? api.myBookings(m.id, nextVenueId || undefined) : Promise.resolve([] as Booking[]),
      ])
      setAvail(a)
      setMine(b)
      if (!courtId) {
        const firstBookable = a.find((row) => row.court.status !== 'maintenance') ?? a[0]
        if (firstBookable) setCourtId(firstBookable.court.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dateYmd, venueId])

  /** Back to the times, letting go of the hours held for checkout. */
  async function leaveCheckout(bookingId: string, message: string | null) {
    setStep('pick')
    setPending(null)
    setHoldEnds(null)
    setNotice(message ? { text: message } : null)
    // Time ran out: start the pick again. Back keeps the pick so the player can carry on.
    if (message) setStartHour(null)
    // If this fails, the hold still lapses by itself when its time is up.
    await api.releaseBookingHold(bookingId).catch(() => undefined)
    await reload()
  }

  /** The waiting screen for a payment the player has sent; the club's time to check ends at `endsAt`. */
  function openWaiting(sent: Booking, endsAt: number) {
    // From here the hold no longer runs out; the club has its own time to check.
    setHoldEnds(null)
    setPending(sent)
    setConfirmEnds(endsAt)
    setReference('')
    setReferenceError(null)
    setError(null)
    setNotice(null)
    setStep('waiting')
  }

  /**
   * The time to pay ran out on this phone. A payment the club got anyway (say, the reply to
   * "I've paid" was lost) still counts, so ask first; if that cannot be checked, let the hours go.
   */
  async function holdRanOut(held: Booking) {
    setCheckingHold(true)
    const latest = await api.myBooking(held.id).catch(() => null)
    setCheckingHold(false)
    if (latest?.payment_submitted_at) {
      const sent = withLatest(held, latest)
      openWaiting(sent, confirmDeadline(sent))
      return
    }
    await leaveCheckout(held.id, HOLD_RAN_OUT)
  }

  // When the time to pay runs out, the hours are released and the player goes back to the times.
  // A payment already under way is left to finish.
  useEffect(() => {
    if (step !== 'pay' || !pending || holdEnds == null || busy || checkingHold) return
    const held = pending
    const timer = window.setTimeout(() => void holdRanOut(held), Math.max(0, holdEnds - Date.now()))
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pending, holdEnds, busy, checkingHold])

  // While the club checks a sent payment, ask whether it has decided: once at the start (it may
  // have decided while the player was away), then every few seconds. A sent payment is never
  // released by the clock, so this keeps going until the club answers.
  const waitingId = step === 'waiting' ? pending?.id ?? null : null
  useEffect(() => {
    if (!waitingId || !pending) return
    const sent = pending
    let active = true
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const latest = await api.myBooking(waitingId)
        if (!active || !latest) return
        const state = checkoutState(latest)
        if (state === 'booked') {
          active = false
          setConfirmed({ ...sent, ...latest, court: latest.court ?? sent.court })
          setStep('done')
          setPending(null)
          setConfirmEnds(null)
          setStartHour(null)
          await reload()
        } else if (state === 'released') {
          active = false
          const ref = latest.payment_reference ?? sent.payment_reference
          setStep('pick')
          setPending(null)
          setConfirmEnds(null)
          setStartHour(null)
          // The club's reason is in the player's notifications; the hours may have gone for another reason too.
          setNotice({
            text:
              `The club did not confirm your payment${ref ? ` with reference ${ref}` : ''}, so those hours were released. ` +
              'Check your notifications for the club’s reason. If you did pay, show your GCash receipt at the desk.',
            notifications: true,
          })
          await reload()
        }
      } catch {
        // Try again at the next check.
      } finally {
        checking = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), PAYMENT_CHECK_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingId])

  const selectedCourt = avail.find((c) => c.court.id === courtId)
  // Members with an active membership pay the court's member rate; players pay the regular rate.
  const rate = selectedCourt ? courtRateFor(selectedCourt.court, member) : 0
  const isMember = hasActiveMembership(member)
  const total = rate * hours

  /** Free hours in a row from `h`, counted up to the chosen length. */
  const freeHoursFrom = (h: number) => {
    let run = 0
    while (run < hours && h + run < CLUB_CLOSE_HOUR && selectedCourt?.slots.find((s) => s.startHour === h + run)?.available) run++
    return run
  }
  // A start time stops counting once its hours are taken (say, after a reload).
  const selectionOk = startHour != null && freeHoursFrom(startHour) === hours
  const selectionLabel = selectionOk
    ? `${hourLabel(startHour)} – ${hourLabel(startHour + hours)} · ${hours} ${hours === 1 ? 'hour' : 'hours'}`
    : 'Tap a start time'
  // The app players pay with: the club's one method, or GCash when it has several.
  const payApp = payMethods?.length === 1 ? payMethods[0].label : 'GCash'
  const hasQr = payMethods?.some((m) => m.qr_url) ?? false
  const hasNumber = payMethods?.some((m) => m.account_number) ?? false
  const payStepOne = hasQr
    ? `Open ${payApp} and scan the QR code${hasNumber ? ', or send the money to the number shown' : ''}.`
    : hasNumber
      ? `Open ${payApp} and send the money to the number shown.`
      : `Open ${payApp} and pay the club's account shown below.`
  const courtNameOf = (b: Booking) => b.court?.name ?? avail.find((row) => row.court.id === b.court_id)?.court.name ?? 'Court'

  async function goPay() {
    if (!user || !member || !courtId || startHour == null || !payMethods?.length) return
    setBusy(true)
    setError(null)
    try {
      const booking = await api.createBooking({
        court_id: courtId,
        venue_id: venueId || undefined,
        member_id: member.id,
        dateYmd,
        startHour,
        hours,
        user_id: user.id,
      })
      setPending(booking)
      // Counted on this phone from when the hold came back, not from the server's time, so a
      // phone clock that runs fast cannot cut the minutes short.
      setHoldEnds(Date.now() + BOOKING_HOLD_MINUTES * 60000)
      setNotice(null)
      setReference('')
      setReferenceError(null)
      setStep('pay')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not hold slot'
      // Reloading clears messages, so show this one after it.
      await reload()
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  /** The player says they paid: send the reference so the club can check it. */
  async function submitPayment(event: FormEvent) {
    event.preventDefault()
    if (!pending || busy || checkingHold) return
    const cleaned = cleanReference(reference)
    const problem = referenceProblem(cleaned, payApp)
    setReferenceError(problem)
    if (problem) {
      referenceField.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sent = await api.submitBookingPayment({ booking_id: pending.id, reference: cleaned })
      const waiting = { ...withLatest(pending, sent), payment_reference: sent.payment_reference ?? cleaned }
      // The club's time is counted on this phone from the reply, like the time to pay.
      openWaiting(waiting, Date.now() + CONFIRM_PAYMENT_MINUTES * 60000)
    } catch (e) {
      const message = e instanceof Error && e.message
        ? e.message
        : 'Could not send your reference number. Check your connection and try again.'
      // Unless the reference itself was refused, the club may have it anyway: the reply can be
      // lost on a weak connection, or it was sent before. Ask before showing the error.
      if (!REFERENCE_REFUSED.test(message)) {
        const latest = await api.myBooking(pending.id).catch(() => null)
        if (latest?.payment_submitted_at) {
          const sentBooking = withLatest(pending, latest)
          openWaiting(sentBooking, confirmDeadline(sentBooking))
          return
        }
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Reopen a checkout from Your bookings, as it stands now: pay for hours still held, or wait
   * for the club to check a payment already sent. Only one checkout shows at a time.
   */
  async function resumeCheckout(listed: Booking) {
    if (busy || resumingId) return
    setResumingId(listed.id)
    setError(null)
    // undefined: could not check, so go on with what the list showed. null: the booking is gone.
    const latest = await api.myBooking(listed.id).catch(() => undefined)
    setResumingId(null)
    const current = latest ? withLatest(listed, latest) : listed
    if (latest !== null && checkoutState(current) === 'holding' && current.hold_expires_at) {
      setPending(current)
      // The hold started on another visit, so only the server's time is known here.
      setHoldEnds(new Date(current.hold_expires_at).getTime())
      setReference('')
      setReferenceError(null)
      setNotice(null)
      // The grid's pick has nothing to do with this checkout.
      setStartHour(null)
      setStep('pay')
    } else if (latest !== null && current.payment_submitted_at) {
      // Sent: the waiting screen checks at once and shows the club's answer.
      openWaiting(current, confirmDeadline(current))
    } else {
      setStartHour(null)
      setNotice({ text: 'Those hours are no longer held for you, so there is nothing to pay. Pick a time again.' })
      await reload()
    }
  }

  return (
    <AppShell role="member">
      <AppHeader
        title="Book a court"
        subtitle="1. Venue · 2. Date · 3. Court · 4. Pay"
        right={<SignOutButton />}
      />
      <main className="safe-bottom px-4 pt-4 space-y-4">
        {!member && !loading ? (
          <section className="card p-4">
            <p className="font-bold">No membership linked</p>
            <p className="text-sm text-slate-500 mt-1">
              Ask the desk to link your account to a member profile before booking online.
            </p>
          </section>
        ) : null}

        {step === 'done' && confirmed ? (
          <section className="enter-rise card p-5 space-y-3">
            <div className="flex items-center gap-2 text-brand-700">
              <CheckCircle2 size={22} aria-hidden />
              <h2 ref={stepHeading} tabIndex={-1} className="outline-none font-extrabold text-lg">Booking confirmed</h2>
            </div>
            <p className="text-sm text-slate-600">
              {courtNameOf(confirmed)} · {fmtDateTime(confirmed.start_at)} · {confirmed.hours}h
            </p>
            <p className="text-sm font-bold">{peso(confirmed.amount)}</p>
            <p className="text-sm text-slate-700">
              {confirmed.hours === 1 ? 'This hour now shows' : `These ${confirmed.hours} hours now show`} as Booked.
              No refunds.
            </p>
            {confirmed.payment_reference ?? confirmed.payment_ref ? (
              <p className="text-sm text-slate-700">
                GCash reference <span className="font-mono font-bold">{confirmed.payment_reference ?? confirmed.payment_ref}</span>
              </p>
            ) : null}
            <p className="text-sm text-slate-600">Show this at the desk when you arrive.</p>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                setConfirmed(null)
                setStep('pick')
              }}
            >
              Book another
            </button>
          </section>
        ) : null}

        {step === 'pay' && pending ? (
          <section className="enter-rise card p-4 space-y-4">
            <button
              type="button"
              className="min-h-12 text-sm font-bold text-brand-700 inline-flex items-center gap-1"
              onClick={() => void leaveCheckout(pending.id, null)}
              disabled={busy || checkingHold}
            >
              <ChevronLeft size={16} aria-hidden /> Back
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Checkout</p>
              <h2 ref={stepHeading} tabIndex={-1} className="outline-none font-extrabold text-lg mt-0.5">
                {courtNameOf(pending)} · {fmtDateTime(pending.start_at)}
              </h2>
              <p className="text-sm text-slate-600">
                {timeRange(pending)} · {pending.hours} {pending.hours === 1 ? 'hour' : 'hours'}
              </p>
            </div>

            <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-700">Amount to pay</p>
              <p className="text-heading-1 font-extrabold tabular-nums text-slate-900">{peso(pending.amount)}</p>
            </div>

            {holdEnds != null ? <HoldCountdown endsAt={holdEnds} /> : null}

            <div className="space-y-3">
              <h3 className="text-title font-extrabold text-slate-900">How to pay</h3>
              <ol className="list-decimal space-y-2 pl-6 text-body text-slate-800 marker:font-extrabold">
                <li>{payStepOne}</li>
                <li>
                  Pay exactly <span className="font-extrabold">{peso(pending.amount)}</span>.
                </li>
                <li>Type the reference number {payApp} shows after you pay, then tap “I’ve paid”.</li>
              </ol>
              {(payMethods ?? []).map((m) => <PayMethodCard key={m.id} method={m} />)}
            </div>

            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <span className="font-extrabold">No refunds.</span>{' '}
              Once the club confirms your payment, {pending.hours === 1 ? 'this hour is' : `these ${pending.hours} hours are`} booked for you.
              Bookings cannot be cancelled or refunded.
            </p>

            <form className="space-y-3" noValidate onSubmit={(event) => void submitPayment(event)}>
              <div>
                <label className="label" htmlFor="checkout-reference">{payApp} reference number</label>
                <input
                  ref={referenceField}
                  id="checkout-reference"
                  className="input font-mono text-lg tracking-wider"
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value)
                    if (referenceError) setReferenceError(null)
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={60}
                  aria-invalid={referenceError ? true : undefined}
                  aria-describedby={referenceError ? 'checkout-reference-help checkout-reference-error' : 'checkout-reference-help'}
                />
                <p id="checkout-reference-help" className="mt-1 text-sm text-slate-600">
                  It is on your receipt in {payApp}, often called “Ref No.” Spaces are fine.
                </p>
                {referenceError ? (
                  <p id="checkout-reference-error" className="mt-1 text-sm font-semibold text-red-700">{referenceError}</p>
                ) : null}
              </div>

              {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}

              <button type="submit" className="btn-primary w-full" disabled={busy || checkingHold} aria-busy={busy}>
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} aria-hidden /> Sending…
                  </span>
                ) : (
                  'I’ve paid'
                )}
              </button>
            </form>
          </section>
        ) : null}

        {step === 'waiting' && pending ? (
          <section className="enter-rise card p-4 space-y-4">
            <div className="flex items-center gap-2 text-brand-800">
              <Hourglass size={22} aria-hidden />
              <h2 ref={stepHeading} tabIndex={-1} className="outline-none font-extrabold text-lg">Waiting for the club to confirm</h2>
            </div>
            <p className="text-body text-slate-700">
              The club is checking that your payment arrived. This screen updates by itself.
            </p>
            <div className="rounded-xl border-2 border-slate-200 p-3 space-y-1">
              <p className="font-bold text-slate-900">{courtNameOf(pending)} · {fmtDate(pending.start_at)}</p>
              <p className="text-sm text-slate-700">
                {timeRange(pending)} · {pending.hours} {pending.hours === 1 ? 'hour' : 'hours'} · {peso(pending.amount)}
              </p>
            </div>
            {pending.payment_reference ? (
              <div>
                <p className="text-sm font-bold text-slate-700">Your reference number</p>
                <p className="font-mono text-heading-3 font-extrabold tracking-wider break-all text-slate-900">{pending.payment_reference}</p>
              </div>
            ) : null}
            {confirmEnds != null ? <ConfirmCountdown endsAt={confirmEnds} /> : null}
            <p className="text-sm text-slate-600">
              You can leave this screen. Your booking shows under Your bookings as “Waiting for the club to confirm”.
            </p>
          </section>
        ) : null}

        {step === 'pick' ? (
          <>
            {notice ? (
              <section role="alert" className="card border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
                <p>{notice.text}</p>
                {notice.notifications ? (
                  <Link
                    to="/member/notifications"
                    className="mt-1 inline-flex min-h-12 items-center font-extrabold text-amber-950 underline underline-offset-2"
                  >
                    Open your notifications
                  </Link>
                ) : null}
              </section>
            ) : null}
            <div className="px-1">
              <p className="text-body text-slate-600">
                {isMember ? 'You pay the member rate where a court has one.' : 'You pay the regular rate. Members pay less where a court has a member rate.'}
              </p>
              <Link to="/clubs" className="inline-flex min-h-12 items-center font-semibold text-brand-800 underline underline-offset-2">
                Book at another club
              </Link>
            </div>
            {venues.length > 1 ? (
              <section className="card p-3">
                <label className="label px-1" htmlFor="member-book-venue">Venue</label>
                <select
                  id="member-book-venue"
                  className="input"
                  value={venueId}
                  onChange={(event) => {
                    setVenueId(event.target.value)
                    setCourtId(null)
                    setStartHour(null)
                  }}
                >
                  {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                </select>
              </section>
            ) : null}

            <section className="card p-3">
              <p className="label px-1 mb-2">Date</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => (
                  <button
                    key={d.ymd}
                    type="button"
                    onClick={() => {
                      setDateYmd(d.ymd)
                      setNotice(null)
                      setStartHour(null)
                    }}
                    className={`shrink-0 rounded-xl px-3 py-2 min-h-12 text-sm font-bold border ${
                      dateYmd === d.ymd
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="card p-3">
              <p className="label px-1 mb-2">Duration</p>
              <div className="flex gap-2">
                {[1, 2, 3].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setHours(h)
                      setNotice(null)
                      setStartHour(null)
                    }}
                    className={`flex-1 rounded-xl min-h-12 font-bold border ${
                      hours === h
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </section>

            {loading ? (
              <AvailabilityLoading />
            ) : (
              <>
                <section className="enter-fade card p-3 space-y-3">
                  <p className="label px-1">Court</p>
                  <div className="grid grid-cols-2 gap-2">
                    {avail.map(({ court }) => {
                      const outOfService = court.status === 'maintenance'
                      return (
                        <button
                          key={court.id}
                          type="button"
                          disabled={outOfService}
                          onClick={() => {
                            setCourtId(court.id)
                            setNotice(null)
                            setStartHour(null)
                          }}
                          className={`rounded-xl border px-3 py-3 text-left min-h-14 ${
                            outOfService
                              ? 'border-slate-200 bg-slate-50 text-slate-500'
                              : courtId === court.id
                                ? 'border-brand-600 bg-brand-50'
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          <p className="font-extrabold">{court.name}</p>
                          <p className="text-xs text-slate-500">
                            {outOfService ? 'Out of service' : `${peso(courtRateFor(court, member))}/hr`}
                          </p>
                          {!outOfService && !isMember && court.member_rate != null && court.member_rate < court.hourly_rate ? (
                            <p className="text-xs text-brand-800">Members {peso(court.member_rate)}/hr</p>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="enter-fade card p-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <p className="label mb-0">Available times · {fmtDate(dateYmd + 'T12:00:00+08:00')}</p>
                    <p className="text-xs font-bold text-brand-700">{peso(total)}</p>
                  </div>
                  <p className="px-1 mb-2 text-sm font-semibold text-slate-700" aria-live="polite">{selectionLabel}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(selectedCourt?.slots ?? []).map((s) => {
                      const selected = selectionOk && s.startHour >= startHour && s.startHour < startHour + hours
                      const look = slotLook(s, { selected, freeHours: freeHoursFrom(s.startHour), wanted: hours })
                      const face = (
                        <>
                          <span className="text-sm font-bold">{hourLabel(s.startHour)}</span>
                          <span className="inline-flex items-center gap-1 text-sm font-semibold">
                            {look.Icon ? <look.Icon size={12} aria-hidden fill={look.Icon === Circle ? 'currentColor' : 'none'} /> : null}
                            {look.word}
                          </span>
                        </>
                      )
                      const cellClass = `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center ${look.tone}`
                      // Hours that cannot start a booking are plain text, not faded buttons,
                      // so "Booked" stays easy to read.
                      return look.pickable ? (
                        <button
                          key={s.startHour}
                          type="button"
                          onClick={() => {
                            setStartHour(s.startHour)
                            setNotice(null)
                          }}
                          className={cellClass}
                        >
                          {face}
                        </button>
                      ) : (
                        <div key={s.startHour} className={cellClass}>
                          {face}
                        </div>
                      )
                    })}
                  </div>
                </section>

                {error ? <p role="alert" className="text-sm text-red-600 font-medium">{error}</p> : null}

                {payMethodsFailed ? (
                  <section role="alert" className="card border-red-200 bg-red-50 p-4 text-red-900">
                    <p className="font-extrabold">We could not load how to pay this club.</p>
                    <p className="mt-1 text-sm">Check your connection, then try again.</p>
                    <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void loadPayMethods()}>
                      Try again
                    </button>
                  </section>
                ) : payMethods && payMethods.length === 0 ? (
                  <section className="card border-amber-300 bg-amber-50 p-4 text-amber-950">
                    <p className="font-extrabold">This club hasn&apos;t set up GCash payment yet. Ask the desk to reserve.</p>
                  </section>
                ) : (
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={!member || !selectionOk || busy || !payMethods || resumingId != null}
                    aria-busy={busy}
                    onClick={() => void goPay()}
                  >
                    {busy ? 'Holding slot…' : `Continue · ${peso(total)}`}
                  </button>
                )}
              </>
            )}

            {mine.length > 0 ? (
              <section className="card p-4">
                <h2 className="font-extrabold mb-2">Your bookings</h2>
                {mine.slice(0, 8).map((b) => {
                  // An online checkout left open (another visit, or a reload) can be picked up again.
                  // Desk bookings have no hold time and are paid at the desk.
                  const state = b.status === 'pending_payment' ? checkoutState(b) : null
                  const canPay = state === 'holding' && Boolean(b.hold_expires_at) && Boolean(payMethods?.length)
                  const canCheck = state === 'awaiting_confirmation'
                  const titleId = `my-booking-${b.id}`
                  const opening = resumingId === b.id
                  return (
                    <div key={b.id} className="list-row flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p id={titleId} className="font-semibold text-sm truncate">
                          {b.court?.name ?? 'Court'} · {fmtDateTime(b.start_at)}
                        </p>
                        <p className="text-sm text-slate-600">
                          <span className="font-semibold text-slate-800">{bookingStatusWord(b)}</span>
                          {b.payment_reference ?? b.payment_ref ? ` · Ref ${b.payment_reference ?? b.payment_ref}` : ''}
                        </p>
                      </div>
                      <p className="font-bold text-sm">{peso(b.amount)}</p>
                      {canPay || canCheck ? (
                        <button
                          type="button"
                          className={canPay ? 'btn-primary' : 'btn-secondary'}
                          aria-describedby={titleId}
                          disabled={busy || resumingId != null}
                          aria-busy={opening}
                          onClick={() => void resumeCheckout(b)}
                        >
                          {opening ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="animate-spin" size={18} aria-hidden /> Opening…
                            </span>
                          ) : canPay ? (
                            'Continue to pay'
                          ) : (
                            'Check status'
                          )}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </AppShell>
  )
}
