import { createHash } from 'node:crypto'
import { vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

const { GoogleAuth, AuthError, DRIVE_SCOPE } = await import('../src/main/google/oauth')

/** SecretStore stand-in. */
class Secrets {
  data = new Map<string, string>()
  get(k: string) {
    return this.data.get(k) ?? null
  }
  set(k: string, v: string | null) {
    if (v) this.data.set(k, v)
    else this.data.delete(k)
  }
}

describe('Google OAuth (loopback + PKCE)', () => {
  const client = () => ({ clientId: 'cid.apps.googleusercontent.com', clientSecret: 'shh' })

  it('runs the full flow: consent URL, loopback redirect, code exchange with the PKCE verifier', async () => {
    const secrets = new Secrets()
    let tokenBody: URLSearchParams | null = null
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      tokenBody = new URLSearchParams(String(init?.body))
      expect(String(url)).toBe('https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'A1', expires_in: 3600, refresh_token: 'R1' })
    })
    let consent: URL | null = null
    // The "browser": follows the consent URL straight back to the app's loopback server.
    const browser = async (url: string) => {
      consent = new URL(url)
      const redirect = new URL(consent.searchParams.get('redirect_uri')!)
      redirect.searchParams.set('code', 'CODE123')
      redirect.searchParams.set('state', consent.searchParams.get('state')!)
      const page = await fetch(redirect)
      expect(await page.text()).toContain('Cuenta conectada')
    }
    const auth = new GoogleAuth(client, secrets as never, http as never, browser)
    await auth.login()

    expect(consent!.hostname).toBe('accounts.google.com')
    expect(consent!.searchParams.get('scope')).toBe(DRIVE_SCOPE)
    expect(consent!.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(consent!.searchParams.get('code_challenge_method')).toBe('S256')
    expect(consent!.searchParams.get('prompt')).toContain('select_account')
    const verifier = tokenBody!.get('code_verifier')!
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      consent!.searchParams.get('code_challenge')
    )
    expect(tokenBody!.get('code')).toBe('CODE123')
    expect(secrets.get('googleRefreshToken')).toBe('R1')
    expect(await auth.accessToken()).toBe('A1')
    expect(auth.connected).toBe(true)
  })

  it('rejects a redirect with the wrong state (CSRF)', async () => {
    const browser = async (url: string) => {
      const redirect = new URL(new URL(url).searchParams.get('redirect_uri')!)
      redirect.searchParams.set('code', 'x')
      redirect.searchParams.set('state', 'forged')
      await fetch(redirect)
    }
    const auth = new GoogleAuth(client, new Secrets() as never, vi.fn() as never, browser)
    await expect(auth.login()).rejects.toBeInstanceOf(AuthError)
  })

  it('refreshes expired access tokens and drops a revoked grant', async () => {
    const secrets = new Secrets()
    secrets.set('googleRefreshToken', 'R1')
    const http = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'A2', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ error: 'invalid_grant' }, { status: 400 }))
    const auth = new GoogleAuth(client, secrets as never, http as never, async () => undefined)
    expect(await auth.accessToken()).toBe('A2')
    auth.invalidate()
    await expect(auth.accessToken()).rejects.toMatchObject({ needsReconnect: true })
    expect(secrets.get('googleRefreshToken')).toBeNull()
  })

  it('explains a missing client configuration', async () => {
    const auth = new GoogleAuth(
      () => null,
      new Secrets() as never,
      vi.fn() as never,
      async () => undefined
    )
    await expect(auth.login()).rejects.toThrow(/Client ID/)
  })
})
