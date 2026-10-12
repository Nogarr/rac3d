// Motor monocilíndrico 4T sintetizado (el tono sigue las RPM reales de cada moto) y sirena.
let ctx = null
let osc1, osc2, filter, gain
let sir, sirGain, sirLfo, sirLfoGain
let muted = false

export function startAudio() {
  if (ctx) {
    ctx.resume?.()
    return
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    osc1 = ctx.createOscillator()
    osc2 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc2.type = 'square'
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    filter.Q.value = 4
    gain = ctx.createGain()
    gain.gain.value = 0
    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc1.start()
    osc2.start()

    // sirena: senoidal modulada (ulular)
    sir = ctx.createOscillator()
    sir.type = 'triangle'
    sir.frequency.value = 900
    sirLfo = ctx.createOscillator()
    sirLfo.frequency.value = 0.45
    sirLfoGain = ctx.createGain()
    sirLfoGain.gain.value = 300
    sirLfo.connect(sirLfoGain)
    sirLfoGain.connect(sir.frequency)
    sirGain = ctx.createGain()
    sirGain.gain.value = 0
    sir.connect(sirGain)
    sirGain.connect(ctx.destination)
    sir.start()
    sirLfo.start()
  } catch {
    ctx = null
  }
}

// rpm: régimen normalizado (1 = corte); redline: rpm reales de corte
export function updateAudio(rpm, throttle, active, redline = 9000) {
  if (!ctx) return
  const t = ctx.currentTime
  const rev = (Math.max(0.1, rpm) * redline) / 60 // vueltas por segundo
  osc1.frequency.setTargetAtTime(rev, t, 0.04)
  osc2.frequency.setTargetAtTime(rev / 2, t, 0.04) // un encendido cada dos vueltas
  filter.frequency.setTargetAtTime(350 + rpm * 2200 + throttle * 500, t, 0.05)
  const g = muted || !active ? 0 : 0.04 + throttle * 0.04
  gain.gain.setTargetAtTime(g, t, 0.08)
}

export function updateSiren(dist, active) {
  if (!ctx) return
  const v = muted || !active ? 0 : Math.max(0, 1 - dist / 220) * 0.05
  sirGain.gain.setTargetAtTime(v, ctx.currentTime, 0.1)
}

export function setMuted(m) {
  muted = m
}

export function silence() {
  if (!ctx) return
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  sirGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}
