import type { ComponentProps } from 'react'
export default function Image({
  src,
  alt,
  fill,
  priority: _priority,
  quality: _quality,
  ...props
}: Omit<ComponentProps<'img'>, 'src'> & {
  src: string | { src: string }
  fill?: boolean
  priority?: boolean
  quality?: number
}) {
  const original = typeof src === 'string' ? src : src.src
  const imageSource = original.startsWith('https://www.google.com/s2/favicons')
    ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#13795b"/><text x="16" y="22" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18">${alt?.charAt(0).replace(/[<>&"]/g, '')}</text></svg>`)}`
    : original
  return (
    <img
      src={imageSource}
      alt={alt}
      {...props}
      style={{
        ...(fill
          ? ({
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            } as const)
          : {}),
        ...props.style,
      }}
    />
  )
}
