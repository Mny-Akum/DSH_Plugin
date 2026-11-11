/**
 * Host half of dsh-plugin-ncm-sidecard.
 *
 * Serves one thing: a same-origin proxy for album covers (`/ncm-sidecard/cover?url=…`).
 * The browser half samples the cover on a canvas to build the adaptive palette; a
 * cross-origin image would taint that canvas, so the bytes come from this host route
 * instead. Only NetEase image hosts are proxied, and responses are cached in memory.
 *
 * Everything else (the card itself) lives in client.js; disabling this row removes the card.
 */

import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-plugin-ncm-sidecard'

export const inject = ['webServer']

/**
 * Row configuration, edited from the Plugins page (the client registers a `plugins.row.config`
 * page for this row). Volatile so a change is applied without restarting the row.
 */
export const Config = Schema.object({
  adaptiveColor: Schema.boolean().default(false).volatile().description(
    '海报取色：卡片背景与歌词色跟随封面主色（Material 3 色板）。关闭时沿用当前主题配色。',
  ),
  backgroundColor: Schema.string().default('').volatile().description(
    '卡片背景色（#rrggbb 或 rgb(...)）。留空表示自动：跟随当前主题，或「海报取色」开启时跟随封面。',
  ),
})

const ALLOWED_HOST = /(^|\.)(music\.126\.net|126\.net|netease\.com)$/i
const MAX_BYTES = 8 * 1024 * 1024
const TTL_MS = 6 * 60 * 60 * 1000
const MAX_ENTRIES = 80

/** url -> { type, body, at } */
const cache = new Map()

function remember (url, entry) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(url, entry)
}

function allowed (url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!ALLOWED_HOST.test(parsed.hostname)) return null
    return parsed
  } catch {
    return null
  }
}

export function apply (ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/ncm-sidecard/cover',
    handler: async (req, res) => {
      const fail = (code, message) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: false, error: message }))
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'method not allowed')

      const target = allowed(new URL(req.url, 'http://127.0.0.1').searchParams.get('url') || '')
      if (!target) return fail(400, 'unsupported image url')

      const key = target.href
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < TTL_MS) {
        res.writeHead(200, {
          'content-type': hit.type,
          'content-length': String(hit.body.length),
          'cache-control': 'private, max-age=21600',
        })
        return res.end(req.method === 'HEAD' ? undefined : hit.body)
      }

      try {
        // NetEase's image service resizes on demand; the palette only needs a thumbnail.
        const upstreamUrl = new URL(key)
        if (!upstreamUrl.searchParams.has('param')) upstreamUrl.searchParams.set('param', '64y64')
        const upstream = await fetch(upstreamUrl.href, {
          headers: {
            // The CDN answers plain browser requests; keep the referer close to what the player sends.
            referer: 'https://music.163.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
        })
        if (!upstream.ok) return fail(502, 'image responded ' + upstream.status)
        const type = upstream.headers.get('content-type') || 'image/jpeg'
        if (!type.startsWith('image/')) return fail(415, 'not an image')
        const body = Buffer.from(await upstream.arrayBuffer())
        if (body.length === 0 || body.length > MAX_BYTES) return fail(502, 'image too large or empty')
        remember(key, { type, body, at: Date.now() })
        res.writeHead(200, {
          'content-type': type,
          'content-length': String(body.length),
          'cache-control': 'private, max-age=21600',
        })
        res.end(req.method === 'HEAD' ? undefined : body)
      } catch (err) {
        fail(502, String((err && err.message) || err))
      }
    },
  }), 'ncm-sidecard: cover proxy')
}
