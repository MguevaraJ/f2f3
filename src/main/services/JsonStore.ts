import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Tiny persistent JSON document with debounced, atomic writes
 * (write to a temp file, then rename) so a crash never leaves a torn file.
 */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly file: string,
    defaults: T,
    private readonly delayMs = 400
  ) {
    this.data = defaults
    try {
      this.data = { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }
    } catch {
      /* first run or unreadable file: start from defaults */
    }
  }

  get value(): T {
    return this.data
  }

  update(mutator: (draft: T) => void): void {
    mutator(this.data)
    this.scheduleSave()
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data))
    renameSync(tmp, this.file)
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.delayMs)
  }
}
