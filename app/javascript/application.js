// Wires the cabinet: the game, the initials entry, POST /scores, and the
// live board (Action Cable over Redis pub/sub, with polling as a fallback).
import { createConsumer } from "@rails/actioncable"
import { TTLRush } from "arcade/game"
import { Sound } from "arcade/sound"
import { renderSnapshot, renderGame, renderPageLoad, markYou, setLive, setOffline } from "arcade/board"

const $ = (id) => document.getElementById(id)
const cabinet = document.querySelector(".cabinet")
const screen = $("screen")
const entry = $("entry")
const announce = (text) => { $("announce").textContent = text }
const sound = new Sound()
const savedHere = new Set()

function apply(snapshot) {
  renderSnapshot(snapshot)
  game.setScores(snapshot)
}

const game = new TTLRush($("game"), {
  sound,
  onOver: (stats) => openEntry(stats),
  onState: (state) => {
    cabinet.classList.toggle("is-idle", state === "attract" || state === "result")
    screen.classList.toggle("is-playing", state === "play" || state === "countdown")
  }
})

// ---------- controls ----------

function start() {
  if (!game.idle) return
  const box = screen.getBoundingClientRect()
  if (box.top < 0 || box.bottom > innerHeight) screen.scrollIntoView({ block: "center", behavior: "smooth" })
  game.start()
}

$("start").addEventListener("click", start)
$("sound").addEventListener("click", (e) => {
  const on = sound.toggle()
  e.currentTarget.setAttribute("aria-pressed", on)
  $("sound-label").textContent = on ? "Sound on" : "Sound off"
})
document.addEventListener("keydown", (e) => {
  if (!entry.hidden || e.target.closest("button, a, input")) return
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start() }
})

// ---------- initials entry, the arcade way ----------

const A = "A".charCodeAt(0)
const slots = [...entry.querySelectorAll(".slot")]
let letters = ["A", "A", "A"]
let active = 0
let stats = null

try { const saved = localStorage.getItem("neon-arcade-initials"); if (/^[A-Z]{3}$/.test(saved)) letters = [...saved] } catch {}

function paint() {
  slots.forEach((slot, i) => {
    slot.querySelector(".slot__letter").textContent = letters[i]
    slot.classList.toggle("is-active", i === active)
  })
}

function step(i, delta) {
  letters[i] = String.fromCharCode(A + ((letters[i].charCodeAt(0) - A + delta + 26) % 26))
  active = i
  paint()
}

function openEntry(result) {
  stats = result
  active = 0
  $("entry-score").textContent = result.score.toLocaleString("en-US")
  const ratio = result.hits + result.expired ? Math.round((100 * result.hits) / (result.hits + result.expired)) : 0
  $("entry-stats").textContent = `${result.hits} hits · ${result.expired} (nil) · ${ratio}% hit ratio · best combo ${result.combo}`
  $("entry-error").textContent = ""
  entry.querySelector(".entry__save").disabled = false
  entry.hidden = false
  paint()
  slots[0].querySelector(".slot__letter").focus({ preventScroll: true })
  announce(`Game over. Score ${result.score}. Enter your initials.`)
}

function closeEntry() {
  entry.hidden = true
  stats = null
}

slots.forEach((slot, i) => {
  slot.querySelectorAll(".slot__btn").forEach((btn) => btn.addEventListener("click", () => step(i, Number(btn.dataset.step))))
  slot.querySelector(".slot__letter").addEventListener("focus", () => { active = i; paint() })
})

entry.addEventListener("keydown", (e) => {
  if (/^[a-z]$/i.test(e.key)) { letters[active] = e.key.toUpperCase(); active = Math.min(2, active + 1) }
  else if (e.key === "ArrowUp") step(active, 1)
  else if (e.key === "ArrowDown") step(active, -1)
  else if (e.key === "ArrowRight") active = Math.min(2, active + 1)
  else if (e.key === "ArrowLeft" || e.key === "Backspace") active = Math.max(0, active - 1)
  else if (e.key === "Escape") return skip()
  else if (e.key === "Enter") { e.preventDefault(); return entry.requestSubmit() }
  else return
  e.preventDefault()
  paint()
  slots[active].querySelector(".slot__letter").focus({ preventScroll: true })
})

function skip() {
  closeEntry()
  game.toAttract()
}
$("entry-skip").addEventListener("click", skip)

entry.addEventListener("submit", async (e) => {
  e.preventDefault()
  const initials = letters.join("")
  const button = entry.querySelector(".entry__save")
  button.disabled = true
  try { localStorage.setItem("neon-arcade-initials", initials) } catch {}

  try {
    const res = await fetch("/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: { initials, score: stats.score, hits: stats.hits, expired: stats.expired, combo: stats.combo } })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    savedHere.add(data.game.n)
    markYou(data.game)
    apply(data)
    renderGame(data.game)
    closeEntry()
    game.showResult(data.game)
    announce(`Score saved. ${data.game.rank_today} today, ${data.game.rank_all} all-time.`)
  } catch (err) {
    $("entry-error").textContent = `Score not saved: ${err.message}. Try again or skip.`
    button.disabled = false
  }
})

// ---------- live board ----------

let live = false
createConsumer().subscriptions.create("ArcadeChannel", {
  connected() { live = true; setLive(true) },
  disconnected() { live = false; setLive(false) },
  received(data) {
    apply(data)
    if (data.game && !savedHere.has(data.game.n)) renderGame(data.game, { live: true })
  }
})

setInterval(async () => {
  if (live || document.hidden) return
  try {
    const res = await fetch("/board", { headers: { Accept: "application/json" } })
    if (res.ok) apply(await res.json())
    else setOffline()
  } catch { setOffline() }
}, 6000)

const boot = JSON.parse($("boot").textContent || "null")
if (boot) { apply(boot); renderPageLoad(boot) }
else setOffline()
