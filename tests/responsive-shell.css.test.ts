import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/index.css', 'utf8')

function ruleFor(selector: string, fromIndex = 0) {
  const selectorIndex = styles.indexOf(selector, fromIndex)
  expect(selectorIndex).toBeGreaterThanOrEqual(0)

  const openBrace = styles.indexOf('{', selectorIndex)
  const closeBrace = styles.indexOf('}', openBrace)
  return styles.slice(openBrace + 1, closeBrace)
}

describe('responsive app shell CSS contract', () => {
  it('keeps the phone shell capped and the mobile navigation fixed', () => {
    const railSelector = '.app-shell-desktop > .safe-bottom'
    const rootViewport = ruleFor('html,')
    const mobileShell = ruleFor('.app-shell')
    const safeBottom = ruleFor(
      '.safe-bottom',
      styles.indexOf(railSelector) + railSelector.length,
    )
    const bottomNav = ruleFor('.bottom-nav')

    expect(rootViewport).toContain('overflow-x: clip;')
    expect(mobileShell).toContain('width: 100%;')
    expect(mobileShell).toContain('max-width: 430px;')
    expect(mobileShell).toContain('margin: 0 auto;')
    expect(mobileShell).toContain('overflow-x: clip;')
    expect(bottomNav).toContain('position: fixed;')
    expect(bottomNav).toContain('max-width: 430px;')
    expect(safeBottom).toContain('env(safe-area-inset-bottom, 0px)')
  })

  it('uses a full-width desktop canvas with a centered content rail', () => {
    const desktopBreakpoint = styles.indexOf('@media (min-width: 768px)')
    const desktopShell = ruleFor(
      '.app-shell:not(.app-shell-bleed)',
      desktopBreakpoint,
    )
    const desktopCanvas = ruleFor('.app-shell-desktop', desktopBreakpoint)
    const desktopRail = ruleFor('.app-content-rail,', desktopBreakpoint)
    const baseSideNav = styles.indexOf('.side-nav')
    const sideNavBreakpoint = styles.indexOf(
      '@media (min-width: 768px)',
      baseSideNav,
    )
    const desktopSideNav = ruleFor('.side-nav', sideNavBreakpoint)

    expect(styles).toContain('--app-content-max: 1100px;')
    expect(desktopShell).toContain('width: 100%;')
    expect(desktopShell).toContain('max-width: none;')
    expect(desktopShell).toContain('min-height: 100dvh;')
    expect(desktopShell).toContain('margin: 0;')
    expect(styles).toContain('.app-content-rail,')
    expect(styles).toContain('.app-shell-desktop > .safe-bottom')
    expect(desktopCanvas).toContain('background: var(--color-canvas);')
    expect(desktopRail).toContain('max-width: var(--app-content-max);')
    expect(desktopRail).toContain('margin-inline: auto;')
    expect(desktopRail).toContain('padding-inline: var(--app-desktop-gutter);')
    expect(desktopSideNav).toContain('top: 0;')
    expect(desktopSideNav).toContain('height: 100dvh;')
  })
})
