import { beforeEach, describe, expect, it } from 'vitest'
import type { ClubCoach } from '../../types'
import { setActiveClubId } from '../clubContext'
import { demoStore } from '../demoStore'
import { DEMO_CLUB_ID } from '../tenant'

const memberLogin = ['member@brinely.info', 'member123'] as const
const coachLogin = ['admin@brinely.info', 'admin123'] as const
const secondPlayerLogin = ['second.player@example.com', 'second123'] as const
const start = new Date(Date.now() + 2 * 86400000)
start.setMinutes(0, 0, 0)
const startsAt = start.toISOString()
const endsAt = new Date(start.getTime() + 3600000).toISOString()
const COACH_ID = 'coach-rent-a-coach'

function signIn([email, password]: readonly [string, string]) {
  demoStore.logout()
  demoStore.login(email, password)
}

function addSecondPlayer() {
  demoStore.registerMember({
    email: 'second.player@example.com',
    password: 'second123',
    full_name: 'Second Player',
  })
}

function addCoach() {
  const db = demoStore.get()
  const coach: ClubCoach = {
    id: COACH_ID,
    club_id: DEMO_CLUB_ID,
    account_user_id: 'user_admin',
    full_name: 'Coach Ana',
    headline: 'Beginner lessons',
    bio: null,
    hourly_rate: 600,
    booking_policy: null,
    contact_phone: null,
    contact_url: null,
    photo_path: null,
    photo_url: null,
    is_active: true,
    position: 0,
    created_at: new Date().toISOString(),
  }
  db.clubCoaches = [coach]
  demoStore.set(db)
}

function slot() {
  signIn(coachLogin)
  return demoStore.coachUpsertBookingSlot({
    coach_id: COACH_ID,
    starts_at: startsAt,
    ends_at: endsAt,
    lesson_type: 'group',
    pricing_model: 'per_student',
    rate: 600,
    max_students: 4,
  })
}

beforeEach(() => {
  localStorage.clear()
  setActiveClubId(DEMO_CLUB_ID)
  demoStore.reset()
  addCoach()
  addSecondPlayer()
})

describe('rent-a-coach demo', () => {
  it('holds a group time while the coach decides, then enforces remaining seats', () => {
    const coachSlot = slot()

    signIn(memberLogin)
    const pending = demoStore.memberRequestCoachSlot({
      slot: coachSlot,
      student_count: 3,
      message: 'Three players, please.',
    })
    expect(demoStore.memberListCoachSlots(startsAt, endsAt)).toEqual([])

    signIn(coachLogin)
    expect(() => demoStore.memberRequestCoachSlot({
      slot: coachSlot,
      student_count: 1,
      message: '',
    })).toThrow('Join this club as a player')

    expect(() => demoStore.coachSetBookingSlotOpen(coachSlot.slot_id, false))
      .toThrow('A slot with active requests cannot be closed')
    demoStore.coachRespondToBookingRequest(pending.request_id, true)
    expect(demoStore.coachListMyRequests()[0]).toMatchObject({ status: 'accepted', quoted_amount: 1800 })

    signIn(secondPlayerLogin)
    const available = demoStore.memberListCoachSlots(startsAt, endsAt)
    expect(available[0]).toMatchObject({ remaining_students: 1 })
    expect(() => demoStore.memberRequestCoachSlot({
      slot: available[0],
      student_count: 2,
      message: '',
    })).toThrow('Not enough places remain for this group')
    const secondRequest = demoStore.memberRequestCoachSlot({
      slot: available[0],
      student_count: 1,
      message: '',
    })
    expect(secondRequest.quoted_amount).toBe(600)
  })

  it('keeps the request conversation private to the player and linked coach', () => {
    const coachSlot = slot()
    signIn(memberLogin)
    const request = demoStore.memberRequestCoachSlot({
      slot: coachSlot,
      student_count: 1,
      message: '',
    })
    const message = demoStore.coachSendRequestMessage(request.request_id, 'Can we play at the north court?')
    expect(demoStore.coachListRequestMessages(request.request_id)).toEqual([message])

    signIn(secondPlayerLogin)
    expect(() => demoStore.coachListRequestMessages(request.request_id))
      .toThrow('Coaching request not found')
  })
})
