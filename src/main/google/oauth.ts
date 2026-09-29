import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SecretStore } from '../services/SecretStore'

/**
 * Google OAuth 2.0 for installed apps: system browser + loopback redirect on
 * 127.0.0.1 + PKCE, as Google recommends for desktop clients.
 * Only the `drive.file` scope is requested: the app can see and manage the files
 * it creates, nothing else in the user's Drive.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const REFRESH_KEY = 'googleRefreshToken'
const LOGIN_TIMEOUT_MS = 5 * 60_000

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export type Fetch = typeof fetch

export class AuthError extends Error {
  constructor(
    message: string,
    /** The stored grant is unusable (revoked/expired): the user must reconnect. */
    readonly needsReconnect = false
  ) {
    super(message)
  }
}

const b64url = (buf: Buffer): string => buf.toString('base64url')

export class GoogleAuth {
  private access: { token: string; expiresAt: number } | null = null
  private pendingServer: Server | null = null

  constructor(
    private readonly client: () => OAuthClient | null,
    private readonly secrets: SecretStore,
    private readonly http: Fetch,
    private readonly openBrowser: (url: string) => Promise<void>
  ) {}

  get connected(): boolean {
    return !!this.secrets.get(REFRESH_KEY)
  }

  /** Opens the consent screen and waits for the redirect. Resolves once tokens are stored. */
  async login(): Promise<void> {
    const client = this.requireClient()
    this.cancelLogin()
    const verifier = b64url(randomBytes(48))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    const state = b64url(randomBytes(16))

    const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
      (resolve, reject) => {
        const server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          if (url.pathname !== '/') {
            res.writeHead(404).end()
            return
          }
          const error = url.searchParams.get('error')
          const ok =
            !error && url.searchParams.get('state') === state && url.searchParams.get('code')
          res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(resultPage(!!ok, error))
          finish()
          if (ok) resolve({ code: url.searchParams.get('code')!, redirectUri })
          else
            reject(
              new AuthError(
                error === 'access_denied'
                  ? 'Permiso denegado en Google'
                  : 'Respuesta de Google no válida'
              )
            )
        })
        const timer = setTimeout(() => {
          finish()
          reject(new AuthError('Tiempo de espera agotado al conectar con Google'))
        }, LOGIN_TIMEOUT_MS)
        const finish = (): void => {
          clearTimeout(timer)
          server.close()
          if (this.pendingServer === server) this.pendingServer = null
        }
        server.on('close', () => clearTimeout(timer))
        server.on('error', (e) => {
          finish()
          reject(e)
        })
        let redirectUri = ''
        server.listen(0, '127.0.0.1', () => {
          redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
          this.pendingServer = server
          const params = new URLSearchParams({
            client_id: client.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: DRIVE_SCOPE,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            access_type: 'offline',
            prompt: 'consent'
          })
          this.openBrowser(`${AUTH_URL}?${params}`).catch((e) => {
            finish()
            reject(e)
          })
        })
      }
    )

    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    })
    if (!tokens.refresh_token) throw new AuthError('Google no devolvió un token de actualización')
    this.secrets.set(REFRESH_KEY, tokens.refresh_token)
    this.access = { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
  }

  cancelLogin(): void {
    this.pendingServer?.close()
    this.pendingServer = null
  }

  /** A valid access token, refreshing it when it is about to expire. */
  async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - Date.now() > 60_000) return this.access.token
    const refresh = this.secrets.get(REFRESH_KEY)
    if (!refresh) throw new AuthError('No hay una cuenta de Google conectada', true)
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
    this.access = { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
    return this.access.token
  }

  /** Forces a refresh on the next call (after a 401). */
  invalidate(): void {
    this.access = null
  }

  async logout(): Promise<void> {
    const refresh = this.secrets.get(REFRESH_KEY)
    this.secrets.set(REFRESH_KEY, null)
    this.access = null
    if (refresh)
      // Best effort: the local grant is gone either way.
      await this.http(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, {
        method: 'POST'
      }).catch(() => undefined)
  }

  private requireClient(): OAuthClient {
    const c = this.client()
    if (!c?.clientId) throw new AuthError('Falta configurar el Client ID de Google en Ajustes')
    return c
  }

  private async tokenRequest(
    body: Record<string, string>
  ): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
    const client = this.requireClient()
    const res = await this.http(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        ...body
      })
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      if (json.error === 'invalid_grant') {
        this.secrets.set(REFRESH_KEY, null)
        throw new AuthError(
          'La sesión de Google caducó o fue revocada. Vuelve a conectar la cuenta.',
          true
        )
      }
      if (json.error === 'invalid_client')
        throw new AuthError('Client ID o secreto de Google incorrectos')
      throw new AuthError(`Google rechazó la autenticación (${String(json.error ?? res.status)})`)
    }
    return json as { access_token: string; expires_in: number; refresh_token?: string }
  }
}

function resultPage(ok: boolean, error: string | null): string {
  const title = ok ? 'Cuenta conectada' : 'No se pudo conectar'
  const msg = ok
    ? 'Ya puedes cerrar esta pestaña y volver a Craftshot.'
    : `Vuelve a Craftshot e inténtalo de nuevo.${error ? ` (${error.replace(/[^\w-]/g, '')})` : ''}`
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Craftshot · ${title}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1e1e1e;color:#fff;font:16px system-ui,sans-serif">
<div style="text-align:center;padding:40px 56px;background:#2a2a2a;border-radius:6px;border-bottom:5px solid ${ok ? '#1d4d13' : '#7d1d1d'}">
<div style="font-size:44px">${ok ? '✔' : '✖'}</div><h1 style="margin:8px 0;font-size:22px">${title}</h1>
<p style="color:#bbb;margin:0">${msg}</p></div></body></html>`
}
