// TTL RUSH, the game inside the Neon Arcade cabinet.
//
// Keys pop up on the screen, each with a TTL ring that runs down. Hit a key
// before it expires: the faster, the more points. Five hits in a row raise
// the multiplier (up to x5). A key that expires replies (nil) and breaks the
// combo. A round lasts 20 seconds.
//
// The playfield is 600 x 800 logical pixels everywhere, so a phone and a
// desktop play exactly the same game (keys are ~48 px wide on a phone).

const W = 600
const H = 800
const ROUND_MS = 20_000
const HUD = 108
const R = 46
const FONT = '"Press Start 2P", monospace'
const C = { cyan: "#5cf6ff", magenta: "#ff4fd8", yellow: "#ffe45c", red: "#ff4438", green: "#7cff6b", white: "#f4f6ff" }
const ROW_COLORS = [C.yellow, C.cyan, C.magenta, C.green, C.white]
const KEY_GLYPH = [".###.......", "#...#######", "#...#...#.#", ".###......."]
const ATTRACT = [["title", 5600], ["scores", 6500], ["howto", 5600], ["demo", 9000]]
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches
const MUTE = new Proxy({}, { get: () => () => {} }) // the demo player plays silently

const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)
const fmt = (n) => n.toLocaleString("en-US")
const ordinal = (n) => n + (["TH", "ST", "ND", "RD"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "TH")

export class TTLRush {
  constructor(canvas, { sound, onOver, onState }) {
    this.cv = canvas
    this.ctx = canvas.getContext("2d")
    this.sound = sound
    this.onOver = onOver
    this.onState = onState
    this.scores = { today: [], alltime: [] }
    this.particles = []
    this.fx = []
    this.shake = 0
    this.flash = 0

    new ResizeObserver(() => this.resize()).observe(canvas)
    this.resize()
    canvas.addEventListener("pointerdown", (e) => this.tap(e))
    this.toAttract()
    requestAnimationFrame((t) => this.frame(t))
  }

  // ---------- public API ----------

  get idle() { return this.state === "attract" || this.state === "result" }

  get sfx() { return this.round?.demo ? MUTE : this.sound }

  setScores({ today = [], alltime = [] }) { this.scores = { today, alltime } }

  start() {
    if (!this.idle) return
    this.round = null
    this.setState("countdown")
    this.countFrom = performance.now()
    this.lastCount = null
  }

  showResult(game) {
    this.result = game
    this.setState("result")
    this.sound.saved()
    this.burst(W / 2, 330, C.yellow, 40)
  }

  toAttract() {
    this.round = null
    this.attract = { i: 0, from: performance.now() }
    this.setState("attract")
  }

  // ---------- state ----------

  setState(state) {
    this.state = state
    this.stateFrom = performance.now()
    this.onState?.(state)
  }

  newRound(demo) {
    return { demo, from: performance.now(), score: 0, combo: 0, best: 0, mult: 1, hits: 0, expired: 0, misses: 0, keys: [], next: 0 }
  }

  resize() {
    const box = this.cv.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.cv.width = Math.max(1, Math.round(box.width * dpr))
    this.cv.height = Math.max(1, Math.round(box.height * dpr))
    this.scale = this.cv.width / W
  }

  tap(e) {
    if (this.idle) return this.start()
    if (this.state !== "play") return
    e.preventDefault()
    const box = this.cv.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * W
    const y = ((e.clientY - box.top) / box.height) * H
    const key = this.round.keys
      .map((k) => ({ k, d: Math.hypot(k.x - x, k.y - y) }))
      .filter(({ k, d }) => d <= k.r + 12)
      .sort((a, b) => a.d - b.d)[0]?.k
    if (key) this.hit(key, performance.now())
    else this.miss(x, y)
  }

  // ---------- loop ----------

  frame(now) {
    const dt = Math.min(50, now - (this.last ?? now))
    this.last = now
    this.update(now, dt)
    this.draw(now)
    requestAnimationFrame((t) => this.frame(t))
  }

  update(now, dt) {
    if (this.state === "attract") {
      const [phase, duration] = ATTRACT[this.attract.i]
      if (phase === "demo") {
        this.round ??= this.newRound(true)
        this.play(now, dt)
      }
      if (now - this.attract.from > duration) {
        this.attract = { i: (this.attract.i + 1) % ATTRACT.length, from: now }
        this.round = null
      }
    } else if (this.state === "countdown") {
      const n = Math.floor((now - this.countFrom) / 700)
      if (n !== this.lastCount && n < 3) this.sound.tick()
      this.lastCount = n
      if (n >= 3) {
        this.sound.go()
        this.round = this.newRound(false)
        this.setState("play")
      }
    } else if (this.state === "play") {
      this.play(now, dt)
      if (now - this.round.from >= ROUND_MS) this.endRound(now)
    } else if (this.state === "over") {
      if (!this.overSent && now - this.stateFrom > 1300) {
        this.overSent = true
        const r = this.round
        this.onOver({ score: r.score, hits: r.hits, expired: r.expired, combo: r.best, misses: r.misses })
      }
    } else if (this.state === "result" && now - this.stateFrom > 9000) {
      this.toAttract()
    }

    this.particles = this.particles.filter((p) => (p.life -= dt) > 0)
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0009 * dt }
    this.fx = this.fx.filter((f) => now - f.at < f.dur)
    this.shake *= 0.86
    this.flash *= 0.85
  }

  play(now, dt) {
    const r = this.round
    const t = Math.min(1, (now - r.from) / ROUND_MS)

    // spawn: faster and shorter TTLs as the round goes on
    const maxAlive = t < 0.25 ? 2 : t < 0.6 ? 3 : 4
    if (now >= r.next && r.keys.length < maxAlive && t < 0.985) {
      const hot = t > 0.1 && Math.random() < 0.13
      const spot = this.freeSpot(r.keys)
      if (spot) r.keys.push({ ...spot, born: now, ttl: lerp(1550, 880, t) * (hot ? 0.72 : 1), hot, r: hot ? R * 0.88 : R })
      r.next = now + lerp(640, 340, t) * rand(0.8, 1.2)
    }

    // expire
    for (const k of [...r.keys]) {
      if (now - k.born >= k.ttl) {
        r.keys.splice(r.keys.indexOf(k), 1)
        r.expired++
        r.combo = 0
        r.mult = 1
        this.text("(nil)", k.x, k.y, C.red, 26, 900)
        this.fx.push({ kind: "implode", x: k.x, y: k.y, at: now, dur: 300, color: C.red })
        this.kick(3)
        this.sfx.nil()
      }
    }

    if (r.demo) this.bot(now, dt)
  }

  freeSpot(keys) {
    for (let i = 0; i < 24; i++) {
      const x = rand(R + 16, W - R - 16)
      const y = rand(HUD + R + 24, H - R - 24)
      if (keys.every((k) => Math.hypot(k.x - x, k.y - y) > k.r + R + 26)) return { x, y }
    }
    return null
  }

  hit(key, now) {
    const r = this.round
    const left = 1 - (now - key.born) / key.ttl
    r.keys.splice(r.keys.indexOf(key), 1)
    r.combo++
    r.hits++
    r.best = Math.max(r.best, r.combo)
    const mult = Math.min(5, 1 + Math.floor((r.combo - 1) / 5))
    if (mult > r.mult) {
      this.text(`COMBO x${mult}`, W / 2, HUD + 70, C.magenta, 34, 1000, true)
      this.sfx.combo()
    }
    r.mult = mult
    const points = ((key.hot ? 300 : 100) + Math.round((key.hot ? 200 : 100) * left)) * mult
    r.score += points

    const color = key.hot ? C.yellow : C.cyan
    this.burst(key.x, key.y, color, key.hot ? 34 : 18)
    this.fx.push({ kind: "ring", x: key.x, y: key.y, at: now, dur: 380, color })
    this.text(`+${points}`, key.x, key.y - 8, key.hot ? C.yellow : C.green, key.hot ? 26 : 20, 750)
    this.kick(key.hot ? 10 : 4)
    if (key.hot) { this.flash = 0.22; this.sfx.hot() } else this.sfx.hit(mult)
  }

  miss(x, y) {
    const r = this.round
    r.misses++
    r.combo = 0
    r.mult = 1
    this.text("MISS", x, y, "#8a90b8", 14, 500)
    this.sound.miss()
  }

  endRound(now) {
    this.round.keys = []
    this.overSent = false
    this.setState("over")
    this.sound.over()
    this.kick(6)
  }

  // Demo player for attract mode: a ghost cursor that hits most keys.
  bot(now, dt) {
    const r = this.round
    this.cursor ??= { x: W / 2, y: H / 2 }
    if (!this.aim || !r.keys.includes(this.aim.key)) {
      const key = r.keys.sort((a, b) => (a.born + a.ttl) - (b.born + b.ttl))[0]
      this.aim = key ? { key, at: key.born + key.ttl * rand(0.3, 0.75), fail: Math.random() < 0.12 } : null
    }
    if (!this.aim) return
    const { key } = this.aim
    this.cursor.x += (key.x - this.cursor.x) * Math.min(1, dt * 0.012)
    this.cursor.y += (key.y - this.cursor.y) * Math.min(1, dt * 0.012)
    if (!this.aim.fail && now >= this.aim.at) { this.hit(key, now); this.aim = null }
  }

  // ---------- effects ----------

  text(str, x, y, color, size, dur, center = false) {
    this.fx.push({ kind: "text", str, x, y, color, size, dur, at: performance.now(), center })
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2)
      const v = rand(0.12, 0.42)
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.08, life: rand(380, 760), max: 760, size: rand(4, 9), color })
    }
  }

  kick(amount) { if (!CALM) this.shake = Math.max(this.shake, amount) }

  // ---------- drawing ----------

  draw(now) {
    const c = this.ctx
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    c.globalCompositeOperation = "source-over"
    c.fillStyle = "rgba(6, 9, 18, 0.42)" // phosphor persistence: moving things leave a short trail
    c.fillRect(0, 0, W, H)

    c.save()
    if (this.shake > 0.4) c.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake)

    if (this.state === "attract") this.drawAttract(now)
    else if (this.state === "countdown") this.drawCountdown(now)
    else if (this.state === "play") this.drawPlay(now)
    else if (this.state === "over") this.drawOver(now)
    else if (this.state === "result") this.drawResult(now)

    this.drawEffects(now)
    c.restore()

    if (this.flash > 0.01 && !CALM) {
      c.fillStyle = `rgba(255, 228, 92, ${this.flash})`
      c.fillRect(0, 0, W, H)
    }
  }

  write(str, x, y, size, color, { align = "center", glow = 12, alpha = 1 } = {}) {
    const c = this.ctx
    c.font = `${size}px ${FONT}`
    c.textAlign = align
    c.textBaseline = "middle"
    c.globalAlpha = alpha
    c.shadowColor = color
    c.shadowBlur = glow
    c.fillStyle = color
    c.fillText(str, x, y)
    c.shadowBlur = 0
    c.globalAlpha = 1
  }

  blink(now, period = 520) { return Math.floor(now / period) % 2 === 0 }

  drawKey(k, now, { frozen = null } = {}) {
    const c = this.ctx
    const age = now - k.born
    const left = frozen ?? Math.max(0, 1 - age / k.ttl)
    const pop = Math.min(1, age / 120)
    const s = 0.55 + 0.45 * (1 - Math.pow(1 - pop, 3))
    const ringColor = k.hot ? C.yellow : left < 0.3 ? C.red : C.cyan

    c.save()
    c.translate(k.x, k.y)
    c.scale(s, s)

    // track and TTL arc
    c.lineWidth = 7
    c.strokeStyle = "rgba(92, 246, 255, 0.14)"
    c.beginPath(); c.arc(0, 0, k.r, 0, Math.PI * 2); c.stroke()
    c.shadowColor = ringColor
    c.shadowBlur = 16
    c.strokeStyle = ringColor
    c.beginPath(); c.arc(0, 0, k.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); c.stroke()

    if (k.hot) { // hot key: a second ring and four sparks turning around it
      c.lineWidth = 2
      c.beginPath(); c.arc(0, 0, k.r + 9, 0, Math.PI * 2); c.stroke()
      c.fillStyle = C.yellow
      for (let i = 0; i < 4; i++) {
        const a = now / 260 + (i * Math.PI) / 2
        c.fillRect(Math.cos(a) * (k.r + 9) - 4, Math.sin(a) * (k.r + 9) - 4, 8, 8)
      }
    }

    // the key glyph, 4 px per pixel
    c.fillStyle = k.hot ? C.yellow : C.white
    c.shadowColor = k.hot ? C.yellow : C.cyan
    c.shadowBlur = 10
    const px = 4
    const ox = -(KEY_GLYPH[0].length * px) / 2
    const oy = -(KEY_GLYPH.length * px) / 2
    KEY_GLYPH.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") c.fillRect(ox + x * px, oy + y * px, px, px) }))
    c.restore()
  }

  drawHud(now, r) {
    const left = Math.max(0, ROUND_MS - (now - r.from))
    const hurry = left < 5000
    this.write("SCORE", 30, 30, 13, C.cyan, { align: "left", glow: 6, alpha: 0.85 })
    this.write(fmt(r.score), 30, 66, 30, C.white, { align: "left", glow: 10 })
    this.write("TIME", W - 30, 30, 13, C.cyan, { align: "right", glow: 6, alpha: 0.85 })
    this.write((left / 1000).toFixed(1), W - 30, 66, 30, hurry ? C.red : C.white, { align: "right", glow: hurry ? 16 : 10, alpha: hurry && this.blink(now, 250) ? 0.6 : 1 })
    if (r.mult > 1) this.write(`x${r.mult}`, W / 2, 56, 30, C.magenta, { glow: 18 })

    const c = this.ctx
    c.fillStyle = "rgba(92, 246, 255, 0.12)"
    c.fillRect(30, 92, W - 60, 6)
    c.fillStyle = hurry ? C.red : C.cyan
    c.shadowColor = c.fillStyle
    c.shadowBlur = 10
    c.fillRect(30, 92, (W - 60) * (left / ROUND_MS), 6)
    c.shadowBlur = 0
  }

  drawPlay(now) {
    const r = this.round
    this.drawHud(now, r)
    for (const k of r.keys) this.drawKey(k, now)
  }

  drawCountdown(now) {
    const elapsed = now - this.countFrom
    const n = Math.min(2, Math.floor(elapsed / 700))
    const p = (elapsed % 700) / 700
    this.write("GET READY", W / 2, 250, 22, C.cyan, { glow: 10 })
    this.write(String(3 - n), W / 2, 420, Math.round(lerp(200, 130, p)), C.yellow, { glow: 26, alpha: 1 - p * 0.6 })
    this.write("HIT EVERY KEY", W / 2, 580, 16, C.white, { glow: 6, alpha: 0.8 })
    this.write("BEFORE ITS TTL RUNS OUT", W / 2, 612, 16, C.white, { glow: 6, alpha: 0.8 })
  }

  drawOver(now) {
    const word = "GAME OVER"
    const t = now - this.stateFrom
    ;[...word].forEach((ch, i) => {
      const y = 330 + Math.sin(t / 180 + i * 0.6) * 10
      this.write(ch, W / 2 - (word.length * 44) / 2 + 22 + i * 44, y, 44, i % 2 ? C.cyan : C.magenta, { glow: 20 })
    })
    this.write(fmt(this.round.score), W / 2, 450, 40, C.yellow, { glow: 18 })
  }

  drawResult(now) {
    const g = this.result
    const top = g.rank_today === 1 || g.rank_all === 1
    this.write(top ? "NEW HIGH SCORE!" : "SCORE SAVED", W / 2, 170, top ? 30 : 28, top ? [C.yellow, C.magenta, C.cyan][Math.floor(now / 160) % 3] : C.green, { glow: 18 })
    this.write(`${g.i}  ${fmt(g.s)}`, W / 2, 260, 34, C.white, { glow: 12 })
    this.write(`GAME #${fmt(g.n)} IN REDIS`, W / 2, 330, 16, C.cyan, { glow: 8 })
    this.write("TODAY", 120, 430, 22, C.yellow, { align: "left" })
    this.write(ordinal(g.rank_today), W - 120, 430, 30, C.yellow, { align: "right", glow: 16 })
    this.write("ALL-TIME", 120, 500, 22, C.magenta, { align: "left" })
    this.write(ordinal(g.rank_all), W - 120, 500, 30, C.magenta, { align: "right", glow: 16 })
    this.write("ZREVRANK", W / 2, 560, 12, C.white, { glow: 0, alpha: 0.5 })
    if (this.blink(now)) this.write("PRESS START", W / 2, 680, 22, C.white, { glow: 12 })
  }

  drawAttract(now) {
    const [phase] = ATTRACT[this.attract.i]
    const t = now - this.attract.from
    if (phase === "title") this.drawTitle(now, t)
    if (phase === "scores") this.drawScores(now, t)
    if (phase === "howto") this.drawHowTo(now, t)
    if (phase === "demo") {
      this.drawPlay(now)
      if (this.blink(now, 600)) this.write("DEMO PLAY", W / 2, 150, 20, C.magenta, { glow: 14 })
      this.write("PRESS START", W / 2, H - 40, 16, C.white, { glow: 8, alpha: 0.7 })
      if (this.cursor) this.drawCursor(this.cursor)
    }
  }

  drawTitle(now, t) {
    const bob = Math.sin(now / 500) * 6
    this.write("TTL", W / 2, 200 + bob, 112, C.magenta, { glow: 30 })
    this.write("RUSH", W / 2, 330 + bob, 112, C.cyan, { glow: 30 })
    // three keys running down their TTL, forever
    ;[[150, 500, 0], [300, 540, 900], [450, 500, 1800]].forEach(([x, y, offset]) => {
      const ttl = 2400
      const age = (now + offset) % ttl
      this.drawKey({ x, y, r: R, hot: x === 300, born: now - age, ttl }, now)
    })
    this.write("FREE PLAY", W / 2, 650, 20, C.yellow, { glow: 10 })
    if (this.blink(now)) this.write("PRESS START", W / 2, 700, 24, C.white, { glow: 14 })
    this.write("A REDIS-POWERED ARCADE", W / 2, 762, 12, C.cyan, { glow: 4, alpha: 0.6 })
  }

  drawScores(now, t) {
    const table = (title, rows, y0, color) => {
      this.write(title, W / 2, y0, 22, color, { glow: 14 })
      if (!rows.length) return this.write("NO SCORE YET", W / 2, y0 + 60, 16, C.white, { alpha: 0.6 })
      rows.slice(0, 5).forEach((row, i) => {
        if (t < 250 + i * 160) return
        const y = y0 + 54 + i * 42
        const col = ROW_COLORS[i]
        this.write(ordinal(i + 1), 70, y, 20, col, { align: "left", glow: 8 })
        this.write(row.i, 250, y, 20, col, { align: "left", glow: 8 })
        this.write(fmt(row.s), W - 70, y, 20, col, { align: "right", glow: 8 })
      })
    }
    table("TODAY'S BEST", this.scores.today, 110, C.yellow)
    table("ALL-TIME", this.scores.alltime, 440, C.magenta)
  }

  drawHowTo(now, t) {
    this.write("HOW TO PLAY", W / 2, 110, 26, C.yellow, { glow: 14 })
    const cycle = (offset) => now - ((now + offset) % 2200)
    this.drawKey({ x: 110, y: 240, r: R, hot: false, born: cycle(0), ttl: 2200 }, now)
    this.write("HIT A KEY", 190, 222, 18, C.cyan, { align: "left" })
    this.write("100 + SPEED", 190, 258, 14, C.white, { align: "left", alpha: 0.8 })
    this.drawKey({ x: 110, y: 370, r: R * 0.88, hot: true, born: cycle(700), ttl: 2200 }, now)
    this.write("HOT KEY", 190, 352, 18, C.yellow, { align: "left" })
    this.write("300 + SPEED", 190, 388, 14, C.white, { align: "left", alpha: 0.8 })
    this.write("(nil)", 110, 500, 22, C.red, { glow: 16 })
    this.write("EXPIRED KEY", 190, 482, 18, C.red, { align: "left" })
    this.write("COMBO LOST", 190, 518, 14, C.white, { align: "left", alpha: 0.8 })
    this.write("5 HITS IN A ROW", W / 2, 610, 16, C.magenta, { glow: 8 })
    this.write("x2  x3  x4  x5", W / 2, 648, 22, C.magenta, { glow: 14 })
    this.write("20 SECONDS. GO FAST.", W / 2, 730, 16, C.white, { alpha: 0.85 })
  }

  drawCursor({ x, y }) {
    const c = this.ctx
    c.strokeStyle = C.white
    c.lineWidth = 3
    c.shadowColor = C.white
    c.shadowBlur = 8
    c.beginPath()
    c.moveTo(x - 18, y); c.lineTo(x - 6, y); c.moveTo(x + 6, y); c.lineTo(x + 18, y)
    c.moveTo(x, y - 18); c.lineTo(x, y - 6); c.moveTo(x, y + 6); c.lineTo(x, y + 18)
    c.stroke()
    c.shadowBlur = 0
  }

  drawEffects(now) {
    const c = this.ctx
    c.globalCompositeOperation = "lighter"
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / p.max)
      c.fillStyle = p.color
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = "source-over"

    for (const f of this.fx) {
      const p = (now - f.at) / f.dur
      if (f.kind === "text") {
        const rise = f.center ? 0 : p * 46
        const size = f.center ? f.size * (1 + 0.25 * (1 - p)) : f.size
        this.write(f.str, f.x, f.y - rise, Math.round(size), f.color, { glow: 14, alpha: 1 - p * p })
      } else {
        c.strokeStyle = f.color
        c.shadowColor = f.color
        c.shadowBlur = 14
        c.globalAlpha = 1 - p
        c.lineWidth = f.kind === "ring" ? 5 : 3
        c.beginPath()
        c.arc(f.x, f.y, f.kind === "ring" ? R + p * 50 : R * (1 - p), 0, Math.PI * 2)
        c.stroke()
        c.globalAlpha = 1
        c.shadowBlur = 0
      }
    }
  }
}
