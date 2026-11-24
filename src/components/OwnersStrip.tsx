import { useId } from 'react'
import { Link } from 'react-router-dom'

/** A quiet pointer for court owners, at the end of player-facing pages. */
export function OwnersStrip() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 max-w-xl">
        <h2 id={headingId} className="text-title font-semibold text-ink">Run a pickleball club?</h2>
        <p className="mt-1 text-subtitle text-muted">List your courts, take bookings online and get paid to your own GCash.</p>
      </div>
      <Link to="/owners" className="btn-secondary w-auto px-5">
        List your club
      </Link>
    </section>
  )
}
