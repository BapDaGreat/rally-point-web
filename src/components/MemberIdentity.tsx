import { useState } from 'react'
import { initialsOf } from '../lib/memberPass'

/**
 * A member's profile photo, or their initials when there is none or it fails to load.
 * Takes a ready link (api.ts turns stored member-photos paths into links).
 * Used on Account, the QR pass, membership requests and the desk's check-in result.
 */
export function MemberAvatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  // 'sm' is the header's account button.
  const box = size === 'lg' ? 'h-20 w-20 text-2xl rounded-2xl' : size === 'sm' ? 'h-10 w-10 text-body rounded-xl' : 'h-14 w-14 text-lg rounded-2xl'
  if (photoUrl && failedUrl !== photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`Photo of ${name}`}
        className={`${box} shrink-0 border-2 border-slate-200 bg-slate-100 object-cover`}
        onError={() => setFailedUrl(photoUrl)}
      />
    )
  }
  return (
    <div
      className={`${box} flex shrink-0 items-center justify-center bg-slate-100 font-extrabold text-slate-700`}
      role="img"
      aria-label={`No photo. Initials ${initialsOf(name)}`}
    >
      <span aria-hidden>{initialsOf(name)}</span>
    </div>
  )
}
