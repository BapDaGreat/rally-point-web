import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import { privacyNoticePath } from '../lib/privacyNotice'

export const PRIVACY_ACK_ERROR = 'Tick the box to confirm you have read the Privacy Notice.'

export type PrivacyAcknowledgementProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  clubSlug?: string
  label?: string
  inputRef?: Ref<HTMLInputElement>
  describedBy?: string
}

/**
 * Shared Privacy Notice acknowledgement checkbox, inline 5-point summary, and
 * new-tab link so form fields stay intact across sign-up, owner requests, and club joins.
 */
export function PrivacyAcknowledgement({
  checked,
  onChange,
  clubSlug,
  label = 'I have read and understood the Privacy Notice.',
  inputRef,
  describedBy,
}: PrivacyAcknowledgementProps) {
  return (
    <div className="space-y-2">
      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[10px] border border-line px-3 py-2.5 text-subtitle text-ink has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
        <input
          ref={inputRef}
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={checked}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>

      <details className="rounded-[10px] border border-line bg-white px-3 py-1">
        <summary className="flex min-h-12 cursor-pointer items-center text-body font-semibold text-ink">
          Quick summary (5 key points)
        </summary>
        <ul className="mb-2.5 list-disc space-y-1 pl-5 text-body text-muted">
          <li>
            <strong className="text-ink">What we collect:</strong> Account details, memberships,
            bookings, check-ins, coaching messages, and club-listing requests.
          </li>
          <li>
            <strong className="text-ink">Direct-to-club payments:</strong> Court payments go
            straight to the club (such as via GCash QR); bRineLy records the reference number only.
          </li>
          <li>
            <strong className="text-ink">Player privacy:</strong> Other players cannot see your
            bookings or charges, and public TV boards never show player names.
          </li>
          <li>
            <strong className="text-ink">Essential storage only:</strong> Used to keep you signed
            in and hold your booking selection—no advertising cookies or trackers.
          </li>
          <li>
            <strong className="text-ink">Your RA 10173 rights:</strong> You may request access,
            correction, objection, erasure, or portability of your personal information.
          </li>
        </ul>
      </details>

      <p className="text-body text-muted">
        Read the full{' '}
        {/* A new tab keeps the details already typed into the form. */}
        <Link
          className="text-link inline-flex min-h-12 items-center"
          to={privacyNoticePath(clubSlug)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Notice
        </Link>{' '}
        (opens in a new tab).
      </p>
    </div>
  )
}
