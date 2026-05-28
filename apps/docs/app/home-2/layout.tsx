import { JetBrains_Mono } from 'next/font/google'
import '@/styles/home-2.css'

const home2Mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--home-2-mono',
  display: 'swap',
})

export default function Home2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`home-2 isolate min-h-screen bg-white text-[#0a0b0d] ${home2Mono.variable}`}
      style={{
        colorScheme: 'light',
        fontFamily:
          '"Berthold Akzidenz Grotesk Extended", -apple-system, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
