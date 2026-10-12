import { useRef } from 'react'
import { input } from './input'
import { LAPS, standings } from './race'
import { fmtTime } from './shared'
import { centerline, bounds, S0, sample } from './track'

// HUD mínimo: posición, vuelta, marcha (con su color hace de luz de cambio),
// velocidad y una línea de RPM. Torre, tiempos y minimapa solo en pantallas grandes.
export const hud = { rows: [] }

function setText(el, v) {
  if (el && el._v !== v) {
    el._v = v
    el.textContent = v
  }
}
function setClass(el, name, on) {
  if (!el) return
  const key = '_c_' + name
  if (el[key] !== on) {
    el[key] = on
    el.classList.toggle(name, on)
  }
}

// --- minimapa (solo escritorio) ---
const line = centerline(10)
const b = bounds()
const startPt = sample(S0, {})
function mapper(w, h, pad) {
  const sx = (w - pad * 2) / (b.maxX - b.minX)
  const sz = (h - pad * 2) / (b.maxZ - b.minZ)
  const s = Math.min(sx, sz)
  const ox = (w - (b.maxX - b.minX) * s) / 2
  const oz = (h - (b.maxZ - b.minZ) * s) / 2
  return (x, z) => [ox + (x - b.minX) * s, oz + (z - b.minZ) * s]
}
function drawMap(race) {
  const c = hud.map
  if (!c || !c.offsetParent) return
  const ctx = c.getContext('2d')
  const w = c.width
  const h = c.height
  const dpr = w / c.clientWidth || 1
  const m = mapper(w, h, 8 * dpr)
  ctx.clearRect(0, 0, w, h)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  line.forEach(([x, z], i) => {
    const [px, py] = m(x, z)
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  })
  ctx.closePath()
  ctx.strokeStyle = 'rgba(10,12,22,0.55)'
  ctx.lineWidth = 8 * dpr
  ctx.stroke()
  ctx.strokeStyle = '#e9e4d8'
  ctx.lineWidth = 3 * dpr
  ctx.stroke()
  const [sx, sy] = m(startPt.x, startPt.z)
  ctx.fillStyle = '#121418'
  ctx.fillRect(sx - 5 * dpr, sy - 1.5 * dpr, 10 * dpr, 3 * dpr)
  const order = [...race.racers].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0))
  for (const r of order) {
    const [px, py] = m(r.x, r.z)
    ctx.beginPath()
    ctx.arc(px, py, (r.isPlayer ? 5 : 3.5) * dpr, 0, Math.PI * 2)
    ctx.fillStyle = r.color
    ctx.fill()
    ctx.lineWidth = (r.isPlayer ? 2 : 1) * dpr
    ctx.strokeStyle = '#121418'
    ctx.stroke()
  }
}

let tAcc = 0
let mapAcc = 0
let blink = 0
function drawRadar(st) {
  const c = hud.radar
  if (!c || !c.offsetParent) return
  const ctx = c.getContext('2d')
  const w = c.width
  const R = w / 2
  const p = st.player
  ctx.clearRect(0, 0, w, w)
  ctx.fillStyle = 'rgba(16,21,40,0.55)'
  ctx.beginPath()
  ctx.arc(R, R, R - 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = w / 90
  ctx.beginPath()
  ctx.arc(R, R, R * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  const range = 220
  const cs = Math.cos(p.yaw)
  const sn = Math.sin(p.yaw)
  const blinkOn = Math.floor(st.time * 6) % 2 === 0
  for (const c2 of st.police) {
    if (!c2.active) continue
    const dx = c2.x - p.x
    const dz = c2.z - p.z
    // adelante = arriba
    const fwd = dx * sn + dz * cs
    const right = dx * -cs + dz * sn
    let x = -right / range
    let y = -fwd / range
    const m = Math.hypot(x, y)
    if (m > 0.92) {
      x *= 0.92 / m
      y *= 0.92 / m
    }
    ctx.fillStyle = c2.seesPlayer ? (blinkOn ? '#ff3b30' : '#3b7bff') : '#9aa2b6'
    ctx.beginPath()
    ctx.arc(R + x * R, R + y * R, w / 16, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffb000'
  ctx.beginPath()
  ctx.moveTo(R, R - w / 11)
  ctx.lineTo(R - w / 18, R + w / 18)
  ctx.lineTo(R + w / 18, R + w / 18)
  ctx.closePath()
  ctx.fill()
}

export function updateHud(st, dt) {
  const p = st.player
  blink += dt
  const grid = st.phase === 'grid'
  const chase = st.mode === 'chase'

  setText(hud.speed, String(Math.round(p.v * 3.6)))
  setText(hud.gear, grid && !p.throttle ? 'N' : String(p.gear))
  const rpm = Math.min(1, p.rpm)
  const cut = !grid && (p.limiter || p.rpm > 0.99)
  const flash = Math.floor(blink * 10) % 2 === 0
  if (hud.rpm) hud.rpm.style.transform = `scaleX(${rpm.toFixed(3)})`
  setClass(hud.rpmBox, 'hot', rpm > 0.8)
  setClass(hud.gearBox, 'shift', !grid && rpm > 0.86 && !cut)
  setClass(hud.gearBox, 'cut', cut && flash)

  // ángulo de inclinación y cercanía al límite de agarre
  const deg = Math.round(Math.abs(p.crash > 0 ? 0 : p.lean) * 57.3)
  setText(hud.lean, deg + '°')
  const ratio = Math.abs(p.lean) / Math.max(0.05, p.limitNow || 1)
  setClass(hud.lean, 'warm', p.crash <= 0 && ratio > 0.75 && ratio <= 0.92)
  setClass(hud.lean, 'hot', p.crash <= 0 && ratio > 0.92)

  if (chase) {
    const ev = Math.min(1, st.evade)
    if (hud.evade) hud.evade.style.transform = `scaleX(${ev.toFixed(3)})`
    setText(hud.status, st.result === 'escaped' ? 'LIBRE' : st.seen ? 'TE VEN' : 'EVADIENDO')
    setClass(hud.statusBox, 'seen', st.seen && !st.result)
    drawRadar(st)
  } else {
    setText(hud.pos, String(standings(st).indexOf(p) + 1))
    setText(hud.lap, String(Math.min(LAPS, Math.max(1, p.lapIdx + 1))))
    setText(hud.time, fmtTime(grid ? 0 : st.time))
    setText(hud.best, isFinite(p.bestLap) ? fmtTime(p.bestLap) : '—')
  }

  // un solo aviso a la vez, solo cuando importa
  let warn = ''
  if (!grid && !p.finished && p.crash <= 0 && !st.result) {
    if (chase && st.bust > 0.05) warn = 'TE ESTÁN ACORRALANDO · ' + Math.round(st.bust * 100) + '%'
    else if (p.slide > 0.15) warn = p.front ? '¡SOLTÁ EL DELANTERO!' : '¡PATINA! ENDEREZÁ'
    else if (p.offroad && !chase) warn = 'GRAVA'
  }
  setText(hud.warn, warn)
  setClass(hud.warn, 'show', warn !== '')

  let count = ''
  if (st.running && grid && st.countdown <= 3) count = String(Math.ceil(st.countdown))
  if (st.phase === 'race' && st.time < 0.9) count = '¡YA!'
  setText(hud.count, count)
  setClass(hud.count, 'go', count === '¡YA!')

  setText(hud.toast, st.toast.t > 0 ? st.toast.text : '')
  setClass(hud.toast, 'show', st.toast.t > 0 && warn === '')

  if (hud.bar) hud.bar.style.transform = `rotate(${(input.steer * 26).toFixed(1)}deg)`

  if (chase) return
  // extras de escritorio
  tAcc += dt
  if (tAcc > 0.25 && hud.rows[0]?.el?.offsetParent) {
    tAcc = 0
    const sd = standings(st)
    const leader = sd[0]
    sd.forEach((r, i) => {
      const row = hud.rows[i]
      if (!row) return
      setText(row.num, String(r.num))
      setText(row.name, r.name)
      let gap = ''
      if (i === 0) gap = grid ? '' : `V${Math.min(LAPS, Math.max(1, r.lapIdx + 1))}`
      else if (r.finished && leader.finished) gap = '+' + (r.finishTime - leader.finishTime).toFixed(1)
      else gap = grid ? '' : '+' + ((leader.total - r.total) / Math.max(r.v, 20)).toFixed(1)
      setText(row.gap, gap)
      if (row.el) {
        row.el.style.setProperty('--c', r.color)
        setClass(row.el, 'me', r.isPlayer)
      }
    })
  }
  mapAcc += dt
  if (mapAcc > 1 / 30) {
    mapAcc = 0
    drawMap(st)
  }
}

const rowRef = (i, key) => (e) => {
  hud.rows[i] = hud.rows[i] || {}
  hud.rows[i][key] = e
}

export function Hud({ visible, mode, onPause }) {
  return (
    <div className={'hud' + (visible ? '' : ' is-hidden') + (mode === 'chase' ? ' mode-chase' : '')}>
      <div className="hud-chase" ref={(e) => (hud.statusBox = e)}>
        <span className="chase-status" ref={(e) => (hud.status = e)}>TE VEN</span>
        <span className="chase-bar"><i ref={(e) => (hud.evade = e)} /></span>
        <canvas className="radar" width={200} height={200} ref={(e) => (hud.radar = e)} />
      </div>
      <div className="hud-race" aria-label="Posición y vuelta">
        <span className="pos">
          P<b ref={(e) => (hud.pos = e)}>4</b>
        </span>
        <span className="lap">
          <b ref={(e) => (hud.lap = e)}>1</b>/{LAPS}
        </span>
      </div>

      <button type="button" className="hud-pause" onClick={onPause} aria-label="Pausa">
        <span />
        <span />
      </button>

      <div className="hud-gauge" ref={(e) => (hud.gearBox = e)}>
        <span className="gauge-gear" ref={(e) => (hud.gear = e)}>N</span>
        <span className="gauge-speed">
          <b ref={(e) => (hud.speed = e)}>0</b> km/h
        </span>
        <span className="gauge-rpm" ref={(e) => (hud.rpmBox = e)}>
          <i ref={(e) => (hud.rpm = e)} />
        </span>
        <span className="gauge-lean" ref={(e) => (hud.lean = e)}>0°</span>
      </div>

      <div className="hud-desk">
        <div className="desk-times">
          <span>TIEMPO</span>
          <b ref={(e) => (hud.time = e)}>0:00.000</b>
          <span>MEJOR</span>
          <b ref={(e) => (hud.best = e)}>—</b>
        </div>
        <ol className="tower">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} ref={rowRef(i, 'el')}>
              <span className="tw-pos">{i + 1}</span>
              <span className="tw-num" ref={rowRef(i, 'num')} />
              <span className="tw-name" ref={rowRef(i, 'name')} />
              <span className="tw-gap" ref={rowRef(i, 'gap')} />
            </li>
          ))}
        </ol>
        <canvas className="minimap" width={280} height={360} ref={(e) => (hud.map = e)} />
      </div>

      <div className="count" ref={(e) => (hud.count = e)} />
      <div className="toast" ref={(e) => (hud.toast = e)} />
      <div className="warn" ref={(e) => (hud.warn = e)} />
    </div>
  )
}

// ---------- Controles táctiles ----------

function Hold({ k, label, className }) {
  const on = (e) => {
    e.preventDefault()
    input[k] = true
    e.currentTarget.classList.add('pressed')
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    navigator.vibrate?.(8)
  }
  const off = (e) => {
    input[k] = false
    e.currentTarget.classList.remove('pressed')
  }
  return (
    <button
      type="button"
      className={'pad ' + (className || '')}
      aria-label={label}
      onPointerDown={on}
      onPointerUp={off}
      onPointerCancel={off}
      onLostPointerCapture={off}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

function Tap({ onTap, label, aria, className }) {
  return (
    <button
      type="button"
      className={'pad ' + (className || '')}
      aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.classList.add('pressed')
        navigator.vibrate?.(12)
        onTap()
      }}
      onPointerUp={(e) => e.currentTarget.classList.remove('pressed')}
      onPointerCancel={(e) => e.currentTarget.classList.remove('pressed')}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

function Handlebar() {
  const pad = useRef(null)
  const id = useRef(null)
  const update = (e) => {
    const r = pad.current.getBoundingClientRect()
    const x = (e.clientX - (r.left + r.width / 2)) / ((r.width / 2) * 0.8)
    input.steerTouch = Math.max(-1, Math.min(1, x))
  }
  const release = () => {
    id.current = null
    input.steerTouch = null
    pad.current?.classList.remove('pressed')
  }
  return (
    <div
      ref={pad}
      className="steer"
      role="slider"
      aria-label="Manubrio"
      aria-valuemin={-1}
      aria-valuemax={1}
      onPointerDown={(e) => {
        e.preventDefault()
        id.current = e.pointerId
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
        pad.current.classList.add('pressed')
        update(e)
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) update(e)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <svg viewBox="0 0 240 80" className="steer-bar" ref={(e) => (hud.bar = e)} aria-hidden="true">
        <rect x="18" y="34" width="204" height="10" rx="5" fill="#c7ccd8" />
        <rect x="6" y="30" width="46" height="18" rx="7" fill="#15181f" />
        <rect x="188" y="30" width="46" height="18" rx="7" fill="#15181f" />
        <rect x="108" y="26" width="24" height="26" rx="4" fill="#ffb000" />
      </svg>
    </div>
  )
}

export function TouchControls({ visible }) {
  if (!visible) return null
  return (
    <div className="touch">
      <div className="touch-left">
        <div className="shifter">
          <Tap label="+" aria="Subir cambio" className="pad-shift" onTap={() => input.shifts.push(1)} />
          <Tap label="−" aria="Bajar cambio" className="pad-shift" onTap={() => input.shifts.push(-1)} />
        </div>
        <Handlebar />
      </div>
      <div className="touch-right">
        <div className="brake-col">
          <Hold k="front" label="DEL" className="pad-front" />
          <Hold k="rear" label="TRAS" className="pad-rear" />
        </div>
        <Hold k="throttle" label="GAS" className="pad-gas" />
      </div>
    </div>
  )
}
