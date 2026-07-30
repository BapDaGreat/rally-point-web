/** Rally Point brand mark from Figma UI/UX (rpg_logo) — paddle + wordmark */
type LogoProps = {
  variant?: 'color' | 'white' | 'mark'
  className?: string
  title?: string
}

const BASE = import.meta.env.BASE_URL || '/'

export function RallyPointLogo({ variant = 'color', className = '', title = 'Rally Point' }: LogoProps) {
  const src =
    variant === 'white'
      ? `${BASE}logo-white.svg`
      : variant === 'mark'
        ? `${BASE}favicon.svg`
        : `${BASE}logo.svg`

  return (
    <img
      src={src}
      alt={title}
      className={className}
      draggable={false}
    />
  )
}
