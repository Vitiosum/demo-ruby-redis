// Draws what Redis holds on the arcade's surfaces: the LED ticker (list),
// the wall scoreboard (sorted sets + TTL), the coin-door counter (INCR) and
// the service menu (the exact commands of the last game, with latency).

const $ = (id) => document.getElementById(id)
const fmt = (n) => Number(n).toLocaleString("en-US")
const ordinal = (n) => n + (["TH", "ST", "ND", "RD"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "TH")

let ttlDeadline = null
let lastTicker = 0
let you = null // { i, s } of the last score saved from this screen

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) k === "text" ? (node.textContent = v) : node.setAttribute(k, v)
  node.append(...children)
  return node
}

function readMs(snapshot, prefix) {
  const read = snapshot.reads?.find((r) => r.cmd.startsWith(prefix))
  return read ? ` · ${read.ms.toFixed(2)} ms` : ""
}

export function markYou(game) { you = { i: game.i, s: game.s } }

export function renderSnapshot(s) {
  $("offline").hidden = true
  renderRows($("board-alltime"), s.alltime, 10)
  renderRows($("board-today"), s.today, 5)
  renderTicker(s.ticker)
  renderCounter(s.games)

  document.querySelector('[data-cmd="ZREVRANGE arcade:board:alltime"]').textContent =
    `ZREVRANGE ${s.keys.alltime} 0 9 WITHSCORES${readMs(s, "ZREVRANGE " + s.keys.alltime)}`
  $("today-cmd").textContent = `ZREVRANGE ${s.keys.today} 0 4 WITHSCORES · TTL ${s.keys.today} → ${fmt(s.ttl)} s`
  document.querySelector(".ticker__cmd").textContent = `LRANGE ${s.keys.ticker} 0 19${readMs(s, "LRANGE")}`

  $("bk-games").textContent = fmt(s.games)
  $("bk-alltime").textContent = fmt(s.size_all)
  $("bk-today").textContent = fmt(s.size_day)
  $("bk-ttl").textContent = `${fmt(s.ttl)} s`
  $("bk-memory").textContent = s.memory ?? "-"
  ttlDeadline = s.ttl > 0 ? Date.now() + s.ttl * 1000 : null
  tickClock()
}

function renderRows(list, rows, size) {
  if (!rows.length) {
    list.replaceChildren(el("li", { class: "led__empty", text: "No score yet. Be the first." }))
    return
  }
  let marked = false
  list.replaceChildren(...rows.slice(0, size).map((row, i) => {
    const mine = !marked && you && row.i === you.i && row.s === you.s
    if (mine) marked = true
    return el("li", mine ? { class: "is-you" } : {}, [
      el("span", { class: "rank", text: ordinal(i + 1) }),
      el("span", { text: row.i }),
      el("span", { class: "score", text: fmt(row.s) })
    ])
  }))
}

function renderTicker(entries) {
  const newest = Math.max(0, ...entries.map((e) => e.n ?? 0))
  const items = entries.map((e) => el("span", { class: `ticker__item${lastTicker && e.n > lastTicker ? " is-new" : ""}` }, [
    ...(e.n ? [el("small", { text: `#${e.n}` })] : []), el("b", { text: e.i }), ` ${fmt(e.s)}`
  ]))
  lastTicker = newest
  const track = $("ticker")
  // two copies side by side make the scroll loop seamless
  track.replaceChildren(...items, ...items.map((n) => { const c = n.cloneNode(true); c.setAttribute("aria-hidden", "true"); return c }))
  track.style.setProperty("--ticker-dur", `${Math.max(20, entries.length * 4)}s`)
}

function renderCounter(games) {
  const box = $("games")
  const digits = String(games).padStart(6, "0").slice(-6)
  const changed = box.dataset.value && box.dataset.value !== digits
  box.dataset.value = digits
  box.replaceChildren(...[...digits].map((d) => el("span", { text: d })))
  box.setAttribute("aria-label", `${games} games played`)
  if (changed) { box.classList.remove("is-bumped"); void box.offsetWidth; box.classList.add("is-bumped") }
}

function renderCommands(commands) {
  $("commands").replaceChildren(...commands.map((c, i) => {
    const [name, ...args] = c.cmd.split(" ")
    return el("li", { class: "is-in", style: `--i:${i}` }, [
      el("code", {}, [el("b", { text: name }), ` ${args.join(" ")}`]),
      el("span", { class: "reply", text: c.reply }),
      el("span", { class: "ms", text: c.ms == null ? "now" : `${c.ms.toFixed(2)} ms` })
    ])
  }))
}

// Before any game, show what Redis did to draw this page.
export function renderPageLoad(snapshot) {
  $("cmds-title").textContent = "Redis · this page load"
  $("last-game").textContent = "The reads that drew the boards. Play a game and its writes replace them, on every open screen."
  renderCommands(snapshot.reads)
}

export function renderGame(game, { live = false } = {}) {
  if (!game) return
  $("cmds-title").textContent = "Redis · last game"
  $("last-game").replaceChildren(
    "Game ", el("b", { text: `#${fmt(game.n)}` }), " · ", el("b", { text: game.i }), ` · ${fmt(game.s)} pts · `,
    `${ordinal(game.rank_today)} today, ${ordinal(game.rank_all)} all-time${live ? " · received live" : ""}`
  )
  renderCommands(game.commands)
}

export function setLive(live) {
  const badge = $("live")
  badge.classList.toggle("is-live", live)
  badge.textContent = live ? "Pub/Sub live" : "Polling"
  badge.title = live ? "Action Cable WebSocket, fed by Redis PUBLISH" : "WebSocket down: polling GET /board every 6 s"
}

export function setOffline() { $("offline").hidden = false }

function tickClock() {
  const clock = $("ttl-clock")
  if (!ttlDeadline) return (clock.textContent = "--:--:--")
  const s = Math.max(0, Math.round((ttlDeadline - Date.now()) / 1000))
  clock.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":")
}
setInterval(tickClock, 1000)
