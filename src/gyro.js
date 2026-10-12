// Inclinación del teléfono -> movimiento corporal del piloto.
// Se lee la gravedad (devicemotion) en coordenadas de pantalla, así funciona
// igual en vertical o apaisado y sin el bloqueo de cardán de los ángulos de Euler.

export const tilt = {
  supported: typeof window !== 'undefined' && 'DeviceMotionEvent' in window,
  enabled: false, // se pidió y concedió el permiso
  receiving: false, // llegan datos reales
  angle: 0, // ángulo crudo en grados (positivo = teléfono girado a la derecha)
  zero: 0,
  value: 0, // -1..1 ya calibrado, con zona muerta
  invert: false,
  range: 28, // grados para llegar a inclinación máxima
}

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

let lastSample = 0
let smooth = 0

function screenAngle() {
  const a = window.screen?.orientation?.angle ?? window.orientation ?? 0
  return ((a % 360) + 360) % 360
}

function onMotion(e) {
  const g = e.accelerationIncludingGravity
  if (!g || g.x == null || g.y == null) return
  let gx = g.x
  let gy = g.y
  if (isIOS) {
    gx = -gx
    gy = -gy
  }
  const th = (screenAngle() * Math.PI) / 180
  const sx = gx * Math.cos(th) - gy * Math.sin(th)
  const sy = gx * Math.sin(th) + gy * Math.cos(th)
  if (Math.hypot(sx, sy) < 2.5) return // teléfono casi plano: sin lectura útil
  const deg = (Math.atan2(-sx, sy) * 180) / Math.PI
  smooth += (deg - smooth) * 0.35
  tilt.angle = smooth
  tilt.receiving = true
  lastSample = performance.now()
}

export async function enableGyro() {
  if (!tilt.supported) return false
  try {
    const DM = window.DeviceMotionEvent
    if (typeof DM.requestPermission === 'function') {
      const res = await DM.requestPermission()
      if (res !== 'granted') return false
    }
    if (!tilt.enabled) window.addEventListener('devicemotion', onMotion)
    tilt.enabled = true
    return true
  } catch {
    return false
  }
}

export function calibrate() {
  tilt.zero = tilt.angle
}

export function updateTilt() {
  if (tilt.receiving && performance.now() - lastSample > 1500) tilt.receiving = false
  if (!tilt.receiving) {
    tilt.value = 0
    return
  }
  let d = tilt.angle - tilt.zero
  if (d > 180) d -= 360
  if (d < -180) d += 360
  if (tilt.invert) d = -d
  const dead = 3
  const mag = Math.max(0, Math.abs(d) - dead) / (tilt.range - dead)
  tilt.value = Math.sign(d) * Math.min(1, mag)
}
