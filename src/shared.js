import { input } from './input'
import { tilt } from './gyro'

export const settings = { assist: true }

export function fmtTime(t) {
  if (!isFinite(t)) return '—'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

// Cuerpo del piloto: giroscopio > teclas > asistido (hacia adentro de la curva que viene)
export function bodyInput(idealBody) {
  if (tilt.receiving) return tilt.value
  if (Math.abs(input.bodyKey) > 0.02) return input.bodyKey
  return settings.assist ? idealBody * 0.75 : 0
}

export function readControls(idealBody) {
  return {
    throttle: input.throttle,
    front: input.front,
    rear: input.rear,
    steer: input.steer,
    body: bodyInput(idealBody),
  }
}

export function toast(state, text, t = 2.4) {
  state.toast.text = text
  state.toast.t = t
}
