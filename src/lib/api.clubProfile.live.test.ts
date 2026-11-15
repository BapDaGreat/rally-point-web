import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { setActiveClubId } from './clubContext'
import { emptyClubProfile } from './clubProfile'

// The live branch of the club profile methods, with Supabase replaced by a small fake.
const live = vi.hoisted(() => {
  const clubId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const tables = new Map<string, unknown[]>()
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null as unknown, error: null as unknown }))
  const upload = vi.fn(async (_path: string, _blob: Blob, _options: unknown) => ({ data: {}, error: null as unknown }))
  const remove = vi.fn(async (_paths: string[]) => ({ data: [], error: null as unknown }))
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example/court-photos/${path}` } }))
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables.get(table) ?? [], error: null }).then(resolve),
    }
    for (const method of ['select', 'eq', 'in', 'lt', 'gt', 'order']) query[method] = () => query
    return query
  })
  return { clubId, tables, rpc, upload, remove, getPublicUrl, from }
})

vi.mock('./supabase', () => ({
  isDemoMode: false,
  supabase: {
    rpc: live.rpc,
    from: live.from,
    storage: { from: () => ({ upload: live.upload, remove: live.remove, getPublicUrl: live.getPublicUrl }) },
  },
}))

// jsdom cannot draw images, so the shrinking step is replaced; its checks are tested separately.
vi.mock('./photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photos')>()),
  shrinkPhoto: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/webp' }), type: 'image/webp', ext: 'webp' })),
}))

const qr = new File(['raw'], 'qr.png', { type: 'image/png' })
const oldPath = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payment/eeeeeeee-eeee-4eee-8eee-000000000001.webp'

beforeEach(() => {
  vi.clearAllMocks()
  live.tables.clear()
  live.rpc.mockImplementation(async () => ({ data: null, error: null }))
  live.remove.mockImplementation(async () => ({ data: [], error: null }))
  setActiveClubId(live.clubId)
})

describe('club profile (live)', () => {
  it('sends tidied text, since the database trims spaces only', async () => {
    await api.updateClubProfile({
      ...emptyClubProfile(),
      website_url: 'https://rallypoint.ph\n',
      house_rules: '\n\t',
      amenities: ['parking', 'night_lights', 'parking'],
    })
    expect(live.rpc).toHaveBeenCalledWith('admin_update_club_profile', expect.objectContaining({
      p_website_url: 'https://rallypoint.ph',
      p_house_rules: null,
      p_amenities: ['night_lights', 'parking'],
    }))
  })

  it('trims add-on, coach and payment method names', async () => {
    live.rpc.mockImplementation(async () => ({ data: { id: 'x', price: 0, hourly_rate: null, qr_path: null, photo_path: null }, error: null }))
    await api.upsertClubAddon({ name: ' Paddle rental\t', description: null, price: 100, unit: 'per_hour', is_active: true })
    await api.upsertClubCoach({ full_name: ' Ana ', headline: null, bio: null, hourly_rate: null, contact_phone: null, contact_url: null, is_active: true })
    await api.upsertClubPaymentMethod({ label: 'GCash ', account_name: null, account_number: null, is_active: true })
    expect(live.rpc).toHaveBeenCalledWith('admin_upsert_club_addon', expect.objectContaining({ p_name: 'Paddle rental' }))
    expect(live.rpc).toHaveBeenCalledWith('admin_upsert_club_coach', expect.objectContaining({ p_full_name: 'Ana' }))
    expect(live.rpc).toHaveBeenCalledWith('admin_upsert_club_payment_method', expect.objectContaining({ p_label: 'GCash' }))
  })

  it('deletes the replaced QR code file', async () => {
    live.rpc.mockImplementation(async () => ({ data: oldPath, error: null }))
    await expect(api.setClubPaymentQr('method-1', qr)).resolves.toEqual({ fileLeftBehind: false })
    const [, args] = live.rpc.mock.calls[0]
    expect(args.p_path).toMatch(new RegExp(`^${live.clubId}/payment/[0-9a-f-]{36}\\.webp$`))
    expect(live.remove).toHaveBeenCalledWith([oldPath])
  })

  it('never deletes the picture now in use, even if the database hands it back', async () => {
    live.rpc.mockImplementation(async (_name, args) => ({ data: args.p_path, error: null }))
    await expect(api.setClubPaymentQr('method-1', qr)).resolves.toEqual({ fileLeftBehind: false })
    expect(live.remove).not.toHaveBeenCalled()
  })

  it('says so when an old picture file could not be deleted', async () => {
    live.rpc.mockImplementation(async () => ({ data: oldPath, error: null }))
    // Storage reports a failure in its result; it does not throw.
    live.remove.mockImplementation(async () => ({ data: [], error: { message: 'Object not found' } }))
    await expect(api.removeClubPhoto('photo-1')).resolves.toEqual({ fileLeftBehind: true })
    await expect(api.removeClubPaymentMethod('method-1')).resolves.toEqual({ fileLeftBehind: true })
    await expect(api.removeClubCoach('coach-1')).resolves.toEqual({ fileLeftBehind: true })
  })

  it('removes the new upload when the save is refused', async () => {
    live.rpc.mockImplementation(async () => ({ data: null, error: { message: 'payment method not found' } }))
    await expect(api.setClubPaymentQr('method-1', qr)).rejects.toMatchObject({ message: 'payment method not found' })
    const uploaded = live.upload.mock.calls[0][0]
    expect(live.remove).toHaveBeenCalledWith([uploaded])
  })
})

describe('court availability (live)', () => {
  const court = (id: string, venueId: string) => ({ id, club_id: live.clubId, venue_id: venueId, name: id, status: 'available', hourly_rate: 500 })

  it("follows each venue's hours, and offers nothing for a venue it cannot read", async () => {
    live.tables.set('courts', [court('court-a', 'venue-open'), court('court-b', 'venue-hidden')])
    live.tables.set('venues', [{ id: 'venue-open', open_hour: 6, close_hour: 22 }])
    live.tables.set('public_schedule', [])

    const days = await api.availability('2099-01-01')
    const byCourt = new Map(days.map((day) => [day.court.id, day.slots]))
    expect(byCourt.get('court-a')?.map((slot) => slot.startHour)).toEqual(Array.from({ length: 16 }, (_, i) => i + 6))
    expect(byCourt.get('court-b')).toEqual([])
  })
})
