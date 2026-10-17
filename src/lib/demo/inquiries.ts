import type { InquiryCategory, InquiryStatus, SupportInquiry } from '../../types'
import { activeClubId, clubRoleFor } from './access'
import { todayISO, uid } from './common'
import type { DemoDB } from './model'
import { load, save } from './persistence'

/** The signed-in person and their role in the active club (never profiles.role). */
function currentActor(db: DemoDB) {
  const profile = db.profiles.find((row) => row.id === db.sessionUserId)
  const clubId = activeClubId(db)
  return { profile, clubId, role: profile ? clubRoleFor(db, profile.id, clubId) : null }
}

export const inquiryOperations = {
  createInquiry(input: {
    user_id: string
    category: InquiryCategory
    subject: string
    message: string
  }): SupportInquiry {
    const db = load()
    const { profile, clubId, role } = currentActor(db)
    if (!profile || profile.id !== input.user_id || (role !== 'staff' && role !== 'admin')) {
      throw new Error('Only staff and admins can submit inquiries for their own account')
    }
    const subject = input.subject.trim()
    const message = input.message.trim()
    if (!['booking', 'membership', 'payment', 'technical', 'other'].includes(input.category)
      || subject.length < 1 || subject.length > 120 || message.length < 1 || message.length > 2000) {
      throw new Error('Invalid inquiry details')
    }
    const inquiry: SupportInquiry = {
      id: uid('inq'),
      club_id: clubId,
      user_id: profile.id,
      category: input.category,
      subject,
      message,
      status: 'open',
      created_at: todayISO(),
    }
    db.inquiries.unshift(inquiry)
    save(db)
    return inquiry
  },
  inquiriesForUser(userId: string): SupportInquiry[] {
    const db = load()
    const { profile, clubId, role } = currentActor(db)
    if (!profile || role !== 'staff' || profile.id !== userId) {
      throw new Error('Staff can only view their own inquiries')
    }
    return db.inquiries
      .filter((inquiry) => inquiry.club_id === clubId && inquiry.user_id === userId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((inquiry) => ({ ...inquiry, sender: db.profiles.find((row) => row.id === inquiry.user_id) }))
  },
  allInquiries(): SupportInquiry[] {
    const db = load()
    const { profile, clubId, role } = currentActor(db)
    if (!profile || role !== 'admin') throw new Error('Only admins can view all inquiries')
    return db.inquiries
      .filter((inquiry) => inquiry.club_id === clubId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((inquiry) => ({ ...inquiry, sender: db.profiles.find((row) => row.id === inquiry.user_id) }))
  },
  respondToInquiry(input: { id: string; status: InquiryStatus; response?: string }): SupportInquiry {
    const db = load()
    const { profile, clubId, role } = currentActor(db)
    if (!profile || role !== 'admin') throw new Error('Only admins can update inquiries')
    if (!['open', 'in_progress', 'resolved'].includes(input.status)) throw new Error('Invalid inquiry status')
    const inquiry = db.inquiries.find((row) => row.id === input.id && row.club_id === clubId)
    if (!inquiry) throw new Error('Inquiry not found')
    const response = input.response?.trim()
    if (response && inquiry.responded_at) throw new Error('This inquiry already has an Admin response')
    if (response && response.length > 2000) throw new Error('Response must be 2000 characters or fewer')
    if (inquiry.status === input.status && !response) return inquiry

    inquiry.status = input.status
    if (response) {
      inquiry.response = response
      inquiry.responded_by = profile.id
      inquiry.responded_at = todayISO()
    }
    const statusLabel = input.status.replace('_', ' ')
    const replyNote = response ? ` Admin reply: ${response}` : ''
    db.notifications.unshift({
      id: uid('notif'),
      club_id: inquiry.club_id,
      venue_id: null,
      user_id: inquiry.user_id,
      title: 'Inquiry update',
      body: `Your inquiry "${inquiry.subject}" is now ${statusLabel}.${replyNote}`,
      read: false,
      created_at: todayISO(),
    })
    save(db)
    return inquiry
  },
}
