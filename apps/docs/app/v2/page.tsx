import { V2FinalCta, V2Footer } from '@/components/v2/closing'
import { V2Deploy, V2Pricing } from '@/components/v2/deploy'
import { V2Faq } from '@/components/v2/faq'
import { V2GettingStarted, V2Problem, V2ValueGrid } from '@/components/v2/features'
import { V2Hero } from '@/components/v2/hero'
import { V2LogoMarquee } from '@/components/v2/logo-marquee'
import { V2Nav } from '@/components/v2/nav'
import { V2Showcase } from '@/components/v2/showcase'

export default function LandingV2Page() {
  return (
    <>
      <V2Nav />
      <main>
        <V2Hero />
        <V2LogoMarquee />
        <V2ValueGrid />
        <V2Showcase />
        <V2Problem />
        <V2Deploy />
        <V2GettingStarted />
        <V2Pricing />
        <V2Faq />
        <V2FinalCta />
      </main>
      <V2Footer />
    </>
  )
}
