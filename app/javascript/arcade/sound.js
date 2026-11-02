// Tiny 8-bit sound effects, synthesized with Web Audio (no audio files).
// Muted by default: the audio context is only created when Sound is switched on.
export class Sound {
  on = false
  ctx = null

  toggle() {
    this.on = !this.on
    if (this.on && !this.ctx) this.ctx = new AudioContext()
    this.ctx?.resume()
    return this.on
  }

  tone(freq, dur, { type = "square", vol = 0.05, slide = 1, delay = 0 } = {}) {
    if (!this.on || !this.ctx) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  hit(mult) { this.tone(480 + mult * 110, 0.08, { slide: 1.9 }) }
  hot() { [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.08, { delay: i * 0.045 })) }
  nil() { this.tone(200, 0.2, { type: "sawtooth", slide: 0.45, vol: 0.04 }) }
  miss() { this.tone(120, 0.07, { type: "triangle", vol: 0.08 }) }
  combo() { [660, 990].forEach((f, i) => this.tone(f, 0.1, { delay: i * 0.07, type: "triangle", vol: 0.07 })) }
  tick() { this.tone(440, 0.07) }
  go() { this.tone(880, 0.22, { slide: 1.5 }) }
  over() { [523, 440, 349, 262].forEach((f, i) => this.tone(f, 0.18, { delay: i * 0.15, type: "triangle", vol: 0.08 })) }
  saved() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.11, { delay: i * 0.08 })) }
}
