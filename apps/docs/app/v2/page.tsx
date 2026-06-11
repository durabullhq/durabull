'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Legacy route — the v2 experiment is now the primary landing page at `/`. */
export default function V2RedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return null
}
