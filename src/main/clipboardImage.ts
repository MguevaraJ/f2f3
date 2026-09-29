import { readFile } from 'node:fs/promises'
import { clipboard, ClipboardItem, nativeImage } from 'electron'

/** Puts an image file on the system clipboard as PNG. */
export async function copyImageToClipboard(abs: string): Promise<void> {
  const png = /\.png$/i.test(abs) ? await readFile(abs) : nativeImage.createFromPath(abs).toPNG()
  if (!png.length) throw new Error('No se pudo leer la imagen')
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
  ])
}
