import Hero from './animated-shader-hero'

/** Demo / docs usage matching 21st.dev ravikatiyar162 Animated Shader Hero */
export default function HeroDemo() {
  return (
    <div className="w-full">
      <Hero
        trustBadge={{
          text: 'Trusted by forward-thinking teams.',
          icons: ['✨'],
        }}
        headline={{
          line1: 'Launch Your',
          line2: 'Workflow Into Orbit',
        }}
        subtitle="Supercharge productivity with AI-powered automation and integrations built for the next generation of teams — fast, seamless, and limitless."
        buttons={{
          primary: {
            text: 'Get Started for Free',
            onClick: () => console.log('Get Started clicked!'),
          },
          secondary: {
            text: 'Explore Features',
            onClick: () => console.log('Explore Features clicked!'),
          },
        }}
      />
    </div>
  )
}
