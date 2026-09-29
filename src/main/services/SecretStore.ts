import { join } from 'node:path'
import { safeStorage } from 'electron'
import { JsonStore } from './JsonStore'

interface SecretEntry {
  /** base64 payload, encrypted with the OS keychain when `encrypted` is true. */
  value: string
  encrypted: boolean
}

/**
 * Credentials (Anthropic key, Google refresh token) kept only in the main process,
 * encrypted with Electron's safeStorage (Keychain / DPAPI / libsecret) when available.
 */
export class SecretStore {
  private readonly store: JsonStore<Record<string, SecretEntry | string | boolean>>

  constructor(userDataDir: string) {
    this.store = new JsonStore(join(userDataDir, 'secrets.json'), {}, 0)
    this.migrateLegacy()
  }

  get(name: string): string | null {
    const e = this.store.value[name]
    if (!e || typeof e !== 'object') return null
    try {
      const buf = Buffer.from(e.value, 'base64')
      return e.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8')
    } catch {
      return null
    }
  }

  isEncrypted(name: string): boolean {
    const e = this.store.value[name]
    return typeof e === 'object' && e.encrypted
  }

  set(name: string, value: string | null): void {
    this.store.update((s) => {
      if (!value) {
        delete s[name]
        return
      }
      const encrypted = safeStorage.isEncryptionAvailable()
      s[name] = {
        value: (encrypted ? safeStorage.encryptString(value) : Buffer.from(value)).toString(
          'base64'
        ),
        encrypted
      }
    })
    this.store.flush()
  }

  /** v1 stored the Anthropic key as top-level { apiKey, encrypted }. */
  private migrateLegacy(): void {
    const s = this.store.value
    if (typeof s.apiKey === 'string') {
      const entry: SecretEntry = { value: s.apiKey, encrypted: s.encrypted === true }
      this.store.update((d) => {
        d.anthropicApiKey = entry
        delete d.apiKey
        delete d.encrypted
      })
      this.store.flush()
    }
  }
}
