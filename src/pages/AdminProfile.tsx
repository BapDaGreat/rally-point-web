import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { BackButton } from '../components/BackButton'
import { AppHeader, AppShell, SignOutButton } from '../components/Shell'
import { LoadingShapes, SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  ADDON_UNITS,
  AMENITIES,
  MAX_CLUB_ADDONS,
  MAX_CLUB_COACHES,
  MAX_CLUB_GALLERY_PHOTOS,
  MAX_CLUB_PAYMENT_METHODS,
  addonPriceLabel,
  addonProblem,
  captionProblem,
  cleanText,
  coachProblem,
  emptyClubProfile,
  normalizeProfile,
  paymentMethodProblem,
  profileProblem,
} from '../lib/clubProfile'
import { stagger } from '../lib/motion'
import type {
  AddonUnit,
  AdminClubProfile,
  Amenity,
  ClubAddon,
  ClubAddonInput,
  ClubCoach,
  ClubCoachInput,
  ClubPaymentMethod,
  ClubPaymentMethodInput,
  ClubProfileFields,
} from '../types'
import { peso } from '../types'
import { PickPhotos } from './AdminPhotos'

/** Runs one save; returns true when it worked, so a form can close. */
type Run = (key: string, action: () => Promise<unknown>, done: string) => Promise<boolean>

const linkStyle = 'inline-flex min-h-12 items-center text-sm font-semibold text-brand-800 underline'
const removeStyle = 'inline-flex min-h-12 items-center text-sm font-semibold text-red-700 underline'

/**
 * The club's business profile: what players see about the club on its public page.
 * Club admins only (the route is admin-only, and every save is checked again in the database).
 */
export function AdminProfile() {
  const { activeClub } = useAuth()
  const [data, setData] = useState<AdminClubProfile | null>(null)
  const [fields, setFields] = useState<ClubProfileFields>(emptyClubProfile)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // The first load fills the form. Later reloads (after each save) refresh the lists only,
  // so text being typed in another section is never replaced.
  const reload = useCallback(async (fillForm = false) => {
    try {
      const next = await api.adminClubProfile()
      setData(next)
      if (fillForm) setFields(next.profile)
      setLoadFailed(false)
    } catch (error) {
      setLoadFailed(true)
      setMessage(error instanceof Error ? error.message : 'Could not load the business profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload(true)
  }, [reload])

  const run: Run = async (key, action, done) => {
    setBusy(key)
    try {
      await action()
      setMessage(done)
      await reload()
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveProfile(event: FormEvent, key: string) {
    event.preventDefault()
    const problem = profileProblem(fields)
    if (problem) {
      setMessage(problem)
      return
    }
    if (await run(key, () => api.updateClubProfile(fields), 'Saved. Players see it on your club page now.')) {
      setFields(normalizeProfile(fields))
    }
  }

  const set = <K extends keyof ClubProfileFields>(key: K) => (value: ClubProfileFields[K]) =>
    setFields((now) => ({ ...now, [key]: value }))

  return (
    <AppShell role="admin">
      <AppHeader title="Business profile" subtitle="What players see about your club" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-3 space-y-4">
        <div className="flex items-center gap-2">
          <BackButton />
          <p className="text-sm text-slate-500">{activeClub?.name ?? 'Your club'}</p>
        </div>

        <section className="card p-4 space-y-2">
          <p className="text-sm text-slate-700">
            Everything here shows on your public club page as soon as you save it. Courts, rates, locations and opening
            hours are on <Link to="/admin/venues" className="font-semibold text-brand-800 underline">Venues &amp; courts</Link>.
          </p>
          {activeClub ? (
            <Link to={`/clubs/${activeClub.slug}`} className={`${linkStyle} gap-1`}>
              See your club page <ExternalLink size={14} aria-hidden />
            </Link>
          ) : null}
        </section>

        {loading ? <ProfileLoading /> : loadFailed || !data ? (
          <section className="card p-4 space-y-3" role="alert">
            <p className="text-sm text-slate-700">The business profile could not be loaded. It may not be set up on this system yet.</p>
            <button type="button" className="btn-secondary" onClick={() => { setLoading(true); void reload(true) }}>Try again</button>
          </section>
        ) : (
          <>
            <form className="enter-rise card p-4 space-y-3" style={stagger(0)} onSubmit={(event) => void saveProfile(event, 'details')} aria-labelledby="profile-details">
              <SectionTitle id="profile-details" hint="Your story, how to reach you, and what your place offers.">Business details</SectionTitle>
              <TextArea id="profile-about" label="About your club" value={fields.about} onChange={set('about')} max={1500} rows={5}
                placeholder="Who you are, your courts, and what makes your place special." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <TextField id="profile-phone" label="Phone (optional)" value={fields.phone} onChange={set('phone')} type="tel" placeholder="0917 123 4567" max={24} />
                <TextField id="profile-email" label="Email (optional)" value={fields.email} onChange={set('email')} type="email" placeholder="hello@yourclub.ph" max={254} />
              </div>
              <TextField id="profile-facebook" label="Facebook page link (optional)" value={fields.facebook_url} onChange={set('facebook_url')} type="url"
                placeholder="https://facebook.com/yourclub" max={300} />
              <TextField id="profile-messenger" label="Messenger link (optional)" value={fields.messenger_url} onChange={set('messenger_url')} type="url"
                placeholder="https://m.me/yourclub" max={300} />
              <TextField id="profile-instagram" label="Instagram link (optional)" value={fields.instagram_url} onChange={set('instagram_url')} type="url"
                placeholder="https://instagram.com/yourclub" max={300} />
              <TextField id="profile-website" label="Website (optional)" value={fields.website_url} onChange={set('website_url')} type="url"
                placeholder="https://yourclub.ph" max={300} />
              <p className="text-xs text-slate-500">Links must start with https://. Copy them from your browser’s address bar.</p>
              <fieldset>
                <legend className="label">Amenities</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AMENITIES.map((amenity) => (
                    <label key={amenity.value} className="min-h-12 rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={fields.amenities.includes(amenity.value)}
                        onChange={(event) => set('amenities')(
                          event.target.checked
                            ? [...fields.amenities, amenity.value]
                            : fields.amenities.filter((value: Amenity) => value !== amenity.value),
                        )}
                      />
                      <span className="flex-1">{amenity.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SaveButton busy={busy === 'details'}>Save business details</SaveButton>
            </form>

            <form className="enter-rise card p-4 space-y-3" style={stagger(1)} onSubmit={(event) => void saveProfile(event, 'rules')} aria-labelledby="profile-rules">
              <SectionTitle id="profile-rules" hint="Players can open these on your club page before they book.">Rules and terms</SectionTitle>
              <TextArea id="profile-house-rules" label="House rules" value={fields.house_rules} onChange={set('house_rules')} max={3000} rows={5}
                placeholder="Example: Wear non-marking shoes. Arrive 10 minutes early. No food on the courts." />
              <TextArea id="profile-cancellation" label="Cancellation and refunds" value={fields.cancellation_policy} onChange={set('cancellation_policy')} max={2000} rows={4}
                placeholder="Example: Cancel at least 24 hours ahead for a full refund." />
              <TextArea id="profile-terms" label="Terms and conditions" value={fields.terms} onChange={set('terms')} max={6000} rows={6} />
              <SaveButton busy={busy === 'rules'}>Save rules and terms</SaveButton>
            </form>

            <PaymentCard
              index={2}
              note={fields.payment_note}
              onNoteChange={set('payment_note')}
              onSaveNote={(event) => void saveProfile(event, 'payment-note')}
              methods={data.payment_methods}
              busy={busy}
              run={run}
            />
            <AddonsCard index={3} addons={data.addons} busy={busy} run={run} />
            <CoachesCard index={4} coaches={data.coaches} busy={busy} run={run} />
            <GalleryCard index={5} gallery={data.gallery} busy={busy} run={run} />
          </>
        )}
      </main>
      {message ? <div className="toast" role="status">{message}</div> : null}
    </AppShell>
  )
}

function ProfileLoading() {
  return (
    <LoadingShapes label="Loading the business profile…">
      <div className="space-y-4" aria-hidden>
        {[0, 1].map((key) => (
          <div key={key} className="card p-4 space-y-3">
            <SkeletonLine size="subtitle" className="w-1/2" />
            <SkeletonLine size="caption" className="w-3/4" />
            <SkeletonBlock className="h-28 w-full rounded-[14px]!" />
            <SkeletonBlock className="h-[54px] w-full rounded-[14px]!" />
            <SkeletonBlock className="h-[54px] w-full rounded-[16px]!" />
          </div>
        ))}
      </div>
    </LoadingShapes>
  )
}

// ---- Small form pieces ----

function SectionTitle({ id, hint, children }: { id: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="font-extrabold">{children}</h2>
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </div>
  )
}

function SaveButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
      {busy ? 'Saving…' : children}
    </button>
  )
}

function TextField({
  id, label, value, onChange, type = 'text', placeholder, max, required, inputMode, list,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  type?: 'text' | 'tel' | 'email' | 'url' | 'number'
  placeholder?: string
  max?: number
  required?: boolean
  inputMode?: 'decimal' | 'tel' | 'email' | 'url' | 'text'
  list?: string
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={type === 'number' ? undefined : max}
        required={required}
        inputMode={inputMode}
        list={list}
        {...(type === 'number' ? { min: 0, max: 100000, step: '0.01' } : {})}
      />
    </div>
  )
}

function TextArea({
  id, label, value, onChange, max, rows = 4, placeholder,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  max: number
  rows?: number
  placeholder?: string
}) {
  const length = (value ?? '').length
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="input"
        rows={rows}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        maxLength={max}
        placeholder={placeholder}
        aria-describedby={`${id}-count`}
      />
      <p id={`${id}-count`} className="mt-1 text-xs text-slate-500">{length.toLocaleString()} of {max.toLocaleString()} characters</p>
    </div>
  )
}

function ActiveToggle({ id, checked, onChange, hint }: { id: string; checked: boolean; onChange: (value: boolean) => void; hint: string }) {
  return (
    <label htmlFor={id} className="min-h-12 rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="h-5 w-5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="flex-1">
        <span className="font-semibold">Show on club page</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )
}

function FormButtons({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : label}</button>
    </div>
  )
}

function HiddenPill({ shown }: { shown: boolean }) {
  return shown ? null : <span className="pill pill-warn whitespace-nowrap">Hidden</span>
}

/** A number field's text as a number, or null when empty. */
function asNumber(value: string | null) {
  return value == null || value.trim() === '' ? null : Number(value)
}

// ---- Payment ----

function PaymentCard({
  index, note, onNoteChange, onSaveNote, methods, busy, run,
}: {
  index: number
  note: string | null
  onNoteChange: (value: string | null) => void
  onSaveNote: (event: FormEvent) => void
  methods: ClubPaymentMethod[]
  busy: string | null
  run: Run
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <section className="enter-rise card p-4 space-y-3" style={stagger(index)} aria-labelledby="profile-payment">
      <SectionTitle id="profile-payment" hint="Players pay you directly. Rally Point does not receive or check these payments.">
        How players pay you
      </SectionTitle>
      <form className="space-y-3" onSubmit={onSaveNote}>
        <TextArea id="profile-payment-note" label="Payment note" value={note} onChange={onNoteChange} max={600} rows={3}
          placeholder="Example: Pay at the desk, or send by GCash and show the receipt when you arrive." />
        <SaveButton busy={busy === 'payment-note'}>Save payment note</SaveButton>
      </form>

      <h3 className="text-sm font-bold text-slate-700">Payment methods ({methods.length} of {MAX_CLUB_PAYMENT_METHODS})</h3>
      <datalist id="payment-labels">
        {['GCash', 'Maya', 'BPI', 'BDO', 'Bank transfer', 'Cash at the desk'].map((label) => <option key={label} value={label} />)}
      </datalist>
      {methods.length === 0 ? <p className="text-sm text-slate-600">No payment methods yet.</p> : null}
      <ul className="space-y-2">
        {methods.map((method) => (
          <li key={method.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
            {editing === method.id ? (
              <PaymentMethodForm
                method={method}
                saving={busy === `pay:${method.id}`}
                onCancel={() => setEditing(null)}
                onSave={async (input) => {
                  if (await run(`pay:${method.id}`, () => api.upsertClubPaymentMethod(input), `${input.label.trim()} saved`)) setEditing(null)
                }}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{method.label}</p>
                    {method.account_name ? <p className="text-sm text-slate-600">{method.account_name}</p> : null}
                    {method.account_number ? <p className="text-sm font-semibold tabular-nums">{method.account_number}</p> : null}
                  </div>
                  <HiddenPill shown={method.is_active} />
                </div>
                {method.qr_url ? (
                  <img src={method.qr_url} alt={`${method.label} QR code`} className="mx-auto aspect-square w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white object-contain" loading="lazy" />
                ) : (
                  <p className="text-xs text-slate-500">No QR code. Add a screenshot of your QR code so players can scan it.</p>
                )}
                {busy === `qr:${method.id}` ? <p className="text-sm font-semibold text-brand-800" role="status">Saving the QR code…</p> : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PickPhotos
                    label={method.qr_url ? 'Change QR code' : 'Add QR code'}
                    disabled={busy !== null}
                    onPick={(files) => void run(`qr:${method.id}`, () => api.setClubPaymentQr(method.id, files[0]), 'QR code saved')}
                  />
                  {method.qr_url ? (
                    <button type="button" className="btn-secondary text-sm" disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`Remove the ${method.label} QR code?`)) void run(`qr:${method.id}`, () => api.setClubPaymentQr(method.id, null), 'QR code removed')
                      }}>
                      Remove QR code
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" className={linkStyle} onClick={() => setEditing(method.id)} aria-label={`Edit ${method.label}`}>Edit</button>
                  <button type="button" className={removeStyle} disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm(`Remove ${method.label}? Players will no longer see it.`)) {
                        void run(`pay:${method.id}`, () => api.removeClubPaymentMethod(method.id), `${method.label} removed`)
                      }
                    }}
                    aria-label={`Remove ${method.label}`}>
                    Remove
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <PaymentMethodForm
            saving={busy === 'pay:new'}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              if (await run('pay:new', () => api.upsertClubPaymentMethod(input), `${input.label.trim()} added`)) setEditing(null)
            }}
          />
        </div>
      ) : methods.length < MAX_CLUB_PAYMENT_METHODS ? (
        <button type="button" className="btn-secondary w-full" onClick={() => setEditing('new')}>Add a payment method</button>
      ) : null}
    </section>
  )
}

function PaymentMethodForm({
  method, saving, onCancel, onSave,
}: {
  method?: ClubPaymentMethod
  saving: boolean
  onCancel: () => void
  onSave: (input: ClubPaymentMethodInput) => Promise<void>
}) {
  const [label, setLabel] = useState<string | null>(method?.label ?? '')
  const [accountName, setAccountName] = useState<string | null>(method?.account_name ?? '')
  const [accountNumber, setAccountNumber] = useState<string | null>(method?.account_number ?? '')
  const [active, setActive] = useState(method?.is_active ?? true)
  const [problem, setProblem] = useState<string | null>(null)
  const prefix = method ? `pay-${method.id}` : 'pay-new'

  function submit(event: FormEvent) {
    event.preventDefault()
    const input: ClubPaymentMethodInput = {
      id: method?.id,
      label: label ?? '',
      account_name: cleanText(accountName),
      account_number: cleanText(accountNumber),
      is_active: active,
    }
    const found = paymentMethodProblem(input)
    setProblem(found)
    if (!found) void onSave(input)
  }

  return (
    <form className="space-y-3" onSubmit={submit} aria-label={method ? `Edit ${method.label}` : 'Add a payment method'}>
      <TextField id={`${prefix}-label`} label="Name" value={label} onChange={setLabel} placeholder="GCash" max={40} required list="payment-labels" />
      <TextField id={`${prefix}-account-name`} label="Account name (optional)" value={accountName} onChange={setAccountName} placeholder="Rally Point Gensan" max={80} />
      <TextField id={`${prefix}-account-number`} label="Number (optional)" value={accountNumber} onChange={setAccountNumber} placeholder="0917 123 4567" max={60} />
      <ActiveToggle id={`${prefix}-active`} checked={active} onChange={setActive} hint="Turn off to hide it for now without deleting it." />
      {problem ? <p className="text-sm font-semibold text-red-700" role="alert">{problem}</p> : null}
      <FormButtons saving={saving} onCancel={onCancel} label={method ? 'Save' : 'Add'} />
    </form>
  )
}

// ---- Add-ons ----

function AddonsCard({ index, addons, busy, run }: { index: number; addons: ClubAddon[]; busy: string | null; run: Run }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <section className="enter-rise card p-4 space-y-3" style={stagger(index)} aria-labelledby="profile-addons">
      <SectionTitle id="profile-addons" hint="Paddle rental, balls, towels and other extras. Players see them on your club page and pay for them at the club.">
        Add-ons
      </SectionTitle>
      {addons.length === 0 ? <p className="text-sm text-slate-600">No add-ons yet.</p> : null}
      <ul className="space-y-2">
        {addons.map((addon) => (
          <li key={addon.id} className="rounded-xl border border-slate-200 p-3">
            {editing === addon.id ? (
              <AddonForm
                addon={addon}
                saving={busy === `addon:${addon.id}`}
                onCancel={() => setEditing(null)}
                onSave={async (input) => {
                  if (await run(`addon:${addon.id}`, () => api.upsertClubAddon(input), `${input.name.trim()} saved`)) setEditing(null)
                }}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{addon.name}</p>
                  <p className="text-sm text-brand-800">{addonPriceLabel(addon.price, addon.unit)}</p>
                  {addon.description ? <p className="text-sm text-slate-600">{addon.description}</p> : null}
                  <div className="flex flex-wrap gap-x-4">
                    <button type="button" className={linkStyle} onClick={() => setEditing(addon.id)} aria-label={`Edit ${addon.name}`}>Edit</button>
                    <button type="button" className={removeStyle} disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`Remove ${addon.name}? Players will no longer see it.`)) {
                          void run(`addon:${addon.id}`, () => api.removeClubAddon(addon.id), `${addon.name} removed`)
                        }
                      }}
                      aria-label={`Remove ${addon.name}`}>
                      Remove
                    </button>
                  </div>
                </div>
                <HiddenPill shown={addon.is_active} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <AddonForm
            saving={busy === 'addon:new'}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              if (await run('addon:new', () => api.upsertClubAddon(input), `${input.name.trim()} added`)) setEditing(null)
            }}
          />
        </div>
      ) : addons.length < MAX_CLUB_ADDONS ? (
        <button type="button" className="btn-secondary w-full" onClick={() => setEditing('new')}>Add an add-on</button>
      ) : (
        <p className="text-sm text-slate-600">You have the most add-ons allowed ({MAX_CLUB_ADDONS}). Remove one to add another.</p>
      )}
    </section>
  )
}

function AddonForm({
  addon, saving, onCancel, onSave,
}: {
  addon?: ClubAddon
  saving: boolean
  onCancel: () => void
  onSave: (input: ClubAddonInput) => Promise<void>
}) {
  const [name, setName] = useState<string | null>(addon?.name ?? '')
  const [description, setDescription] = useState<string | null>(addon?.description ?? '')
  const [price, setPrice] = useState<string | null>(addon ? String(addon.price) : '')
  const [unit, setUnit] = useState<AddonUnit>(addon?.unit ?? 'per_hour')
  const [active, setActive] = useState(addon?.is_active ?? true)
  const [problem, setProblem] = useState<string | null>(null)
  const prefix = addon ? `addon-${addon.id}` : 'addon-new'

  function submit(event: FormEvent) {
    event.preventDefault()
    const input: ClubAddonInput = {
      id: addon?.id,
      name: name ?? '',
      description: cleanText(description),
      price: asNumber(price) ?? Number.NaN,
      unit,
      is_active: active,
    }
    const found = addonProblem(input)
    setProblem(found)
    if (!found) void onSave(input)
  }

  return (
    <form className="space-y-3" onSubmit={submit} aria-label={addon ? `Edit ${addon.name}` : 'Add an add-on'}>
      <TextField id={`${prefix}-name`} label="Name" value={name} onChange={setName} placeholder="Paddle rental" max={60} required />
      <div className="grid grid-cols-2 gap-2">
        <TextField id={`${prefix}-price`} label="Price (Php)" value={price} onChange={setPrice} type="number" inputMode="decimal" required />
        <div>
          <label className="label" htmlFor={`${prefix}-unit`}>Charged</label>
          <select id={`${prefix}-unit`} className="input" value={unit} onChange={(event) => setUnit(event.target.value as AddonUnit)}>
            {ADDON_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <TextField id={`${prefix}-description`} label="Short description (optional)" value={description} onChange={setDescription} placeholder="Two paddles, ask at the desk" max={200} />
      <ActiveToggle id={`${prefix}-active`} checked={active} onChange={setActive} hint="Turn off when it is not available, without deleting it." />
      {problem ? <p className="text-sm font-semibold text-red-700" role="alert">{problem}</p> : null}
      <FormButtons saving={saving} onCancel={onCancel} label={addon ? 'Save' : 'Add'} />
    </form>
  )
}

// ---- Coaches ----

function CoachesCard({ index, coaches, busy, run }: { index: number; coaches: ClubCoach[]; busy: string | null; run: Run }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <section className="enter-rise card p-4 space-y-3" style={stagger(index)} aria-labelledby="profile-coaches">
      <SectionTitle id="profile-coaches" hint="Only show a coach’s phone number, link or photo if the coach agreed to share it publicly.">
        Coaches
      </SectionTitle>
      {coaches.length === 0 ? <p className="text-sm text-slate-600">No coaches listed yet.</p> : null}
      <ul className="space-y-2">
        {coaches.map((coach) => (
          <li key={coach.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
            {editing === coach.id ? (
              <CoachForm
                coach={coach}
                saving={busy === `coach:${coach.id}`}
                onCancel={() => setEditing(null)}
                onSave={async (input) => {
                  if (await run(`coach:${coach.id}`, () => api.upsertClubCoach(input), `${input.full_name.trim()} saved`)) setEditing(null)
                }}
              />
            ) : (
              <>
                <div className="flex items-start gap-3">
                  {coach.photo_url ? (
                    <img src={coach.photo_url} alt={`Photo of ${coach.full_name}`} className="h-16 w-16 shrink-0 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">No photo</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{coach.full_name}</p>
                    {coach.headline ? <p className="text-sm text-slate-600">{coach.headline}</p> : null}
                    {coach.hourly_rate != null ? <p className="text-sm text-brand-800">{peso(coach.hourly_rate)} per hour</p> : null}
                  </div>
                  <HiddenPill shown={coach.is_active} />
                </div>
                {busy === `coach-photo:${coach.id}` ? <p className="text-sm font-semibold text-brand-800" role="status">Saving the photo…</p> : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PickPhotos
                    label={coach.photo_url ? 'Change photo' : 'Add photo'}
                    disabled={busy !== null}
                    onPick={(files) => void run(`coach-photo:${coach.id}`, () => api.setClubCoachPhoto(coach.id, files[0]), 'Photo saved')}
                  />
                  {coach.photo_url ? (
                    <button type="button" className="btn-secondary text-sm" disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`Remove the photo of ${coach.full_name}?`)) {
                          void run(`coach-photo:${coach.id}`, () => api.setClubCoachPhoto(coach.id, null), 'Photo removed')
                        }
                      }}>
                      Remove photo
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" className={linkStyle} onClick={() => setEditing(coach.id)} aria-label={`Edit ${coach.full_name}`}>Edit</button>
                  <button type="button" className={removeStyle} disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm(`Remove ${coach.full_name} from your coaches?`)) {
                        void run(`coach:${coach.id}`, () => api.removeClubCoach(coach.id), `${coach.full_name} removed`)
                      }
                    }}
                    aria-label={`Remove ${coach.full_name}`}>
                    Remove
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <CoachForm
            saving={busy === 'coach:new'}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              if (await run('coach:new', () => api.upsertClubCoach(input), `${input.full_name.trim()} added`)) setEditing(null)
            }}
          />
        </div>
      ) : coaches.length < MAX_CLUB_COACHES ? (
        <button type="button" className="btn-secondary w-full" onClick={() => setEditing('new')}>Add a coach</button>
      ) : (
        <p className="text-sm text-slate-600">You have the most coaches allowed ({MAX_CLUB_COACHES}). Remove one to add another.</p>
      )}
    </section>
  )
}

function CoachForm({
  coach, saving, onCancel, onSave,
}: {
  coach?: ClubCoach
  saving: boolean
  onCancel: () => void
  onSave: (input: ClubCoachInput) => Promise<void>
}) {
  const [fullName, setFullName] = useState<string | null>(coach?.full_name ?? '')
  const [headline, setHeadline] = useState<string | null>(coach?.headline ?? '')
  const [bio, setBio] = useState<string | null>(coach?.bio ?? '')
  const [rate, setRate] = useState<string | null>(coach?.hourly_rate != null ? String(coach.hourly_rate) : '')
  const [phone, setPhone] = useState<string | null>(coach?.contact_phone ?? '')
  const [link, setLink] = useState<string | null>(coach?.contact_url ?? '')
  const [active, setActive] = useState(coach?.is_active ?? true)
  const [problem, setProblem] = useState<string | null>(null)
  const prefix = coach ? `coach-${coach.id}` : 'coach-new'

  function submit(event: FormEvent) {
    event.preventDefault()
    const input: ClubCoachInput = {
      id: coach?.id,
      full_name: fullName ?? '',
      headline: cleanText(headline),
      bio: cleanText(bio),
      hourly_rate: asNumber(rate),
      contact_phone: cleanText(phone),
      contact_url: cleanText(link),
      is_active: active,
    }
    const found = coachProblem(input)
    setProblem(found)
    if (!found) void onSave(input)
  }

  return (
    <form className="space-y-3" onSubmit={submit} aria-label={coach ? `Edit ${coach.full_name}` : 'Add a coach'}>
      <TextField id={`${prefix}-name`} label="Name" value={fullName} onChange={setFullName} placeholder="Coach Ana Reyes" max={80} required />
      <TextField id={`${prefix}-headline`} label="Short line (optional)" value={headline} onChange={setHeadline} placeholder="Beginners and kids · Weekends" max={120} />
      <TextField id={`${prefix}-rate`} label="Rate per hour, Php (optional)" value={rate} onChange={setRate} type="number" inputMode="decimal" />
      <TextArea id={`${prefix}-bio`} label="About the coach (optional)" value={bio} onChange={setBio} max={1000} rows={3} />
      <TextField id={`${prefix}-phone`} label="Phone players can call (optional)" value={phone} onChange={setPhone} type="tel" placeholder="0917 123 4567" max={24} />
      <TextField id={`${prefix}-link`} label="Facebook or Messenger link (optional)" value={link} onChange={setLink} type="url" placeholder="https://m.me/coachana" max={300} />
      <ActiveToggle id={`${prefix}-active`} checked={active} onChange={setActive} hint="Turn off while the coach is away, without deleting them." />
      {problem ? <p className="text-sm font-semibold text-red-700" role="alert">{problem}</p> : null}
      <FormButtons saving={saving} onCancel={onCancel} label={coach ? 'Save' : 'Add'} />
    </form>
  )
}

// ---- Gallery ----

function GalleryCard({ index, gallery, busy, run }: { index: number; gallery: AdminClubProfile['gallery']; busy: string | null; run: Run }) {
  const [caption, setCaption] = useState<string | null>('')
  const [progress, setProgress] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const room = MAX_CLUB_GALLERY_PHOTOS - gallery.length

  async function add(files: File[]) {
    const found = captionProblem(caption)
    setProblem(found)
    if (found) return
    const picked = files.slice(0, room)
    let added = 0
    await run('gallery', async () => {
      try {
        for (const [position, file] of picked.entries()) {
          setProgress(picked.length > 1 ? `Uploading ${position + 1} of ${picked.length}…` : 'Uploading…')
          await api.addClubPhoto(file, cleanText(caption))
          added += 1
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Could not add the photo'
        throw new Error(added ? `${added} added, then: ${reason}` : reason)
      } finally {
        setProgress(null)
      }
    }, picked.length === 1 ? 'Photo added' : `${picked.length} photos added`)
    setCaption('')
  }

  return (
    <section className="enter-rise card p-4 space-y-3" style={stagger(index)} aria-labelledby="profile-gallery">
      <SectionTitle id="profile-gallery" hint={`${gallery.length} of ${MAX_CLUB_GALLERY_PHOTOS} photos. Show your place: the entrance, the courts, the lounge, a tournament.`}>
        Photo gallery
      </SectionTitle>
      {gallery.length ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {gallery.map((photo, position) => (
            <li key={photo.id} className="overflow-hidden rounded-xl border border-slate-200">
              <img src={photo.url} alt={photo.caption ?? `Club photo ${position + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              {photo.caption ? <p className="px-2 pt-1 text-xs text-slate-600">{photo.caption}</p> : null}
              <button
                type="button"
                className={`${removeStyle} w-full justify-center`}
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm('Remove this photo? Players will no longer see it.')) {
                    void run(`gallery:${photo.id}`, () => api.removeClubPhoto(photo.id), 'Photo removed')
                  }
                }}
                aria-label={`Remove club photo ${position + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">No photos yet.</p>
      )}
      {progress ? <p className="text-sm font-semibold text-brand-800" role="status">{progress}</p> : null}
      {room > 0 ? (
        <div className="space-y-2">
          <TextField id="gallery-caption" label="Caption for the next photos (optional)" value={caption} onChange={setCaption} placeholder="Our six indoor courts" max={120} />
          {problem ? <p className="text-sm font-semibold text-red-700" role="alert">{problem}</p> : null}
          <PickPhotos label={gallery.length ? 'Add more photos' : 'Add photos'} multiple disabled={busy !== null} onPick={(files) => void add(files)} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">The gallery is full. Remove a photo to add another.</p>
      )}
    </section>
  )
}
