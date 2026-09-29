import { useEffect, useRef, useState } from 'react'
import type { FontGlyphs } from '@shared/ipc'
import { api } from '../lib/api'

/**
 * Text drawn with Minecraft's real bitmap font (loaded from the game jar by the
 * main process). Falls back to a regular font if no jar is available.
 */

let glyphsPromise: Promise<FontGlyphs | null> | null = null
const loadGlyphs = (): Promise<FontGlyphs | null> =>
  (glyphsPromise ??= api.system.fontGlyphs().catch(() => null))

export function useFontGlyphs(): FontGlyphs | null | undefined {
  const [glyphs, setGlyphs] = useState<FontGlyphs | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void loadGlyphs().then((g) => alive && setGlyphs(g))
    return () => {
      alive = false
    }
  }, [])
  return glyphs
}

export function measure(glyphs: FontGlyphs, text: string): number {
  let w = 0
  for (const ch of text)
    w +=
      ch === ' ' ? glyphs.space : ((glyphs.glyphs[ch] ?? glyphs.glyphs['?'])?.[0] ?? glyphs.space)
  return w
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (s: number): number => Math.floor(((n >> s) & 255) * factor)
  return `rgb(${c(16)},${c(8)},${c(0)})`
}

interface McTextProps {
  text: string
  scale?: number
  color?: string
  shadow?: boolean
  className?: string
  title?: string
}

export function McText({
  text,
  scale = 2,
  color = '#ffffff',
  shadow = true,
  className,
  title
}: McTextProps) {
  const glyphs = useFontGlyphs()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !glyphs) return
    const width = measure(glyphs, text) + (shadow ? 1 : 0)
    const height = 9 + (shadow ? 1 : 0)
    const dpr = window.devicePixelRatio || 1
    const px = Math.max(1, Math.round(scale * dpr))
    canvas.width = width * px
    canvas.height = height * px
    canvas.style.width = `${(width * px) / dpr}px`
    canvas.style.height = `${(height * px) / dpr}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const draw = (fill: string, ox: number, oy: number): void => {
      ctx.fillStyle = fill
      let x = 0
      for (const ch of text) {
        if (ch === ' ') {
          x += glyphs.space
          continue
        }
        const g = glyphs.glyphs[ch] ?? glyphs.glyphs['?']
        if (!g) continue
        const [advance, ...cols] = g
        cols.forEach((mask, cx) => {
          for (let row = 0; row < 9; row++)
            if (mask & (1 << (row + glyphs.rowOffset)))
              ctx.fillRect((x + cx + ox) * px, (row + oy) * px, px, px)
        })
        x += advance
      }
    }
    if (shadow) draw(shade(color, 0.25), 1, 1)
    draw(color, 0, 0)
  }, [glyphs, text, scale, color, shadow])

  if (glyphs === null)
    return (
      <span
        className={`mc-text-fallback ${className ?? ''}`}
        style={{ color, fontSize: scale * 8 }}
        title={title}
      >
        {text}
      </span>
    )
  return (
    <canvas
      ref={ref}
      className={`mc-text ${className ?? ''}`}
      role="img"
      aria-label={text}
      title={title}
    />
  )
}
