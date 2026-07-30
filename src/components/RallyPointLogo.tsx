/** Exact Figma rpg_logo assets from UI/UX file */
type LogoProps = {
  variant?: 'color' | 'mark'
  className?: string
  title?: string
}

const BASE = import.meta.env.BASE_URL || '/'

export function RallyPointLogo({ variant = 'color', className = '', title = 'Rally Point' }: LogoProps) {
  const src = variant === 'mark' ? `${BASE}logo-mark.png` : `${BASE}logo.png`

  return (
    <img
      src={src}
      alt={title}
      className={className}
      draggable={false}
      decoding="async"
    />
  )
}
