import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { writeZip, zipNames } from '../src/main/zipExport'

describe('ZIP export', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'craftshot-zip-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('streams files byte-for-byte, keeping sub-folders', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 7) // larger than one read chunk
    writeFileSync(join(dir, 'a.png'), big)
    writeFileSync(join(dir, 'b.png'), 'hola')
    const out = join(dir, 'out.zip')
    const res = await writeZip(
      [
        { path: join(dir, 'a.png'), name: 'a.png' },
        { path: join(dir, 'b.png'), name: 'Bases/b.png' }
      ],
      out
    )
    expect(res.files).toBe(2)
    const entries = unzipSync(readFileSync(out))
    expect(Object.keys(entries).sort()).toEqual(['Bases/b.png', 'a.png'])
    expect(Buffer.from(entries['a.png']).equals(big)).toBe(true)
    expect(Buffer.from(entries['Bases/b.png']).toString()).toBe('hola')
    expect(existsSync(`${out}.part`)).toBe(false)
  })

  it('leaves no partial archive when a file is missing', async () => {
    const out = join(dir, 'out.zip')
    await expect(
      writeZip([{ path: join(dir, 'nope.png'), name: 'nope.png' }], out)
    ).rejects.toThrow()
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.part`)).toBe(false)
  })

  it('makes archive names unique', () => {
    expect(zipNames(['a.png', 'A.png', 'x/a.png', 'a.png'])).toEqual([
      'a.png',
      'A (2).png',
      'x/a.png',
      'a (3).png'
    ])
  })
})
