import { useEffect, useMemo, useState } from 'react'
import { AppHeader, AppShell, LoadingBlock, SignOutButton } from '../components/Shell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Member } from '../types'
import { qrPayload } from '../types'

function qrImageUrl(data: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
}

export function MemberPass() {
  const { user } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      try {
        const m = await api.memberForUser(user.id)
        if (!m) {
          setMember(null)
          return
        }
        const withQr = await api.ensureMemberQr(m.id)
        setMember(withQr)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  const payload = useMemo(() => {
    if (!member?.qr_token) return ''
    return qrPayload(member.member_code, member.qr_token)
  }, [member])

  return (
    <AppShell role="member">
      <AppHeader title="Check-in pass" subtitle="Show this at the desk" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-4 space-y-4">
        {loading ? (
          <LoadingBlock />
        ) : !member ? (
          <section className="card p-4 text-sm text-slate-500">
            No membership linked. Ask staff to connect your account.
          </section>
        ) : (
          <section className="card p-6 flex flex-col items-center text-center space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Member QR</p>
            <p className="font-extrabold text-xl">{member.full_name}</p>
            <p className="font-mono text-sm text-brand-800">{member.member_code}</p>
            {payload ? (
              <img
                src={qrImageUrl(payload)}
                alt="Check-in QR code"
                width={220}
                height={220}
                className="rounded-2xl border border-slate-100 bg-white p-2"
              />
            ) : null}
            <p className="text-[11px] text-slate-400 font-mono break-all max-w-xs">{payload}</p>
            <p className="text-xs text-slate-500">Staff can scan this or type your member code.</p>
          </section>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </main>
    </AppShell>
  )
}
