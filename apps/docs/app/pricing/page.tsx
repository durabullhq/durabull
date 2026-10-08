'use client'

import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Heart, Sparkles, Users } from 'lucide-react'
import { LandingLayout } from '@/components'
import { WEB_APP_URL } from '@/lib/config'

export default function PricingPage() {
  return (
    <LandingLayout>
      <div className="min-h-screen pt-32 pb-20">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px]" />

        <div className="container mx-auto px-6 relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300 mb-8">
              <Sparkles className="h-4 w-4" />
              Free During Beta
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Simple, honest
              <br />
              <span className="gradient-text">pricing</span>
            </h1>

            <p className="text-xl text-muted-foreground">
              The hosted app is currently free during beta. Check this page for published pricing
              updates.
            </p>
          </motion.div>

          {/* Pricing Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-lg mx-auto mb-20"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl blur-xl" />
              <div className="relative border border-emerald-500/30 bg-card/80 backdrop-blur-sm rounded-2xl p-8">
                <div className="text-center mb-8">
                  <div className="text-sm text-emerald-400 font-medium mb-2">Current Price</div>
                  <div className="text-5xl font-bold mb-2">
                    $0
                    <span className="text-xl text-muted-foreground font-normal">/month</span>
                  </div>
                  <div className="text-muted-foreground">Free while in beta</div>
                </div>

                <div className="space-y-4 mb-8">
                  {[
                    'Unlimited connections',
                    'Unlimited queues',
                    'Real-time monitoring',
                    'Job debugging & retry',
                    'Team collaboration',
                    'All features included',
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                <a href={`${WEB_APP_URL}/signup`} className="group block">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/30 rounded-lg blur-xl group-hover:bg-emerald-500/40 transition-colors" />
                    <div className="relative flex items-center justify-center gap-2 w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold rounded-lg transition-colors">
                      Get Started Free
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </motion.div>

          {/* Deployment choices */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-3xl mx-auto"
          >
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Deployment choices</h2>
              <p className="text-muted-foreground">
                Use the hosted app, desktop app, or your own infrastructure.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Heart,
                  title: 'Hosted App',
                  description: 'Connect Redis and inspect your queues in the hosted dashboard.',
                },
                {
                  icon: Users,
                  title: 'Desktop App',
                  description:
                    'Install Durabull on Apple Silicon macOS or Windows with a bundled local API.',
                },
                {
                  icon: Sparkles,
                  title: 'Self-Hosted',
                  description:
                    'Source is available under ELv2. Self-host with PostgreSQL or PGlite; both persist data.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-6 border border-border bg-card/50 rounded-xl text-center"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-400 mb-4">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-center mt-20 pt-12 border-t border-border"
          >
            <p className="text-muted-foreground mb-6">
              Questions about pricing or our model?{' '}
              <a href="mailto:hello@durabull.io" className="text-emerald-400 hover:underline">
                Reach out
              </a>{' '}
              — we're happy to chat.
            </p>
          </motion.div>
        </div>
      </div>
    </LandingLayout>
  )
}
