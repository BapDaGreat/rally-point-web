import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

describe('shared interaction feedback', () => {
  it('uses a subtle shared motion contract and touch-safe control sizing', () => {
    expect(css).toContain('--interaction-duration: 180ms;')
    expect(css).toContain('--interaction-easing:')
    expect(css).toContain('min-height: 48px;')
    expect(css).toContain('touch-action: manipulation;')
  })

  it('covers hover-capable pointers, pressed controls, focus, and unavailable states', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine)')
    expect(css).toContain(':active:not(:disabled)')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('outline: 3px solid var(--color-brand-700);')
    expect(css).toContain('[aria-disabled=')
    expect(css).toContain('[aria-busy=')
  })

  it('removes nonessential press movement for reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('transform: none !important;')
  })
})
