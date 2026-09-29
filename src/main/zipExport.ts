import { once } from 'node:events'
import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { Zip, ZipPassThrough } from 'fflate'

export interface ZipItem {
  /** Absolute path on disk. */
  path: string
  /** Path inside the archive (forward slashes). */
  name: string
}

/**
 * Streams files into a ZIP at `out`. Screenshots are already compressed PNGs,
 * so entries are stored rather than deflated: fast and no size penalty.
 * Writes to a temp file first so a failure never leaves a half-written archive.
 */
export async function writeZip(
  items: ZipItem[],
  out: string
): Promise<{ files: number; bytes: number }> {
  const tmp = `${out}.part`
  const ws = createWriteStream(tmp)
  let failure: Error | null = null
  const zip = new Zip((err, chunk, final) => {
    if (err) failure = err
    else ws.write(chunk)
    if (final || err) ws.end()
  })

  try {
    for (const item of items) {
      const st = await stat(item.path)
      const entry = new ZipPassThrough(item.name)
      entry.mtime = st.mtime
      zip.add(entry)
      for await (const chunk of createReadStream(item.path)) {
        entry.push(chunk as Uint8Array)
        if (ws.writableNeedDrain) await once(ws, 'drain')
      }
      entry.push(new Uint8Array(0), true)
      if (failure) throw failure
    }
    zip.end()
    if (!ws.writableFinished) await once(ws, 'finish')
    if (failure) throw failure
    await rename(tmp, out)
    return { files: items.length, bytes: (await stat(out)).size }
  } catch (err) {
    ws.destroy()
    await rm(tmp, { force: true })
    throw err
  }
}

/** Unique archive names: keeps sub-folders and suffixes duplicates ("a.png" → "a (2).png"). */
export function zipNames(ids: string[]): string[] {
  const used = new Set<string>()
  return ids.map((id) => {
    let name = id
    const dot = id.lastIndexOf('.')
    for (let i = 2; used.has(name.toLowerCase()); i++)
      name = dot > 0 ? `${id.slice(0, dot)} (${i})${id.slice(dot)}` : `${id} (${i})`
    used.add(name.toLowerCase())
    return name
  })
}
