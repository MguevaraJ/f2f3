import type { RgbaImage } from '../ocr/debugOverlayOcr'

/**
 * Area-averaging downscale (box filter). Good quality for large reductions and
 * fast enough for thumbnails without native dependencies.
 */
export function downscale(src: RgbaImage, maxWidth: number): RgbaImage {
  if (src.width <= maxWidth) return src
  const scale = src.width / maxWidth
  const w = maxWidth
  const h = Math.max(1, Math.round(src.height / scale))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * scale)
    const sy1 = Math.min(src.height, Math.floor((y + 1) * scale))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * scale)
      const sx1 = Math.min(src.width, Math.floor((x + 1) * scale))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        let i = (sy * src.width + sx0) * 4
        for (let sx = sx0; sx < sx1; sx++, i += 4) {
          r += src.data[i]
          g += src.data[i + 1]
          b += src.data[i + 2]
          n++
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = 255
    }
  }
  return { width: w, height: h, data: out }
}
