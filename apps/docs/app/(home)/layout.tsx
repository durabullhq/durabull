import '@/styles/v2.css'

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <div className="v2 relative min-h-screen overflow-x-clip font-sans">{children}</div>
}
