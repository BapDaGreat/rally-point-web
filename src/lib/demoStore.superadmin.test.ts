import { beforeEach, describe, expect, it } from 'vitest'
import { demoStore } from './demoStore'

describe('demoStore multi-tenant SaaS & superadmin commission engine', () => {
  beforeEach(() => {
    localStorage.clear()
    demoStore.reset()
  })

  it('authenticates the superadmin and initializes seeded branches', () => {
    const superadmin = demoStore.login('superadmin@rallypoint.local', 'superadmin123')
    expect(superadmin).toMatchObject({
      email: 'superadmin@rallypoint.local',
      role: 'superadmin',
      full_name: 'Morgan Superadmin',
    })

    const branches = demoStore.listBranches()
    expect(branches).toHaveLength(2)
    expect(branches.map((b) => b.slug)).toEqual(
      expect.arrayContaining(['gensan', 'davao']),
    )
  })

  it('provisions a new branch and updates branch status', () => {
    demoStore.login('superadmin@rallypoint.local', 'superadmin123')

    const newBranch = demoStore.createBranch({
      name: 'Cebu IT Park Hub',
      slug: 'cebu-it-park',
      city: 'Cebu City',
      address: 'Skyrise 4, Cebu IT Park, Apas, Cebu City',
      commission_rate: 7.5,
      commission_type: 'percentage',
      status: 'active',
      email: 'support.cebu@rallypoint.ph',
      phone: '0917-555-6666',
    })

    expect(newBranch).toMatchObject({
      slug: 'cebu-it-park',
      city: 'Cebu City',
      commission_rate: 7.5,
      status: 'active',
    })

    const updated = demoStore.updateBranchStatus(newBranch.id, 'suspended')
    expect(updated.status).toBe('suspended')

    const reActivated = demoStore.updateBranchStatus(newBranch.id, 'active')
    expect(reActivated.status).toBe('active')
  })

  it('rejects duplicate branch slugs and unauthorized provisioning', () => {
    demoStore.login('admin@rallypoint.local', 'admin123')
    expect(() =>
      demoStore.createBranch({
        name: 'Unauthorized Branch',
        slug: 'unauthorized',
        city: 'Tagum',
        address: 'Tagum City',
        commission_rate: 5,
        commission_type: 'percentage',
        status: 'active',
        email: 'unauth@test.local',
        phone: '09000000000',
      }),
    ).toThrow('Only superadmins can manage branches')

    demoStore.login('superadmin@rallypoint.local', 'superadmin123')
    expect(() =>
      demoStore.createBranch({
        name: 'Duplicate Slug Branch',
        slug: 'gensan',
        city: 'Gensan',
        address: 'Address',
        commission_rate: 5,
        commission_type: 'percentage',
        status: 'active',
        email: 'dup@test.local',
        phone: '09000000000',
      }),
    ).toThrow('Branch slug already exists')
  })

  it('automatically calculates and logs commission when a booking payment is confirmed', () => {
    demoStore.login('superadmin@rallypoint.local', 'superadmin123')
    const initialStats = demoStore.superadminStats()
    const initialCommissions = demoStore.listCommissions().length

    // Login as member to create and pay for a booking
    const member = demoStore.login('member@rallypoint.local', 'member123')
    const court = demoStore.get().courts[0]
    const tomorrow = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10)
    const booking = demoStore.createBooking({
      court_id: court.id,
      member_id: member.id,
      dateYmd: tomorrow,
      startHour: 10,
      hours: 1,
      user_id: member.id,
    })

    demoStore.confirmBookingPayment({
      booking_id: booking.id,
      method: 'gcash',
      user_id: member.id,
    })

    // Switch back to superadmin to verify commission ledger
    demoStore.login('superadmin@rallypoint.local', 'superadmin123')
    const updatedCommissions = demoStore.listCommissions()
    expect(updatedCommissions.length).toBeGreaterThan(initialCommissions)

    const latestCommission = updatedCommissions[0]
    expect(latestCommission).toMatchObject({
      booking_id: booking.id,
      gross_amount: booking.amount,
      status: 'settled',
    })
    // Commission = amount * 5%
    const expectedCommission = (booking.amount * 5) / 100
    expect(latestCommission.commission_amount).toBeCloseTo(expectedCommission, 2)
    expect(latestCommission.branch_net_amount).toBeCloseTo(
      booking.amount - expectedCommission,
      2,
    )

    const newStats = demoStore.superadminStats()
    expect(newStats.totalCommissionsEarned).toBeGreaterThanOrEqual(
      initialStats.totalCommissionsEarned,
    )
  })
})
