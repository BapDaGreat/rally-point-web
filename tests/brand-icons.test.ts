import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('brand icon files', () => {
  const svgs = ['logo-mark.svg', 'logo-wordmark.svg', 'favicon.svg']

  it.each(svgs)('%s is flat vector art in the brand colours', (file) => {
    const svg = readFileSync(`public/${file}`, 'utf8')
    expect(svg).toMatch(/^<svg [^>]*viewBox=/)
    expect(svg).not.toMatch(/Gradient|<image/i)
    expect(svg).toContain('#0B2A5B')
  })

  it('points the page head and app manifest at icons that exist', () => {
    const html = readFileSync('index.html', 'utf8')
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      icons: { src: string; purpose?: string }[]
    }
    const headFiles = [...html.matchAll(/href="\/([^"]+\.(?:svg|png))"/g)].map((match) => match[1])
    expect(headFiles).toEqual(expect.arrayContaining(['favicon.svg', 'favicon.png', 'apple-touch-icon.png']))
    for (const file of [...headFiles, ...manifest.icons.map((icon) => icon.src), 'og-image.png']) {
      expect(existsSync(`public/${file}`), file).toBe(true)
    }
    expect(manifest.icons.map((icon) => icon.purpose)).toEqual(['any', 'any', 'maskable'])
    expect(html).toContain('<meta property="og:image" content="https://brinely.info/og-image.png" />')
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta property="og:site_name" content="bRineLy" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })
})
