import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { SCHEME } from '@shared/ipc'
import type { LibraryService } from './services/LibraryService'
import type { ThumbnailService } from './services/ThumbnailService'

/** Must run before `app.ready`. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/**
 * Serves screenshots and thumbnails to the renderer without exposing `file://`.
 *   f2f3://image/<id>   original file
 *   f2f3://thumb/<id>   cached thumbnail (generated on demand)
 * Every id is resolved by the library, which refuses paths outside the root.
 */
export function registerSchemeHandler(library: LibraryService, thumbs: ThumbnailService): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const abs = library.resolveId(id)
      const file = url.host === 'thumb' ? await thumbs.get(abs) : url.host === 'image' ? abs : null
      if (!file) return new Response('Not found', { status: 404 })
      const res = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(res.headers)
      // URLs carry ?v=<mtime>, so a changed file gets a new URL: cache aggressively.
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      // Lets the viewer read pixels (colour picker) from a canvas without tainting it.
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
