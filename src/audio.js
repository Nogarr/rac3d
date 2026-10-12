// Motor sintetizado con Web Audio: dos osciladores + filtro.
let ctx = null
let osc1, osc2, filter, gain
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
  } catch {
    ctx = null
  }
}

export function updateAudio(rpm, throttle, active) {
  if (!ctx) return
  const t = ctx.currentTime
  const f = 38 + rpm * 150
  osc1.frequency.setTargetAtTime(f, t, 0.04)
  osc2.frequency.setTargetAtTime(f * 0.5, t, 0.04)
  filter.frequency.setTargetAtTime(400 + rpm * 2200 + throttle * 500, t, 0.05)
  const g = muted || !active ? 0 : 0.035 + throttle * 0.035
  gain.gain.setTargetAtTime(g, t, 0.08)
}

export function setMuted(m) {
  muted = m
}

export function silence() {
  if (!ctx) return
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}
