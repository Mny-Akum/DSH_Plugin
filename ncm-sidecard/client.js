window.__ModuleLoader__.load({
  id: 'dsh-plugin-ncm-sidecard',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React
    const TAG = '[dsh-plugin-ncm-sidecard]'
    // Set on <html> while the sidebar card stands in for ncm-player's floating mini bar.
    const FLAG = 'data-ncm-sidecard'
    const POLL_MS = 250

    /*
     * ncm-player bridge.
     *
     * @wolfgenerals/ncm-player keeps all player state inside its `NcmPlayer` React component
     * and exposes no API. The card therefore attaches to that live component: it finds the
     * component's fiber from the `.ncm-wrap` element and reads/drives the component's own
     * hooks, so the player stays the single owner of playback (one <audio>, one queue, its
     * own persistence).
     *
     * `H` is the hook call order of NcmPlayer in ncm-player 1.2.0 (client/src.js). `connect()`
     * checks a fingerprint of that layout before every use; on any mismatch (another
     * ncm-player version) the bridge reports "unavailable", the card stays hidden and the
     * original floating mini bar keeps working.
     */
    const H = {
      pos: 0, mini: 1, visible: 2, tab: 3, queue: 4, index: 5, playing: 6, time: 7,
      vol: 9, muted: 10, mode: 11, lyrics: 13, showTrans: 14, miniLrcScroll: 16,
      account: 20, cookieDraft: 21, searchKw: 27, likedIds: 33, liked: 34, likeBusy: 35,
      audioRef: 39, autoPlayRef: 44, liveRef: 45,
    }
    const HOOK_COUNT = 49
    const MODES = ['order', 'loop', 'shuffle']
    const WIN_H = 490 // ncm-player's expanded window height, used to keep it on screen.

    function hookList(fiber) {
      const out = []
      let hook = fiber && fiber.memoizedState
      while (hook && typeof hook === 'object' && 'next' in hook && out.length < 400) { out.push(hook); hook = hook.next }
      return out
    }

    function makeBridge(hooks) {
      if (hooks.length < HOOK_COUNT) return null
      const get = i => (hooks[i].queue ? hooks[i].queue.lastRenderedState : hooks[i].memoizedState)
      const isState = i => !!(hooks[i].queue && typeof hooks[i].queue.dispatch === 'function')
      const isRef = i => !hooks[i].queue && hooks[i].memoizedState && typeof hooks[i].memoizedState === 'object' && 'current' in hooks[i].memoizedState
      try {
        const bools = [H.mini, H.visible, H.playing, H.muted, H.showTrans, H.miniLrcScroll, H.liked, H.likeBusy]
        if (!bools.every(i => isState(i) && typeof get(i) === 'boolean')) return null
        if (![H.queue, H.index, H.time, H.vol, H.mode, H.lyrics, H.tab, H.cookieDraft, H.searchKw, H.account].every(isState)) return null
        if (!Array.isArray(get(H.queue)) || !Array.isArray(get(H.lyrics))) return null
        if (typeof get(H.index) !== 'number' || typeof get(H.time) !== 'number' || typeof get(H.vol) !== 'number') return null
        if (!MODES.includes(get(H.mode)) || typeof get(H.cookieDraft) !== 'string' || typeof get(H.searchKw) !== 'string') return null
        if (!isRef(H.audioRef) || !isRef(H.autoPlayRef) || !isRef(H.liveRef)) return null
        if (typeof hooks[H.autoPlayRef].memoizedState.current !== 'boolean') return null
        const audio = hooks[H.audioRef].memoizedState.current
        if (audio && !(audio instanceof HTMLMediaElement)) return null
        const live = hooks[H.liveRef].memoizedState.current
        if (!live || typeof live !== 'object' || !('quality' in live) || !('miniLrcSize' in live)) return null
      } catch (_) { return null }
      return {
        get,
        set: (i, value) => hooks[i].queue.dispatch(value),
        ref: i => hooks[i].memoizedState,
      }
    }

    /** Attach to the mounted NcmPlayer component, or return null when it is absent or unrecognized. */
    function connect() {
      const el = document.querySelector('.ncm-wrap')
      if (!el) return null
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
      let fiber = key ? el[key] : null
      for (let depth = 0; fiber && depth < 16; depth++, fiber = fiber.return) {
        if (typeof fiber.type !== 'function') continue
        const bridge = makeBridge(hookList(fiber))
        if (bridge) return bridge
        if (fiber.type.name === 'NcmPlayer') return null
      }
      return null
    }

    function activeLyric(lyrics, time) {
      let found = -1
      for (let i = 0; i < lyrics.length; i++) { if (lyrics[i].t <= time + 250) found = i; else break }
      return found
    }

    function readSnapshot() {
      const b = connect()
      if (!b) return null
      const queue = b.get(H.queue)
      const index = b.get(H.index)
      const song = index >= 0 && index < queue.length ? queue[index] : null
      const lyrics = b.get(H.lyrics)
      const lyricIdx = song ? activeLyric(lyrics, b.get(H.time)) : -1
      const account = b.get(H.account)
      return {
        // The card stands in for the closed player (× / ✓ 隐藏), not for the mini bar.
        active: !b.get(H.visible),
        queue, index, song, lyrics, lyricIdx,
        playing: b.get(H.playing),
        showTrans: b.get(H.showTrans),
        scroll: b.get(H.miniLrcScroll),
        vol: b.get(H.vol),
        muted: b.get(H.muted),
        mode: b.get(H.mode),
        loggedIn: !!(account && account.uid),
        liked: b.get(H.liked),
        likeBusy: b.get(H.likeBusy),
      }
    }

    function sameSnapshot(a, b) {
      if (a === b) return true
      if (!a || !b) return false
      for (const k in a) if (a[k] !== b[k]) return false
      return true
    }

    async function ncmApi(op, args) {
      const res = await fetch('/ncm/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ op }, args || {})),
      })
      const parsed = await res.json().catch(() => null)
      if (!parsed || parsed.ok !== true) throw new Error((parsed && parsed.error && parsed.error.message) || '未知错误')
      return parsed.value
    }

    /** Player actions. Each mirrors the matching handler inside NcmPlayer. */
    const actions = {
      toggle() {
        const b = connect(); if (!b) return
        const a = b.ref(H.audioRef).current
        const queue = b.get(H.queue), index = b.get(H.index)
        if (!a || index < 0 || index >= queue.length) return
        b.ref(H.autoPlayRef).current = true
        if (a.paused) a.play().catch(() => { }); else a.pause()
      },
      next() {
        const b = connect(); if (!b) return
        const queue = b.get(H.queue), index = b.get(H.index)
        if (!queue.length) return
        b.ref(H.autoPlayRef).current = true
        if (b.get(H.mode) === 'shuffle') {
          let i = Math.floor(Math.random() * queue.length)
          if (i === index) i = (i + 1) % queue.length
          b.set(H.index, i)
          return
        }
        b.set(H.index, (index + 1) % queue.length)
      },
      prev() {
        const b = connect(); if (!b) return
        const a = b.ref(H.audioRef).current
        if (a && a.currentTime > 3) { a.currentTime = 0; return }
        const queue = b.get(H.queue), index = b.get(H.index)
        if (!queue.length) return
        b.ref(H.autoPlayRef).current = true
        b.set(H.index, (index - 1 + queue.length) % queue.length)
      },
      playAt(i) {
        const b = connect(); if (!b) return
        const queue = b.get(H.queue)
        if (i < 0 || i >= queue.length) return
        if (i === b.get(H.index)) {
          const a = b.ref(H.audioRef).current
          if (a && a.paused) { b.ref(H.autoPlayRef).current = true; a.play().catch(() => { }) }
          return
        }
        b.ref(H.autoPlayRef).current = true
        b.set(H.index, i)
      },
      setVolume(v) {
        const b = connect(); if (!b) return
        b.set(H.vol, v)
        if (v > 0 && b.get(H.muted)) b.set(H.muted, false)
        if (v === 0) b.set(H.muted, true)
      },
      toggleMute() {
        const b = connect(); if (!b) return
        b.set(H.muted, m => !m)
      },
      /** Open the full window again (optionally on one tab), keeping it on screen like ncm does. */
      expand(tab) {
        const b = connect(); if (!b) return
        const pos = b.get(H.pos)
        if (pos && pos.y + WIN_H + 14 > window.innerHeight) b.set(H.pos, { x: pos.x, y: Math.max(8, window.innerHeight - WIN_H - 14) })
        if (tab) b.set(H.tab, tab)
        b.set(H.mini, false)
        b.set(H.visible, true)
      },
      async like() {
        const b = connect(); if (!b) return null
        const queue = b.get(H.queue), index = b.get(H.index)
        const song = index >= 0 && index < queue.length ? queue[index] : null
        if (!song || b.get(H.likeBusy)) return null
        const account = b.get(H.account)
        if (!account || !account.uid) { actions.expand('settings'); return null }
        const target = !b.get(H.liked)
        b.set(H.likeBusy, true)
        try {
          await ncmApi('like', { id: song.id, like: target })
          const now = connect()
          if (now) {
            now.set(H.liked, target)
            now.set(H.likedIds, s => { const ns = new Set(s || []); if (target) ns.add(song.id); else ns.delete(song.id); return ns })
          }
          return target ? '已收藏' : '已取消收藏'
        } finally {
          const now = connect()
          if (now) now.set(H.likeBusy, false)
        }
      },
    }

    // Icon paths match ncm-player's own set so the card reads as part of the same player.
    const ICONS = {
      play: 'M8 5v14l11-7z',
      pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
      next: ['M6 5v14l9-7-9-7z', 'M17 5h2v14h-2z'],
      prev: ['M18 5v14l-9-7 9-7z', 'M5 5h2v14H5z'],
      heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z',
      music: ['M9 18V5l12-2v13', 'M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
      list: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
      expand: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
      vol: ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
      volx: ['M11 5 6 9H2v6h4l5 4V5z', 'M22 9l-6 6', 'M16 9l6 6'],
    }
    const Ico = ({ d, size, fill }) => {
      const s = size || 16
      return h('svg', { viewBox: '0 0 24 24', width: s, height: s, 'aria-hidden': true, style: { display: 'block' } },
        (Array.isArray(d) ? d : [d]).map((p, i) => h('path', { key: i, d: p, fill: fill ? 'currentColor' : 'none', stroke: fill ? 'none' : 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })))
    }

    /**
     * Play / pause inside a hairline circle. Both shapes live in one SVG so the ring is a true
     * circle at any DPR instead of a small CSS border, which renders as flat segments.
     */
    const MainGlyph = ({ playing }) => h('svg', { viewBox: '0 0 26 26', 'aria-hidden': true }, [
      h('circle', { key: 'ring', cx: 13, cy: 13, r: 12.4 }),
      playing
        ? h('g', { key: 'pause' }, [
          h('rect', { key: 'a', x: 9.6, y: 7.6, width: 2.6, height: 10.8, rx: 0.8 }),
          h('rect', { key: 'b', x: 13.8, y: 7.6, width: 2.6, height: 10.8, rx: 0.8 }),
        ])
        : h('path', { key: 'play', d: 'M10.6 7.3 L19 13 L10.6 18.7 Z' }),
    ])

    const fmt = ms => {
      if (!ms || ms < 0) return ''
      const s = Math.floor(ms / 1000)
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
    }

    const rgba = str => {
      const m = /rgba?\(([^)]+)\)/.exec(str || '')
      if (!m) return null
      const p = m[1].split(',').map(Number)
      if (p.length < 3 || p.some(n => Number.isNaN(n))) return null
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }

    /** `top` painted over `bottom` (both rgba objects) → composited colour. */
    const blend = (top, bottom) => {
      const a = top.a + bottom.a * (1 - top.a)
      if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
      const mix = k => Math.round((top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a)
      return { r: mix('r'), g: mix('g'), b: mix('b'), a }
    }

    /**
     * The colour the surface behind `el` actually paints: every translucent layer composited over
     * the nearest opaque one (or over a theme-appropriate base). Always returns an opaque `rgb()`,
     * so the card and its popovers are pixel-identical whatever backdrop each one floats over —
     * glass and wallpaper skins included.
     */
    function surfaceColor(el, darkHint) {
      const stack = []
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const c = rgba(getComputedStyle(node).backgroundColor)
        if (!c || c.a === 0) continue
        stack.push(c)
        if (c.a >= 0.999) break
      }
      let out
      if (stack.length && stack[stack.length - 1].a >= 0.999) out = stack.pop()
      else out = darkHint ? { r: 24, g: 25, b: 29, a: 1 } : { r: 250, g: 250, b: 252, a: 1 }
      for (let i = stack.length - 1; i >= 0; i--) out = blend(stack[i], out)
      return 'rgb(' + out.r + ', ' + out.g + ', ' + out.b + ')'
    }

    /** Relative luminance of an `rgb()` / `rgba()` string, or null. */
    function luminance(color) {
      const m = /rgba?\(([^)]+)\)/.exec(color || '')
      if (!m) return null
      const [r, g, b] = m[1].split(',').map(v => Number(v) / 255)
      const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /**
     * Opaque `container` tone derived from the surface behind the card: the sidebar colour
     * nudged a few percent toward the text colour, so the card reads as a raised surface in
     * any skin — and never as see-through glass, even when the theme token is translucent.
     */
    function containerTone(base, dark) {
      const m = /rgba?\(([^)]+)\)/.exec(base || '')
      if (!m) return ''
      const target = dark ? 255 : 0
      const rgb = m[1].split(',').slice(0, 3).map(v => {
        const n = Number(v)
        return Math.round(n + (target - n) * (dark ? 0.07 : 0.05))
      })
      return 'rgb(' + rgb.join(', ') + ')'
    }

    // ---- 海报取色（Material 风格色板） -------------------------------------------------
    // The switch is this row's Config, edited on the plugin's own page in the Plugins panel
    // (`plugins.row.config`); the card mirrors the value through a tiny in-memory store.
    const ROW_ID = 'ncm-sidecard'
    const ROW_CONFIG_KEY = 'dsh-plugin-ncm-sidecard#ncm-sidecard'
    const ROW_CONFIG_LABEL = '网易云音乐侧边栏卡片'

    function settingsRemote (ctx) {
      try { return ctx.get('remote.settings') } catch (e) { return undefined }
    }

    async function settingsCall (service, method, ...args) {
      if (!service || typeof service[method] !== 'function') throw new Error('设置服务不可用（请确认 dsh-api-remotes 已加载）')
      const result = await service[method](...args)
      if (result && typeof result === 'object' && 'ok' in result) {
        if (!result.ok) throw new Error((result.error && result.error.message) || '写入插件配置失败')
        return result.value
      }
      return result
    }

    /** Read this row's Config value and revision from the settings service. */
    async function readRowConfig (ctx) {
      const doc = await settingsCall(settingsRemote(ctx), 'describe')
      const rows = Array.isArray(doc) ? doc : (doc && doc.namespaces) || []
      const entry = rows.find(row => row && row.ns === ROW_ID)
      if (!entry) throw new Error('未找到本插件的配置项')
      return { value: entry.value || {}, revision: entry.revision }
    }

    /** Merge `patch` into the row config; returns the freshly read value. */
    async function writeRowConfig (ctx, patch) {
      const current = await readRowConfig(ctx)
      await settingsCall(settingsRemote(ctx), 'update', ROW_ID, Object.assign({}, current.value, patch), current.revision)
      return (await readRowConfig(ctx)).value
    }

    const CONFIG_CACHE_KEY = 'nsc-sidecard-config'
    function readConfigCache () {
      try { const parsed = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); return parsed && typeof parsed === 'object' ? parsed : null } catch (e) { return null }
    }
    function writeConfigCache (value) {
      try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(value)) } catch (e) { /* 隐私模式：不缓存 */ }
    }

    /** Last measured container tone; reused so a remounted card paints correctly on frame one. */
    let lastSurface = ''

    /**
     * Card-side mirror of the row config, so the plugin page and the card stay in step.
     * Seeded from the local cache: the settings service answers asynchronously, and without this
     * the first frame after opening would paint with the theme fallback instead of the chosen colour.
     */
    const configStore = { value: readConfigCache() || {}, ready: false, listeners: new Set() }
    function publishConfig (value) {
      configStore.value = value && typeof value === 'object' ? value : {}
      configStore.ready = true
      writeConfigCache(configStore.value)
      configStore.listeners.forEach(fn => { try { fn() } catch (e) { } })
    }
    const adaptiveOf = value => !!(value && value.adaptiveColor === true)
    /** Normalise any CSS colour (`#rrggbb`, `rgb()`, names…) to `rgb(r, g, b)`, or '' if unusable. */
    function toRgbString (color) {
      if (!color) return ''
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;left:-9999px;top:0'
      probe.style.color = color
      document.body.appendChild(probe)
      const parsed = rgba(getComputedStyle(probe).color)
      probe.remove()
      return parsed ? 'rgb(' + Math.round(parsed.r) + ', ' + Math.round(parsed.g) + ', ' + Math.round(parsed.b) + ')' : ''
    }
    /** The configured card colour, normalised, or '' for "automatic". */
    function customColorOf (value) {
      const raw = value && typeof value.backgroundColor === 'string' ? value.backgroundColor.trim() : ''
      return raw ? toRgbString(raw) : ''
    }

    /** url -> { hue, sat } — sampling a cover is expensive, so results are kept for the session. */
    const seedCache = new Map()
    /** `cover|dark` -> palette, so a remounted card paints its tinted surface on the first frame. */
    const paletteCache = new Map()

    function hueOf (r, g, b) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const d = max - min
      if (d === 0) return 0
      let h
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      return (h * 60 + 360) % 360
    }

    /** Dominant hue/saturation of a decoded image, ignoring greys and blown-out pixels. */
    function sampleSeed (img) {
      const N = 24
      const canvas = document.createElement('canvas')
      canvas.width = N
      canvas.height = N
      const c = canvas.getContext('2d', { willReadFrequently: true })
      if (!c) return null
      c.drawImage(img, 0, 0, N, N)
      const data = c.getImageData(0, 0, N, N).data
      const weight = new Array(24).fill(0)
      const satSum = new Array(24).fill(0)
      let total = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const v = max
        const s = max === 0 ? 0 : (max - min) / max
        if (v < 0.12 || v > 0.97) continue // near-black / blown highlight
        if (s < 0.12) continue // greys carry no hue
        const bin = Math.floor(hueOf(r, g, b) / 15) % 24
        const w = s * (1 - Math.abs(v - 0.55)) // favour mid tones
        weight[bin] += w
        satSum[bin] += s * w
        total += w
      }
      if (total < 0.5) return null
      let best = 0
      for (let i = 1; i < 24; i++) if (weight[i] > weight[best]) best = i
      const sat = satSum[best] / (weight[best] || 1)
      return { hue: Math.round(best * 15 + 7.5), sat: Math.min(0.8, Math.max(0.2, sat)) }
    }

    /** Fetch a cover through the same-origin proxy so the canvas stays readable. */
    function coverSeed (url) {
      if (!url) return Promise.resolve(null)
      if (seedCache.has(url)) return Promise.resolve(seedCache.get(url))
      return new Promise(resolve => {
        let settled = false
        const finish = value => {
          if (settled) return
          settled = true
          if (value) seedCache.set(url, value)
          resolve(value)
        }
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => { try { finish(sampleSeed(img)) } catch (e) { finish(null) } }
        img.onerror = () => finish(null)
        img.src = '/ncm-sidecard/cover?url=' + encodeURIComponent(url)
        setTimeout(() => finish(null), 8000)
      })
    }

    /**
     * Material 3 style tonal palette from a cover seed (namida builds its scheme the same way:
     * `ColorScheme.fromSeed` with the artwork colour). Roles used here:
     *   surface  — opaque container tone, low chroma (M3 surfaceContainer);
     *   border   — outline tone, a step above the surface;
     *   accent   — primary tone (bright on dark schemes, deep on light ones).
     */
    function paletteFor (seed, dark) {
      const hue = seed.hue
      const sat = Math.min(1, Math.max(0.16, seed.sat))
      const hsl = (s, l) => 'hsl(' + hue + ' ' + Math.round(Math.min(1, s) * 100) + '% ' + l + '%)'
      return dark
        ? { surface: hsl(sat * 0.26, 18), border: hsl(sat * 0.34, 30), accent: hsl(sat * 1.35, 80) }
        : { surface: hsl(sat * 0.3, 94), border: hsl(sat * 0.34, 80), accent: hsl(sat * 1.45, 40) }
    }

    const CSS = `
.nsc-card{position:relative;box-sizing:border-box;width:100%;max-width:100%;min-width:0;display:flex;flex-direction:column;gap:0;padding:8px;border-radius:14px;
  background:var(--nsc-material,var(--nsc-surface,var(--dsw-alias-bg-layer-1,#26262b)));
  border:1px solid var(--nsc-material-border,var(--nsc-border,var(--dsw-alias-border-l1,rgba(255,255,255,.09))));
  color:var(--nsc-on-surface,var(--dsw-alias-label-primary,#e6e6e6));user-select:none;overflow:hidden;
  transition:background .25s ease,border-color .25s ease}
.nsc-card *{box-sizing:border-box}
.nsc-top{display:flex;gap:10px;align-items:center;min-width:0}
.nsc-cover{flex:none;width:52px;height:52px;padding:0;border:0;border-radius:9px;overflow:hidden;cursor:pointer;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.15));color:var(--dsw-alias-label-secondary,#999)}
.nsc-cover img{width:100%;height:100%;object-fit:cover;display:block}
.nsc-cover:focus-visible,.nsc-btn:focus-visible,.nsc-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#ec4141);outline-offset:1px}
.nsc-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px}
.nsc-title{padding-right:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25;font-size:13px}
.nsc-name{font-weight:600;color:var(--nsc-on-surface,var(--dsw-alias-label-primary,#e6e6e6))}
.nsc-artist{margin-left:6px;font-size:12px;color:inherit;opacity:.62}
.nsc-lrc{overflow:hidden;min-width:0;font-size:12px;line-height:1.35}
.nsc-lrc.dim{color:var(--dsw-alias-label-secondary,#999)}
.nsc-lrc-main{color:var(--nsc-accent,var(--dsw-alias-brand-primary,#ec4141))}
.nsc-lrc-line{display:block;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top}
.nsc-lrc-line.mq{max-width:none;overflow:visible;padding-right:16px;animation:nsc-mq var(--nsc-mq-dur,10s) linear infinite alternate}
/* Both languages share one colour; only size and weight separate them. */
.nsc-lrc-tr{display:block;margin-top:1px;font-size:10.5px;line-height:1.3;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes nsc-mq{0%,12%{transform:translateX(0)}88%,100%{transform:translateX(var(--nsc-mq-mx,-60px))}}
@media (prefers-reduced-motion:reduce){.nsc-lrc-line.mq{animation:none}}
/* Controls stay collapsed until the pointer (or keyboard focus) reaches the card. */
.nsc-ctl{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;
  margin-top:0;max-height:0;opacity:0;overflow:hidden;
  transition:max-height .18s ease,opacity .14s ease,margin-top .18s ease}
.nsc-card:hover .nsc-ctl,.nsc-card:focus-within .nsc-ctl,.nsc-card.nsc-pinned .nsc-ctl{margin-top:8px;max-height:44px;opacity:1}
.nsc-card.nsc-pinned .nsc-ctl{overflow:visible}
@media (hover:none){.nsc-ctl{margin-top:8px;max-height:44px;opacity:1;overflow:visible}}
/* Configuration page (Plugins panel → this row → Configure). */
.nsc-cfg{display:flex;flex-direction:column;gap:12px;padding:4px 0 8px}
.nsc-cfg-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.nsc-cfg-title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#eee)}
.nsc-cfg-note{font-size:12px;color:var(--dsw-alias-label-secondary,#999)}
.nsc-cfg-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#ff7b72)}
.nsc-cfg-row{display:flex;align-items:center;gap:16px;padding:12px 14px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1,#26262b);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}
.nsc-cfg-text{flex:1;min-width:0}
.nsc-cfg-name{font-size:13px;color:var(--dsw-alias-label-primary,#eee)}
.nsc-cfg-desc{margin-top:3px;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary,#999)}
.nsc-cfg-color{flex:none;width:44px;height:28px;padding:0;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:8px;background:transparent;cursor:pointer}
.nsc-cfg-btn{flex:none;height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:8px;
  background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary,#eee);font-size:12px;cursor:pointer}
.nsc-cfg-btn:hover:not(:disabled){border-color:var(--dsw-alias-label-secondary,rgba(128,128,128,.6))}
.nsc-cfg-btn:disabled{opacity:.5;cursor:default}
.nsc-switch{position:relative;flex:none;width:40px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:999px;
  background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.2));cursor:pointer;transition:background .18s ease,border-color .18s ease}
.nsc-switch:disabled{opacity:.6;cursor:default}
.nsc-switch i{position:absolute;top:50%;left:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary,#9a9aa2);
  transform:translateY(-50%);transition:left .18s ease,background .18s ease}
.nsc-switch.on{border-color:transparent;background:var(--dsw-alias-brand-primary,#ec4141)}
.nsc-switch.on i{left:21px;background:#fff}
.nsc-grp{display:flex;align-items:center;gap:1px;min-width:0}
.nsc-btn{flex:none;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-secondary,rgba(255,255,255,.75))}
/* Play button: same 28px container and hover as the transport neighbours; only its glyph differs. */
.nsc-btn.main{width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary,#fff)}
.nsc-main-ring{display:flex;align-items:center;justify-content:center;line-height:0}
.nsc-main-ring svg{display:block;width:20px;height:20px}
.nsc-main-ring circle{fill:none;stroke:var(--dsw-alias-label-secondary,rgba(255,255,255,.55));stroke-width:1.2}
.nsc-main-ring path,.nsc-main-ring rect{fill:var(--dsw-alias-label-primary,#fff);stroke:none}
.nsc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#fff)}
.nsc-btn:disabled{opacity:.4;cursor:default}
.nsc-btn.on{color:var(--dsw-alias-brand-primary,#ec4141)}
.nsc-btn.on:hover:not(:disabled){color:var(--dsw-alias-brand-primary,#ec4141)}
/* Every surface — the card and all of its popovers — reads the one material defined on :root. */
.nsc-pop{position:fixed;z-index:900;box-sizing:border-box;color:var(--nsc-on-surface,var(--dsw-alias-label-primary,#e6e6e6));font-size:13px;
  background:var(--nsc-material,var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-overlay,rgba(32,33,38,.98))));
  border:1px solid var(--nsc-material-border,var(--dsw-alias-border-l1,rgba(255,255,255,.09)));
  box-shadow:0 10px 32px rgba(0,0,0,.28)}
.nsc-pop *{box-sizing:border-box}
.nsc-list{width:300px;display:flex;flex-direction:column;border-radius:14px;overflow:hidden}
.nsc-list-head{flex:none;display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));font-weight:600}
.nsc-list-head span{font-weight:400;font-size:12px;color:var(--dsw-alias-label-secondary,#999)}
.nsc-list-body{flex:1;min-height:0;overflow-y:auto;padding:4px 0}
.nsc-empty{padding:28px 12px;text-align:center;color:var(--dsw-alias-label-secondary,#999)}
.nsc-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:6px 12px;cursor:pointer}
.nsc-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.nsc-row-idx{flex:none;width:20px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums;color:inherit;opacity:.6}
.nsc-row-cover{flex:none;width:34px;height:34px;border-radius:6px;object-fit:cover;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.15))}
.nsc-row-info{flex:1;min-width:0}
.nsc-row-name,.nsc-row-sub{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nsc-row-sub{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary,#999)}
.nsc-row.cur .nsc-row-name,.nsc-row.cur .nsc-row-idx{color:var(--nsc-accent,var(--dsw-alias-brand-primary,#ec4141))}
.nsc-row-dur{flex:none;font-size:11px;font-variant-numeric:tabular-nums;color:inherit;opacity:.6}
.nsc-vol{display:flex;align-items:center;gap:8px;width:176px;padding:6px 10px 6px 6px;border-radius:10px}
.nsc-vol input{flex:1;min-width:0;margin:0;cursor:pointer;accent-color:var(--dsw-alias-brand-primary,#ec4141)}
.nsc-vol-num{flex:none;width:28px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#999)}
/* While the card stands in for the closed player, ncm's own floating entries stay out of the way. */
html[${FLAG}] .ncm-wrap .ncm-disc{display:none !important}
html[${FLAG}] .ncm-wrap .ncm-win.mini{display:none !important}
`

    /** Keep a fixed-position popup glued to an anchor element while the sidebar moves or resizes. */
    function useAnchorRect(anchorRef, enabled) {
      const [rect, setRect] = useState(null)
      useLayoutEffect(() => {
        if (!enabled) return undefined
        let last = ''
        const measure = () => {
          const el = anchorRef.current
          if (!el) return
          const r = el.getBoundingClientRect()
          const key = [r.left, r.top, r.right, r.bottom, window.innerWidth, window.innerHeight].map(Math.round).join(',')
          if (key === last) return
          last = key
          setRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width })
        }
        measure()
        window.addEventListener('resize', measure)
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        if (ro && anchorRef.current) ro.observe(anchorRef.current)
        // Sidebar collapse/width transitions move the anchor without resizing it.
        const timer = setInterval(measure, 300)
        return () => { window.removeEventListener('resize', measure); if (ro) ro.disconnect(); clearInterval(timer) }
      }, [enabled])
      return rect
    }

    function QueuePopup({ anchorRef, snap, accent }) {
      const rect = useAnchorRect(anchorRef, true)
      const bodyRef = useRef(null)
      const rootRef = useRef(null)
      // Paint with the card's own computed colours, forced past any skin rule: same material, always.
      useLayoutEffect(() => {
        const el = rootRef.current
        const card = anchorRef.current
        if (!el || !card) return
        const cs = getComputedStyle(card)
        el.style.setProperty('background', cs.backgroundColor, 'important')
        el.style.setProperty('border-color', cs.borderTopColor, 'important')
        el.style.setProperty('color', cs.color, 'important')
      })
      // Bring the current track into view when the list opens and whenever the track changes.
      useEffect(() => {
        const body = bodyRef.current
        if (!body) return
        const cur = body.querySelector('.nsc-row.cur')
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' })
      }, [snap.index, !!rect])
      if (!rect) return null
      // About a third of the window: the queue is a peek, not a full-page panel.
      const preferred = Math.round(window.innerHeight / 3)
      const height = Math.max(168, Math.min(preferred, rect.bottom - 8))
      const style = {
        left: Math.round(rect.right + 10) + 'px',
        top: Math.round(Math.max(8, rect.bottom - height)) + 'px',
        height: Math.round(Math.min(height, rect.bottom - 8)) + 'px',
      }
      if (accent) style['--nsc-accent'] = accent
      const queue = snap.queue
      return ReactDOM.createPortal(h('div', { ref: rootRef, className: 'nsc-pop nsc-list', style, role: 'dialog', 'aria-label': '播放列表' }, [
        h('div', { key: 'head', className: 'nsc-list-head' }, ['播放列表', h('span', { key: 'n' }, '(' + queue.length + ')')]),
        h('div', { key: 'body', className: 'nsc-list-body', ref: bodyRef },
          queue.length === 0
            ? h('div', { className: 'nsc-empty' }, '队列为空')
            : queue.map((s, i) => {
              const cur = i === snap.index
              return h('button', {
                key: 'q' + s.id + '_' + i,
                type: 'button',
                className: 'nsc-row' + (cur ? ' cur' : ''),
                title: s.name + (s.artists ? ' - ' + s.artists : ''),
                'aria-current': cur ? 'true' : undefined,
                onClick: () => actions.playAt(i),
              }, [
                h('span', { key: 'i', className: 'nsc-row-idx' }, cur ? (snap.playing ? '▶' : '❚❚') : String(i + 1)),
                s.cover ? h('img', { key: 'c', className: 'nsc-row-cover', src: s.cover, alt: '', loading: 'lazy' }) : h('span', { key: 'c', className: 'nsc-row-cover' }),
                h('span', { key: 't', className: 'nsc-row-info' }, [
                  h('span', { key: 'n', className: 'nsc-row-name' }, s.name),
                  h('span', { key: 'a', className: 'nsc-row-sub' }, s.artists || s.album || ''),
                ]),
                h('span', { key: 'd', className: 'nsc-row-dur' }, fmt(s.duration)),
              ])
            })),
      ]), document.body)
    }

    function VolumePopup({ anchorRef, snap, onClose }) {
      const rect = useAnchorRect(anchorRef, true)
      const popRef = useRef(null)
      useEffect(() => {
        const onDown = e => {
          if (popRef.current && popRef.current.contains(e.target)) return
          if (anchorRef.current && anchorRef.current.contains(e.target)) return
          onClose()
        }
        const onKey = e => { if (e.key === 'Escape') onClose() }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
      }, [onClose])
      // Same material as the card, copied from the card itself (before any early return).
      useLayoutEffect(() => {
        const el = popRef.current
        const card = anchorRef.current && anchorRef.current.closest ? anchorRef.current.closest('.nsc-card') : null
        if (!el || !card) return
        const cs = getComputedStyle(card)
        el.style.setProperty('background', cs.backgroundColor, 'important')
        el.style.setProperty('border-color', cs.borderTopColor, 'important')
        el.style.setProperty('color', cs.color, 'important')
      })
      if (!rect) return null
      const value = snap.muted ? 0 : snap.vol
      const left = Math.max(8, Math.min(window.innerWidth - 184, rect.left + rect.width / 2 - 88))
      const style = { left: Math.round(left) + 'px', bottom: Math.round(window.innerHeight - rect.top + 6) + 'px' }
      return ReactDOM.createPortal(h('div', { ref: popRef, className: 'nsc-pop nsc-vol', style, role: 'dialog', 'aria-label': '音量' }, [
        h('button', { key: 'm', type: 'button', className: 'nsc-btn', title: snap.muted ? '取消静音' : '静音', onClick: actions.toggleMute },
          h(Ico, { d: snap.muted || snap.vol === 0 ? ICONS.volx : ICONS.vol, size: 16 })),
        h('input', { key: 'r', type: 'range', min: 0, max: 1, step: 0.01, value, 'aria-label': '音量', onChange: e => actions.setVolume(Number(e.target.value)) }),
        h('span', { key: 'n', className: 'nsc-vol-num' }, Math.round(value * 100)),
      ]), document.body)
    }

    /** Resolve any CSS colour to `#rrggbb` — a colour input only accepts hex. */
    function toHex (color) {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;left:-9999px;top:0'
      probe.style.color = color
      document.body.appendChild(probe)
      const parsed = rgba(getComputedStyle(probe).color)
      probe.remove()
      if (!parsed) return '#33333a'
      const hex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
      return '#' + hex(parsed.r) + hex(parsed.g) + hex(parsed.b)
    }

    /**
     * The plugin's own configuration page, shown by the Plugins panel for this row
     * (`plugins.row.config` keyed `bundle#row`). Edits this row's Config through the
     * settings service, and mirrors the value into the card's store.
     */
    function ConfigPage({ ctx, view }) {
      const [state, setState] = useState({ loading: true, value: {}, saving: false, error: '' })
      const alive = useRef(true)
      useEffect(() => () => { alive.current = false }, [])

      const load = () => {
        readRowConfig(ctx).then(cfg => {
          if (!alive.current) return
          publishConfig(cfg.value)
          setState({ loading: false, value: cfg.value, saving: false, error: '' })
        }).catch(err => {
          if (alive.current) setState({ loading: false, value: {}, saving: false, error: (err && err.message) || String(err) })
        })
      }
      useEffect(load, [])

      const adaptive = state.value.adaptiveColor === true
      const customColor = customColorOf(state.value)

      /** Persist one field, mirroring the result into the card. */
      const save = (patch, revert) => {
        setState(s => Object.assign({}, s, { saving: true, error: '', value: Object.assign({}, s.value, patch) }))
        writeRowConfig(ctx, patch).then(value => {
          if (!alive.current) return
          publishConfig(value)
          setState({ loading: false, value, saving: false, error: '' })
        }).catch(err => {
          if (!alive.current) return
          setState(s => Object.assign({}, s, {
            saving: false,
            error: (err && err.message) || String(err),
            value: Object.assign({}, s.value, revert || {}),
          }))
        })
      }
      const toggle = () => save({ adaptiveColor: !adaptive }, { adaptiveColor: adaptive })

      const desc = '卡片背景与歌词色跟随封面主色（Material 3 色板）。关闭时沿用当前主题配色。'
      // A row's summary view is one line under the row title.
      if (view === 'summary') {
        return h('span', null, '海报取色：' + (adaptive ? '开' : '关') + '　背景色：' + (customColor || '自动'))
      }
      return h('div', { className: 'nsc-cfg' }, [
        h('div', { key: 'head', className: 'nsc-cfg-head' }, [
          h('h3', { key: 'h', className: 'nsc-cfg-title' }, '外观'),
          state.loading ? h('span', { key: 'l', className: 'nsc-cfg-note' }, '读取中…') : null,
          state.error ? h('span', { key: 'e', className: 'nsc-cfg-error', role: 'alert' }, state.error) : null,
        ]),
        h('div', { key: 'row', className: 'nsc-cfg-row' }, [
          h('div', { key: 'text', className: 'nsc-cfg-text' }, [
            h('div', { key: 'name', className: 'nsc-cfg-name' }, '海报取色'),
            h('div', { key: 'desc', className: 'nsc-cfg-desc' }, desc),
          ]),
          h('button', {
            key: 'switch',
            type: 'button',
            role: 'switch',
            'aria-checked': adaptive ? 'true' : 'false',
            'aria-label': '海报取色',
            title: adaptive ? '关闭海报取色' : '开启海报取色',
            className: 'nsc-switch' + (adaptive ? ' on' : ''),
            disabled: state.loading || state.saving,
            onClick: toggle,
          }, h('i')),
        ]),
        h('div', { key: 'color', className: 'nsc-cfg-row' }, [
          h('div', { key: 'text', className: 'nsc-cfg-text' }, [
            h('div', { key: 'name', className: 'nsc-cfg-name' }, '背景色'),
            h('div', { key: 'desc', className: 'nsc-cfg-desc' }, customColor
              ? '手动指定：卡片与播放列表都用这个颜色（文字色按明暗自动反转）。'
              : '自动：跟随当前主题；开启「海报取色」时跟随封面主色。'),
          ]),
          h('input', {
            key: 'picker',
            type: 'color',
            className: 'nsc-cfg-color',
            'aria-label': '背景色',
            title: '选择背景色',
            value: customColor ? toHex(customColor) : '#33333a',
            disabled: state.loading || state.saving,
            onChange: e => save({ backgroundColor: e.target.value }),
          }),
          h('button', {
            key: 'auto',
            type: 'button',
            className: 'nsc-cfg-btn',
            disabled: state.loading || state.saving || !customColor,
            title: '恢复自动背景',
            onClick: () => save({ backgroundColor: '' }, { backgroundColor: customColor }),
          }, '自动'),
        ]),
      ])
    }

    /**
     * CSS custom properties for the card surface: the opaque container tone by default, replaced
     * by the M3 poster palette when that switch is on. Always returns a plain object — the card
     * style must never depend on a nullable accumulator.
     */
    function surfaceVars (cardSurface, palette) {
      const vars = {}
      if (cardSurface) vars['--nsc-surface'] = cardSurface
      if (palette) {
        vars['--nsc-surface'] = palette.surface
        vars['--nsc-border'] = palette.border
        vars['--nsc-accent'] = palette.accent
      }
      return vars
    }

    function SideCard({ wide, ctx }) {
      const [snap, setSnap] = useState(null)
      const [listOpen, setListOpen] = useState(false)
      const [volOpen, setVolOpen] = useState(false)
      const [cardSurface, setCardSurface] = useState(() => lastSurface)
      const [notice, setNotice] = useState('')
      const [mq, setMq] = useState(null)
      // The switches live on the plugin's own page (Plugins panel); the card only mirrors them.
      const [adaptive, setAdaptive] = useState(() => adaptiveOf(configStore.value))
      const [customColor, setCustomColor] = useState(() => customColorOf(configStore.value))
      const [palette, setPalette] = useState(null)
      const [darkTheme, setDarkTheme] = useState(true)
      const cardRef = useRef(null)
      const listBtnRef = useRef(null)
      const volBtnRef = useRef(null)
      const lrcRef = useRef(null)
      const noticeTimer = useRef(null)

      useEffect(() => {
        let alive = true
        const sync = () => {
          if (!alive) return
          setAdaptive(adaptiveOf(configStore.value))
          setCustomColor(customColorOf(configStore.value))
        }
        configStore.listeners.add(sync)
        if (!configStore.ready) readRowConfig(ctx).then(cfg => {
          if (alive) publishConfig(cfg.value)
        }).catch(() => { })
        return () => { alive = false; configStore.listeners.delete(sync) }
      }, [])

      useEffect(() => {
        let last = null
        const tick = () => {
          let next = null
          try { next = readSnapshot() } catch (err) { next = null }
          if (!sameSnapshot(last, next)) { last = next; setSnap(next) }
        }
        tick()
        const timer = setInterval(tick, POLL_MS)
        return () => { clearInterval(timer); if (noticeTimer.current) clearTimeout(noticeTimer.current) }
      }, [])

      const active = !!(wide && snap && snap.active)
      // While the card is shown, it replaces ncm-player's floating mini bar.
      useEffect(() => {
        if (!active) return undefined
        document.documentElement.setAttribute(FLAG, '')
        return () => document.documentElement.removeAttribute(FLAG)
      }, [active])
      useEffect(() => { if (!active) { setListOpen(false); setVolOpen(false) } }, [active])

      // Which tonal step the adaptive palette uses depends on the surrounding theme's lightness;
      // the card's own container colour is derived from it either way (opaque in every skin).
      // A layout effect, so the colour exists before the browser paints the freshly mounted card.
      // Re-measured on a few timers and on theme changes: right after a page load the skin may not
      // have painted its layers yet, and a measurement taken then is white (a white card with the
      // theme's light text — unreadable).
      useLayoutEffect(() => {
        if (!active) return undefined
        const measure = () => {
          const el = cardRef.current
          if (!el) return
          const parent = el.parentElement || document.body
          // Light text implies a dark theme — only used when no ancestor paints an opaque background.
          const darkHint = (luminance(getComputedStyle(el.parentElement || el).color) ?? 0) > 0.5
          const base = surfaceColor(parent, darkHint)
          const dark = (luminance(base) ?? 1) < 0.5
          const tone = containerTone(base, dark)
          setDarkTheme(dark)
          if (tone) { lastSurface = tone; setCardSurface(tone) }
        }
        measure()
        const timers = [120, 400, 1200, 2500].map(ms => setTimeout(measure, ms))
        const observer = typeof MutationObserver === 'function'
          ? new MutationObserver(() => measure())
          : null
        if (observer) {
          observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
          if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
        }
        window.addEventListener('resize', measure)
        // Refresh the config each time the card appears (it may have changed elsewhere).
        readRowConfig(ctx).then(cfg => publishConfig(cfg.value)).catch(() => { })
        return () => {
          timers.forEach(clearTimeout)
          if (observer) observer.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [active])

      /**
       * One material for the card and every popover: written to `:root` so portals inherit it,
       * and forced inline (`!important`) so a skin's own card/popover rules cannot split the two.
       * Layout effect again — no uncoloured first frame.
       */
      const surface = customColor || (palette ? palette.surface : cardSurface)
      const border = palette && !customColor ? palette.border : ''
      useLayoutEffect(() => {
        const root = document.documentElement
        const el = cardRef.current
        if (surface) root.style.setProperty('--nsc-material', surface)
        else root.style.removeProperty('--nsc-material')
        if (border) root.style.setProperty('--nsc-material-border', border)
        else root.style.removeProperty('--nsc-material-border')
        if (el && surface) {
          el.style.setProperty('background', 'var(--nsc-material)', 'important')
          el.style.setProperty('border-color', 'var(--nsc-material-border, var(--dsw-alias-border-l1, rgba(255,255,255,.09)))', 'important')
          // Text follows the surface: a light card must never keep a dark theme's light text.
          const themeText = getComputedStyle(el.parentElement || document.body).color
          const surfaceDark = (luminance(toRgbString(surface) || surface) ?? 1) < 0.5
          const textLight = (luminance(themeText) ?? 1) > 0.5
          const onSurface = surfaceDark === textLight ? themeText : (surfaceDark ? 'rgb(232,232,234)' : 'rgb(27,27,31)')
          el.style.setProperty('color', onSurface, 'important')
          root.style.setProperty('--nsc-on-surface', onSurface)
        }
      }, [surface, border, customColor])
      useEffect(() => () => {
        const root = document.documentElement
        ;['--nsc-material', '--nsc-material-border', '--nsc-on-surface'].forEach(name => root.style.removeProperty(name))
      }, [])

      // Adaptive palette from the current cover. Off (or no cover) leaves the card on theme colors.
      // The palette is cached per cover, so reopening the card paints the right colour immediately
      // instead of flashing the neutral container tone while the cover is sampled again.
      const coverUrl = snap && snap.song ? snap.song.cover : ''
      useLayoutEffect(() => {
        if (!adaptive || !active || !coverUrl) { setPalette(null); return undefined }
        const key = coverUrl + (darkTheme ? '|dark' : '|light')
        const cached = paletteCache.get(key)
        if (cached) setPalette(cached)
        let alive = true
        coverSeed(coverUrl).then(seed => {
          if (!alive) return
          if (!seed) { if (!cached) setPalette(null); return }
          const value = paletteFor(seed, darkTheme)
          paletteCache.set(key, value)
          setPalette(value)
        })
        return () => { alive = false }
      }, [adaptive, active, coverUrl, darkTheme])

      // The queue popover closes on any pointer press outside it, and on Escape —
      // clicking anywhere else in DSH (or another sidebar card) must not leave it floating.
      useEffect(() => {
        if (!listOpen) return undefined
        const onDown = e => {
          const list = document.querySelector('.nsc-list')
          if (list && list.contains(e.target)) return
          if (listBtnRef.current && listBtnRef.current.contains(e.target)) return
          setListOpen(false)
        }
        const onKey = e => { if (e.key === 'Escape') setListOpen(false) }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
      }, [listOpen])

      const lyric = active && snap.song && snap.lyricIdx >= 0 ? snap.lyrics[snap.lyricIdx] : null
      const lyricText = lyric ? lyric.text : ''
      // Long lyric lines scroll sideways (follows ncm-player's "迷你歌词滚动" setting).
      useLayoutEffect(() => {
        const el = lrcRef.current
        const box = el && el.parentElement
        if (!el || !box || !snap || !snap.scroll || !lyricText) { setMq(null); return }
        const full = el.scrollWidth
        if (full > box.clientWidth + 2) {
          const dist = full - box.clientWidth + 16
          setMq({ dist: -dist + 'px', dur: Math.max(6, Math.round(dist / 14)) + 's' })
        } else setMq(null)
      }, [lyricText, snap && snap.scroll, active])

      const closeVol = useCallback(() => setVolOpen(false), [])
      const flash = text => {
        setNotice(text)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 2500)
      }

      if (!active) return null
      const song = snap.song
      const hasQueue = snap.queue.length > 0

      let lrcNode
      if (notice) lrcNode = h('div', { className: 'nsc-lrc dim' }, h('span', { className: 'nsc-lrc-line' }, notice))
      else if (lyric) {
        // Two languages when the track has a translation and the player shows translations; otherwise one.
        const trans = snap.showTrans && lyric.tr ? lyric.tr : ''
        lrcNode = h('div', { className: 'nsc-lrc nsc-lrc-main', title: lyric.text + (trans ? '\n' + trans : '') }, [
          h('span', {
            key: 'l' + snap.lyricIdx,
            ref: lrcRef,
            className: 'nsc-lrc-line' + (mq ? ' mq' : ''),
            style: mq ? { '--nsc-mq-mx': mq.dist, '--nsc-mq-dur': mq.dur } : undefined,
          }, lyric.text),
          trans ? h('span', { key: 't', className: 'nsc-lrc-tr', title: trans }, trans) : null,
        ])
      } else {
        const idle = !song ? '在播放列表中选一首歌' : snap.lyrics.length ? '♪' : '暂无歌词'
        lrcNode = h('div', { className: 'nsc-lrc dim' }, h('span', { className: 'nsc-lrc-line', ref: lrcRef }, idle))
      }

      const btn = (key, title, icon, onClick, opts) => h('button', Object.assign({
        key, type: 'button', title, 'aria-label': title,
        className: 'nsc-btn' + (opts && opts.on ? ' on' : '') + (opts && opts.cls ? ' ' + opts.cls : ''),
        disabled: !!(opts && opts.disabled),
        onClick,
      }, opts && opts.extra), h(Ico, { d: icon, size: (opts && opts.size) || 18, fill: !!(opts && opts.fill) }))
      const grp = (key, children) => h('div', { key, className: 'nsc-grp' }, children)

      const likeTitle = !snap.loggedIn ? '登录后可收藏（打开设置）' : snap.liked ? '取消收藏' : '收藏'
      const onLike = () => {
        actions.like().then(msg => { if (msg) flash(msg) }).catch(err => flash('收藏失败: ' + ((err && err.message) || err)))
      }

      // `nsc-pinned` keeps the control row open while one of its popups is in use,
      // even though the pointer then sits outside the card.
      const pinned = listOpen || volOpen
      // `--nsc-surface`/`--nsc-border` stay as CSS fallbacks; `--nsc-accent` tints the lyrics.
      const paletteVars = surfaceVars(customColor || '', palette)
      return h('div', {
        ref: cardRef,
        className: 'nsc-card' + (pinned ? ' nsc-pinned' : ''),
        style: paletteVars,
        role: 'group',
        'aria-label': '网易云音乐',
      }, [
        h('div', { key: 'top', className: 'nsc-top' }, [
          h('button', { key: 'cover', type: 'button', className: 'nsc-cover', title: '展开播放器', 'aria-label': '展开播放器', onClick: () => actions.expand() },
            song && song.cover ? h('img', { src: song.cover, alt: '' }) : h(Ico, { d: ICONS.music, size: 20 })),
          h('div', { key: 'info', className: 'nsc-info' }, [
            h('div', { key: 't', className: 'nsc-title', title: song ? song.name + (song.artists ? ' - ' + song.artists : '') : undefined }, [
              h('span', { key: 'n', className: 'nsc-name' }, song ? song.name : '未在播放'),
              song && song.artists ? h('span', { key: 'a', className: 'nsc-artist' }, song.artists) : null,
            ]),
            h(React.Fragment, { key: 'l' }, lrcNode),
          ]),
        ]),
        h('div', { key: 'ctl', className: 'nsc-ctl' }, [
          // Transport cluster: previous / play-pause (ringed) / next.
          grp('nav', [
            btn('prev', '上一首', ICONS.prev, actions.prev, { disabled: !hasQueue, size: 17 }),
            h('button', {
              key: 'play', type: 'button',
              title: snap.playing ? '暂停' : '播放',
              'aria-label': snap.playing ? '暂停' : '播放',
              className: 'nsc-btn main',
              disabled: !song,
              onClick: actions.toggle,
            }, h('span', { className: 'nsc-main-ring' }, h(MainGlyph, { playing: snap.playing }))),
            btn('next', '下一首', ICONS.next, actions.next, { disabled: !hasQueue, size: 17 }),
          ]),
          // Secondary cluster: favourite / volume / queue / back-to-popup.
          grp('acts', [
            btn('like', likeTitle, ICONS.heart, onLike, { disabled: !song || snap.likeBusy, on: snap.liked, fill: snap.liked, size: 16 }),
            btn('vol', '音量', snap.muted || snap.vol === 0 ? ICONS.volx : ICONS.vol, () => setVolOpen(v => !v), { on: volOpen, size: 16, extra: { ref: volBtnRef, 'aria-expanded': volOpen } }),
            btn('list', listOpen ? '隐藏播放列表' : '显示播放列表', ICONS.list, () => setListOpen(v => !v), { on: listOpen, size: 16, extra: { ref: listBtnRef, 'aria-expanded': listOpen } }),
            btn('expand', '打开播放器窗口', ICONS.expand, () => actions.expand(), { size: 16 }),
          ]),
        ]),
        listOpen ? h(QueuePopup, {
          key: 'list',
          anchorRef: cardRef,
          snap,
          // Background/border come from --nsc-material, so the queue is the card's own material.
          accent: palette ? palette.accent : '',
        }) : null,
        volOpen ? h(VolumePopup, { key: 'volpop', anchorRef: volBtnRef, snap, onClose: closeVol }) : null,
      ])
    }

    /** A render failure stays inside the card and never blanks the sidebar foot. */
    class Guard extends React.Component {
      constructor(props) { super(props); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      componentDidCatch(error) {
        console.error(TAG, 'card crashed', error)
        document.documentElement.removeAttribute(FLAG)
      }
      render() { return this.state.error ? null : this.props.children }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.id = 'dsh-plugin-ncm-sidecard-style'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove(); document.documentElement.removeAttribute(FLAG) }
        }, 'ncm-sidecard: styles')
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'ncm-sidecard',
          order: 10,
          label: '网易云音乐',
        }, props => h(Guard, null, h(SideCard, { wide: !!(props && props.wide), ctx }))))
        // The 海报取色 / 背景色 switches live on this row's own page in the Plugins panel.
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: ROW_CONFIG_KEY,
          label: ROW_CONFIG_LABEL,
        }, props => h(Guard, null, h(ConfigPage, { ctx, view: props && props.view }))))
        // Diagnostics: `__nscColors()` reports what the card and any open popover actually paint.
        window.__nscColors = () => {
          const pick = sel => {
            const el = document.querySelector(sel)
            if (!el) return null
            const cs = getComputedStyle(el)
            return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor }
          }
          return {
            material: getComputedStyle(document.documentElement).getPropertyValue('--nsc-material').trim(),
            card: pick('.nsc-card'),
            list: pick('.nsc-list'),
            volume: pick('.nsc-vol'),
          }
        }
        console.info(TAG, 'sidebar card + row config registered')
      },
    }
  },
})
