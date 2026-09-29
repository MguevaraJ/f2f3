import { AuthError, type Fetch, type GoogleAuth } from './oauth'

/**
 * Minimal Google Drive v3 surface the backup needs. Every file/folder the app
 * creates carries appProperties { cs_source, cs_path, cs_kind } so the backup can
 * rebuild its view of Drive with a single query, without a fragile local index.
 */

export interface DriveItem {
  id: string
  name: string
  kind: 'file' | 'folder' | 'meta'
  /** Relative path inside the source ('' for the source folder itself). */
  path: string
  md5: string
  size: number
  parentId?: string
}

export interface DriveApi {
  account(): Promise<{ email: string; name: string }>
  /** The app's top folder ("Craftshot"), created on demand. */
  ensureAppFolder(): Promise<string>
  listSource(source: string): Promise<DriveItem[]>
  createFolder(source: string, path: string, name: string, parentId: string): Promise<string>
  upload(
    source: string,
    path: string,
    parentId: string,
    file: { name: string; data: Uint8Array; mimeType: string; mtime?: Date },
    kind?: 'file' | 'meta'
  ): Promise<{ id: string; md5: string }>
  updateContent(id: string, data: Uint8Array, mimeType: string): Promise<{ md5: string }>
  move(
    id: string,
    source: string,
    path: string,
    name: string,
    fromParent: string | undefined,
    toParent: string
  ): Promise<void>
  download(id: string): Promise<Uint8Array>
  /** Link to a folder; `email` makes Google open it in that account, not the browser's default. */
  folderUrl(id: string, email?: string): string
  /** Forget per-account caches (after switching Google accounts). */
  reset(): void
}

export class DriveHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const APP_FOLDER = 'Craftshot'
const FIELDS = 'id,name,mimeType,md5Checksum,size,parents,appProperties'
/** Above this, use a resumable session instead of a single multipart request. */
const MULTIPART_LIMIT = 5 * 1024 * 1024
const MAX_RETRIES = 5

const q = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class DriveClient implements DriveApi {
  private appFolderId: string | null = null

  constructor(
    private readonly auth: GoogleAuth,
    private readonly http: Fetch
  ) {}

  async account(): Promise<{ email: string; name: string }> {
    const res = await this.json<{ user: { emailAddress: string; displayName: string } }>(
      `${API}/about?fields=user(emailAddress,displayName)`
    )
    return { email: res.user.emailAddress, name: res.user.displayName }
  }

  async ensureAppFolder(): Promise<string> {
    if (this.appFolderId) return this.appFolderId
    const found = await this.json<{ files: { id: string }[] }>(
      `${API}/files?${new URLSearchParams({
        q: `mimeType='${FOLDER_MIME}' and appProperties has { key='cs_kind' and value='app' } and trashed=false`,
        fields: 'files(id)',
        pageSize: '1'
      })}`
    )
    this.appFolderId =
      found.files[0]?.id ??
      (
        await this.json<{ id: string }>(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: APP_FOLDER,
            mimeType: FOLDER_MIME,
            appProperties: { cs_kind: 'app' }
          })
        })
      ).id
    return this.appFolderId
  }

  async listSource(source: string): Promise<DriveItem[]> {
    const items: DriveItem[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `appProperties has { key='cs_source' and value='${q(source)}' } and trashed=false`,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: '1000',
        spaces: 'drive'
      })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await this.json<{
        nextPageToken?: string
        files: {
          id: string
          name: string
          mimeType: string
          md5Checksum?: string
          size?: string
          parents?: string[]
          appProperties?: Record<string, string>
        }[]
      }>(`${API}/files?${params}`)
      for (const f of page.files) {
        const kind =
          f.mimeType === FOLDER_MIME
            ? 'folder'
            : f.appProperties?.cs_kind === 'meta'
              ? 'meta'
              : 'file'
        items.push({
          id: f.id,
          name: f.name,
          kind,
          path: f.appProperties?.cs_path ?? f.name,
          md5: f.md5Checksum ?? '',
          size: Number(f.size ?? 0),
          parentId: f.parents?.[0]
        })
      }
      pageToken = page.nextPageToken
    } while (pageToken)
    return items
  }

  async createFolder(
    source: string,
    path: string,
    name: string,
    parentId: string
  ): Promise<string> {
    const res = await this.json<{ id: string }>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
        appProperties: { cs_source: source, cs_path: path, cs_kind: 'folder' }
      })
    })
    return res.id
  }

  async upload(
    source: string,
    path: string,
    parentId: string,
    file: { name: string; data: Uint8Array; mimeType: string; mtime?: Date },
    kind: 'file' | 'meta' = 'file'
  ): Promise<{ id: string; md5: string }> {
    const metadata = {
      name: file.name,
      parents: [parentId],
      modifiedTime: file.mtime?.toISOString(),
      appProperties: { cs_source: source, cs_path: path, cs_kind: kind }
    }
    if (file.data.byteLength <= MULTIPART_LIMIT) {
      const boundary = `craftshot${Date.now().toString(36)}`
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
            `--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`
        ),
        Buffer.from(file.data),
        Buffer.from(`\r\n--${boundary}--`)
      ])
      const res = await this.json<{ id: string; md5Checksum: string }>(
        `${UPLOAD}/files?uploadType=multipart&fields=id,md5Checksum`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body
        }
      )
      return { id: res.id, md5: res.md5Checksum }
    }
    const session = await this.request(
      `${UPLOAD}/files?uploadType=resumable&fields=id,md5Checksum`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': file.mimeType
        },
        body: JSON.stringify(metadata)
      }
    )
    const location = session.headers.get('location')
    if (!location) throw new DriveHttpError('Drive no abrió la sesión de subida', session.status)
    const res = await this.json<{ id: string; md5Checksum: string }>(location, {
      method: 'PUT',
      headers: { 'Content-Type': file.mimeType },
      body: Buffer.from(file.data)
    })
    return { id: res.id, md5: res.md5Checksum }
  }

  async updateContent(id: string, data: Uint8Array, mimeType: string): Promise<{ md5: string }> {
    const res = await this.json<{ md5Checksum: string }>(
      `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=md5Checksum`,
      { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: Buffer.from(data) }
    )
    return { md5: res.md5Checksum }
  }

  async move(
    id: string,
    source: string,
    path: string,
    name: string,
    fromParent: string | undefined,
    toParent: string
  ): Promise<void> {
    const params = new URLSearchParams({ fields: 'id' })
    if (fromParent !== toParent) {
      params.set('addParents', toParent)
      if (fromParent) params.set('removeParents', fromParent)
    }
    await this.json(`${API}/files/${encodeURIComponent(id)}?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        appProperties: { cs_source: source, cs_path: path, cs_kind: 'file' }
      })
    })
  }

  async download(id: string): Promise<Uint8Array> {
    const res = await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`)
    return new Uint8Array(await res.arrayBuffer())
  }

  reset(): void {
    this.appFolderId = null
  }

  folderUrl(id: string, email?: string): string {
    const url = `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
    return email ? `${url}?authuser=${encodeURIComponent(email)}` : url
  }

  // ───────────────────────── transport ─────────────────────────

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.request(url, init)
    return (await res.json()) as T
  }

  /** Authenticated request with token refresh on 401 and exponential backoff on 429/5xx. */
  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.auth.accessToken()
      let res: Response
      try {
        res = await this.http(url, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` }
        })
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err
        await sleep(backoff(attempt))
        continue
      }
      if (res.ok) return res
      if (res.status === 401 && attempt === 0) {
        this.auth.invalidate()
        continue
      }
      const retryable =
        res.status === 429 ||
        res.status >= 500 ||
        (res.status === 403 && (await isRateLimit(res.clone())))
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(backoff(attempt, res.headers.get('retry-after')))
        continue
      }
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      if (res.status === 401)
        throw new AuthError('Google rechazó la sesión. Vuelve a conectar la cuenta.', true)
      if (res.status === 403 && /storage quota/i.test(detail?.error?.message ?? ''))
        throw new DriveHttpError('Tu Google Drive no tiene espacio suficiente', 403)
      throw new DriveHttpError(
        `Drive respondió ${res.status}: ${detail?.error?.message ?? res.statusText}`,
        res.status
      )
    }
  }
}

function backoff(attempt: number, retryAfter?: string | null): number {
  const hinted = Number(retryAfter)
  if (Number.isFinite(hinted) && hinted > 0) return Math.min(hinted * 1000, 60_000)
  return Math.min(1000 * 2 ** attempt + Math.random() * 500, 32_000)
}

async function isRateLimit(res: Response): Promise<boolean> {
  const body = (await res.json().catch(() => null)) as {
    error?: { errors?: { reason?: string }[] }
  } | null
  return !!body?.error?.errors?.some((e) =>
    /rateLimitExceeded|userRateLimitExceeded/.test(e.reason ?? '')
  )
}
