/**
 * A plain top-down pickleball court, shown as a sample picture when a club has no photos
 * and the stock photo cannot load. Always labelled, so nobody mistakes it for a photo.
 * The seed picks one of a few real-world court colours, so a list of courts is not identical.
 */

// A 20 ft x 44 ft court drawn sideways; 7 ft non-volley zone each side of the net.
const FT = 5.4545
const LEFT = 40
const RIGHT = 280
const TOP = 90 - 10 * FT
const BOTTOM = 90 + 10 * FT
const KITCHEN = 7 * FT

/** Surround, playing area and non-volley zone, in common real court colours. */
const COLOURWAYS = [
  { surround: '#3d6b4f', court: '#2f5fa3', kitchen: '#3a6fb6' },
  { surround: '#24456e', court: '#4f7d5c', kitchen: '#5b8c68' },
  { surround: '#4f7d5c', court: '#24456e', kitchen: '#2f5584' },
  { surround: '#2f5fa3', court: '#3d6b4f', kitchen: '#4a7a5c' },
] as const

function colourwayFor(seed = '') {
  let total = 0
  for (let i = 0; i < seed.length; i += 1) total = (total * 31 + seed.charCodeAt(i)) >>> 0
  return COLOURWAYS[total % COLOURWAYS.length]
}

export function CourtArt({
  seed,
  muted = false,
  label = 'Sample',
  className = '',
}: {
  /** A court or club id: the same seed always gets the same court colours. */
  seed?: string
  /** Greys the court out, for courts that are out of service. */
  muted?: boolean
  /** Small label text; pass null to hide it. */
  label?: string | null
  className?: string
}) {
  const colours = colourwayFor(seed)
  return (
    <div className={`relative overflow-hidden ${muted ? 'grayscale opacity-70' : ''} ${className}`}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden focusable="false">
        <rect width="320" height="180" fill={colours.surround} />
        <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} fill={colours.court} />
        <rect x={160 - KITCHEN} y={TOP} width={KITCHEN * 2} height={BOTTOM - TOP} fill={colours.kitchen} />
        <g className="court-lines" stroke="#ffffff" strokeWidth="2" fill="none">
          <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} pathLength="1" />
          <line x1={160 - KITCHEN} y1={TOP} x2={160 - KITCHEN} y2={BOTTOM} pathLength="1" />
          <line x1={160 + KITCHEN} y1={TOP} x2={160 + KITCHEN} y2={BOTTOM} pathLength="1" />
          <line x1={LEFT} y1={90} x2={160 - KITCHEN} y2={90} pathLength="1" />
          <line x1={160 + KITCHEN} y1={90} x2={RIGHT} y2={90} pathLength="1" />
        </g>
        <line x1="160" y1={TOP - 6} x2="160" y2={BOTTOM + 6} stroke="#0b2a5b" strokeWidth="3" />
      </svg>
      {label ? (
        <span className="photo-label">{label}</span>
      ) : null}
    </div>
  )
}
