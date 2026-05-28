import { Home2CodeBand } from '@/components/home-2/home-2-code-band'
import { Home2Console } from '@/components/home-2/home-2-console'
import { Home2Cta } from '@/components/home-2/home-2-cta'
import { Home2Deploy } from '@/components/home-2/home-2-deploy'
import { Home2Faq } from '@/components/home-2/home-2-faq'
import { Home2Flow } from '@/components/home-2/home-2-flow'
import { Home2Footer } from '@/components/home-2/home-2-footer'
import { Home2Hero } from '@/components/home-2/home-2-hero'
import { Home2Nav } from '@/components/home-2/home-2-nav'
import { Home2Pillars } from '@/components/home-2/home-2-pillars'
import { Home2Pricing } from '@/components/home-2/home-2-pricing'
import { Home2Trust } from '@/components/home-2/home-2-trust'

export function Home2Page() {
  return (
    <>
      <Home2Nav />
      <main>
        <Home2Hero />
        <Home2Trust />
        <Home2Console />
        <Home2Pillars />
        <Home2Flow />
        <Home2CodeBand />
        <Home2Deploy />
        <Home2Pricing />
        <Home2Faq />
        <Home2Cta />
      </main>
      <Home2Footer />
    </>
  )
}
