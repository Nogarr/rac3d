import { torqueFrac, dragAcc } from './bikes'

// Física de la moto del jugador en coordenadas de mundo (sirve para pista y ciudad).
// La inclinación es la que hace girar: curvatura = g·tan(inclinación efectiva) / v².
// Cada moto tiene un límite de inclinación (agarre). Pasarlo hace patinar y caer;
// frenar o acelerar a fondo inclinado achica ese límite.

const G = 9.81
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function createRider(bike, x = 0, z = 0, yaw = 0) {
  return {
    bike,
    x, z, yaw,
    v: 0, lean: 0, body: 0, steer: 0, kappa: 0,
    gear: 1, rpm: bike.idle / bike.redline, shiftT: 0, limiter: false,
    throttle: 0, front: 0, rear: 0, braking: 0,
    slide: 0, limitNow: bike.leanLimit, nearLimit: false,
    crash: 0, crashSide: 1, crashReason: '',
  }
}

export function shiftRider(p, dir) {
  const b = p.bike
  if (p.crash > 0) return null
  if (dir > 0 && p.gear < 6) {
    p.gear++
    p.shiftT = 0.13
  } else if (dir < 0 && p.gear > 1) {
    if (p.v / b.gearTop[p.gear - 1] > 1.1) return 'SOBREGIRO · NO ENTRA'
    p.gear--
    p.shiftT = 0.09
  }
  return null
}

function startCrash(p, reason) {
  p.crash = 2.6
  p.crashSide = Math.sign(p.lean) || 1
  p.crashReason = reason
  p.slide = 0
}

/**
 * ctrl: { throttle, front, rear, steer (-1..1), body (-1..1) }
 * env:  { grip (agarre del piso), drag (resistencia extra) }
 * Devuelve 'crash' en el instante de la caída y 'respawn' cuando termina.
 */
export function stepBike(p, ctrl, dt, env = {}) {
  const b = p.bike
  const grip = env.grip ?? 1
  const extraDrag = env.drag ?? 0

  if (p.crash > 0) {
    p.crash -= dt
    p.v = Math.max(0, p.v - 8 * dt)
    p.x += Math.sin(p.yaw) * p.v * dt
    p.z += Math.cos(p.yaw) * p.v * dt
    p.lean += (p.crashSide * 1.45 - p.lean) * Math.min(1, dt * 5)
    p.throttle = p.front = p.rear = p.braking = 0
    p.body = 0
    p.steer = 0
    p.rpm += (b.idle / b.redline - p.rpm) * Math.min(1, dt * 3)
    if (p.crash <= 0) {
      p.crash = 0
      p.v = 0
      p.lean = 0
      p.gear = 1
      p.slide = 0
      return 'respawn'
    }
    return null
  }

  const throttle = ctrl.throttle ? 1 : 0
  const front = ctrl.front ? 1 : 0
  const rear = ctrl.rear ? 1 : 0
  p.throttle = throttle
  p.front = front
  p.rear = rear
  p.braking = Math.max(front, rear)
  p.steer = clamp(ctrl.steer || 0, -1, 1)
  p.body += (clamp(ctrl.body || 0, -1, 1) - p.body) * Math.min(1, dt * 8)

  // ---------- motor, caja y frenos ----------
  if (p.shiftT > 0) p.shiftT -= dt
  const rpmN = p.v / b.gearTop[p.gear]
  const rEff = throttle ? Math.max(rpmN, 0.42) : rpmN // el embrague patina al salir
  p.limiter = throttle && rpmN >= 0.99
  let acc = throttle && p.shiftT <= 0 ? b.push[p.gear] * torqueFrac(b, rEff) : 0
  acc = Math.min(acc, 7.5 * grip * Math.cos(p.lean))
  const drag = dragAcc(b, p.v, extraDrag)
  const engineBrake = throttle ? 0 : 0.25 + b.engBrake * Math.min(rpmN, 1.2) * (b.push[p.gear] / b.push[1])
  const overRev = rpmN > 1 ? (rpmN - 1) * 30 : 0
  const brakes = (front * b.front + rear * b.rear) * Math.min(1, grip + 0.15)
  p.v = Math.max(0, p.v + (acc - drag - engineBrake - overRev - brakes) * dt)
  const idleN = b.idle / b.redline
  const shown = p.shiftT > 0 ? rpmN * 0.85 : Math.max(idleN + throttle * 0.04, throttle && rpmN < 0.42 ? 0.42 : rpmN)
  p.rpm += (shown - p.rpm) * Math.min(1, dt * 14)

  // ---------- inclinación y equilibrio ----------
  const baseLimit = b.leanLimit * Math.min(1, grip + 0.1)
  const limit = baseLimit * (1 - 0.34 * front - 0.12 * rear - b.highside * throttle * Math.min(1, rpmN))
  p.limitNow = limit
  const speedF = clamp((p.v - 1) / 7, 0, 1)
  if (p.v < 1.2) {
    p.lean += (0 - p.lean) * Math.min(1, dt * 6) // pie a tierra
  } else {
    // el manubrio pide inclinación; a fondo pide un poco más de lo que la goma aguanta
    const target = p.steer * baseLimit * 1.12 * speedF
    const rate = b.leanRate * (0.55 + 0.45 * speedF)
    p.lean += clamp(target - p.lean, -rate * dt, rate * dt)
  }
  const over = Math.abs(p.lean) - limit
  if (over > 0) p.slide += dt * (over * 12 + 0.9)
  else p.slide = Math.max(0, p.slide - dt * 1.6)
  p.nearLimit = Math.abs(p.lean) > limit * 0.88 && p.v > 4

  if (p.slide >= 1) {
    startCrash(p, front ? '¡AL PISO! · FRENO DELANTERO INCLINADO' : '¡AL PISO! · TE PASASTE DE INCLINACIÓN')
    return 'crash'
  }
  if (p.v < 2.5 && Math.abs(p.lean) > 0.45) {
    startCrash(p, 'SE TE CAYÓ · MUY INCLINADA Y LENTA')
    return 'crash'
  }

  // ---------- trayectoria ----------
  const eff = clamp(p.lean + p.body * 0.16 * speedF, -1.3, 1.3)
  const kLean = (G * Math.tan(eff)) / Math.max(p.v * p.v, 9)
  const kKin = p.steer * 0.3 // maniobra a paso de hombre
  const w = clamp((p.v - 2) / 6, 0, 1)
  p.kappa = kKin * (1 - w) + kLean * w
  p.yaw -= p.kappa * p.v * dt
  p.x += Math.sin(p.yaw) * p.v * dt
  p.z += Math.cos(p.yaw) * p.v * dt
  return null
}

export function forceCrash(p, reason) {
  if (p.crash > 0) return false
  startCrash(p, reason)
  return true
}
