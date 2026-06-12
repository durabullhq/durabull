'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

/** Must match .v2-blueprint background-size */
const CELL = 24
/** Cursor influence radius in px */
const RADIUS = 110
/** Per-frame intensity decay (closer to 1 = longer trail) */
const DECAY = 0.94

interface CellState {
  intensity: number
  /** random phase so cells twinkle out of sync */
  phase: number
  /** rare cells flash brighter for sparkle variety */
  spark: number
}

/**
 * Interactive shimmer for the hero blueprint grid. As the pointer moves,
 * nearby grid cells glow ember-orange, twinkle, and fade out in a trail.
 * Renders nothing for touch devices and reduced-motion users.
 */
export function HeroGridShimmer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(pointer: fine)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = false
    let width = 0
    let height = 0
    let dpr = 1

    const cells = new Map<string, CellState>()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const energize = (x: number, y: number) => {
      const minCx = Math.floor((x - RADIUS) / CELL)
      const maxCx = Math.floor((x + RADIUS) / CELL)
      const minCy = Math.floor((y - RADIUS) / CELL)
      const maxCy = Math.floor((y + RADIUS) / CELL)

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const centerX = cx * CELL + CELL / 2
          const centerY = cy * CELL + CELL / 2
          const dist = Math.hypot(centerX - x, centerY - y)
          if (dist > RADIUS) continue

          // smooth falloff toward the edge of the influence radius
          const t = 1 - dist / RADIUS
          const strength = t * t * (3 - 2 * t)

          const key = `${cx},${cy}`
          const cell = cells.get(key)
          if (cell) {
            cell.intensity = Math.max(cell.intensity, strength)
          } else {
            cells.set(key, {
              intensity: strength,
              phase: Math.random() * Math.PI * 2,
              spark: Math.random() < 0.08 ? 1 : 0,
            })
          }
        }
      }
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      const time = now / 1000

      for (const [key, cell] of cells) {
        cell.intensity *= DECAY
        if (cell.intensity < 0.01) {
          cells.delete(key)
          continue
        }

        const [cx, cy] = key.split(',').map(Number)
        const px = cx * CELL
        const py = cy * CELL

        // twinkle: each cell breathes on its own phase
        const twinkle = 0.72 + 0.28 * Math.sin(time * 5.5 + cell.phase)
        const a = cell.intensity * twinkle

        // soft ember fill inside the cell
        ctx.fillStyle = `rgba(234, 88, 12, ${(a * 0.1).toFixed(3)})`
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)

        // re-trace the cell's grid lines in glowing accent
        ctx.strokeStyle = `rgba(234, 88, 12, ${(a * 0.5).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.strokeRect(px + 0.5, py + 0.5, CELL, CELL)

        // bright twinkling point at the cell's grid intersection
        const dotAlpha = a * (cell.spark ? 1 : 0.55)
        if (dotAlpha > 0.04) {
          const r = cell.spark ? 2.4 : 1.4
          const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 4)
          glow.addColorStop(0, `rgba(251, 146, 60, ${dotAlpha.toFixed(3)})`)
          glow.addColorStop(1, 'rgba(251, 146, 60, 0)')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(px, py, r * 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (cells.size > 0) {
        raf = requestAnimationFrame(draw)
      } else {
        running = false
      }
    }

    const ensureRunning = () => {
      if (!running) {
        running = true
        raf = requestAnimationFrame(draw)
      }
    }

    let lastX = -1
    let lastY = -1
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

      energize(x, y)
      // interpolate along fast mouse moves so the trail has no gaps
      if (lastX >= 0) {
        const dist = Math.hypot(x - lastX, y - lastY)
        const steps = Math.min(Math.floor(dist / (CELL / 2)), 12)
        for (let i = 1; i < steps; i++) {
          const f = i / steps
          energize(lastX + (x - lastX) * f, lastY + (y - lastY) * f)
        }
      }
      lastX = x
      lastY = y
      ensureRunning()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [reduceMotion])

  if (reduceMotion) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="v2-blueprint-fade pointer-events-none absolute inset-0 size-full"
    />
  )
}
