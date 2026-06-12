import { Maximize, Minimize } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

function isFullscreenSupported() {
  return typeof document !== 'undefined' && document.fullscreenEnabled
}

/**
 * Toggles true browser fullscreen for the whole application
 * using the Fullscreen API. Renders nothing when unsupported.
 */
export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && document.fullscreenElement !== null
  )

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement !== null)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  if (!isFullscreenSupported()) {
    return null
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Request can be rejected (e.g. permissions); state stays in sync via fullscreenchange
    }
  }

  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleFullscreen}
      aria-label={label}
      title={label}
    >
      {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </Button>
  )
}
