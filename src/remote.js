// Paquetes de estado compactos e interpolación de entidades remotas.
import { BIKES } from './bikes'
import { wrapAngle } from './shared'

const r2 = (v) => Math.round(v * 100) / 100

// Estado de una moto (jugador humano o IA) para mandar por la red
export function bikePacket(r) {
  return {
    i: r.id,
    k: r.bike.id,
    x: r2(r.x),
    z: r2(r.z),
    y: r2(r.yaw),
    l: r2(r.lean),
    b: r2(r.body || 0),
    v: r2(r.v),
    g: r.gear || 1,
    rp: r2(r.rpm || 0),
    br: r.braking ? 1 : 0,
    c: r.crash > 0 ? 1 : 0,
    t: r2(r.total || 0),
    d: r2(r.d || 0),
    li: r.lapIdx ?? -1,
    f: r.finished ? 1 : 0,
    ft: r2(r.finishTime || 0),
    bl: isFinite(r.bestLap) ? r2(r.bestLap) : -1,
    bu: r.busted ? 1 : 0,
  }
}

export function applyBikePacket(r, p) {
  if (p.k && r.bike.id !== p.k && BIKES[p.k]) r.bike = BIKES[p.k]
  if (r.netT === undefined) {
    // primera vez: aparecer donde corresponde
    r.x = p.x
    r.z = p.z
    r.yaw = p.y
  }
  r.nx = p.x
  r.nz = p.z
  r.ny = p.y
  r.nl = p.l
  r.netT = 0
  r.body = p.b
  r.v = p.v
  r.gear = p.g
  r.rpm = p.rp
  r.braking = p.br
  r.crash = p.c ? 1 : 0
  r.total = p.t
  r.d = p.d
  r.lapIdx = p.li
  r.finished = !!p.f
  r.finishTime = p.ft
  r.bestLap = p.bl < 0 ? Infinity : p.bl
  r.busted = !!p.bu
}

// Estima dónde está ahora (extrapola un poco con la velocidad) y suaviza
export function stepRemoteBike(r, dt) {
  if (r.netT === undefined) return
  r.netT += dt
  const age = Math.min(r.netT, 0.3)
  const tx = r.nx + Math.sin(r.ny) * r.v * age
  const tz = r.nz + Math.cos(r.ny) * r.v * age
  const k = Math.min(1, dt * 12)
  if (Math.hypot(tx - r.x, tz - r.z) > 25) {
    r.x = tx
    r.z = tz
  } else {
    r.x += (tx - r.x) * k
    r.z += (tz - r.z) * k
  }
  r.yaw += wrapAngle(r.ny - r.yaw) * k
  r.lean += (r.nl - r.lean) * k
}

// Vehículos (tráfico y policía): [x, z, yaw, velocidad]
export function vehiclePacket(c) {
  return [r2(c.x), r2(c.z), r2(c.yaw), r2(c.speed)]
}

export function applyVehiclePacket(c, a) {
  if (c.netT === undefined) {
    c.x = a[0]
    c.z = a[1]
    c.yaw = a[2]
  }
  c.nx = a[0]
  c.nz = a[1]
  c.ny = a[2]
  c.speed = a[3]
  c.netT = 0
}

export function stepRemoteVehicle(c, dt) {
  if (c.netT === undefined) return
  c.netT += dt
  const age = Math.min(c.netT, 0.3)
  const tx = c.nx + Math.sin(c.ny) * c.speed * age
  const tz = c.nz + Math.cos(c.ny) * c.speed * age
  const k = Math.min(1, dt * 10)
  if (Math.hypot(tx - c.x, tz - c.z) > 30) {
    c.x = tx
    c.z = tz
  } else {
    c.x += (tx - c.x) * k
    c.z += (tz - c.z) * k
  }
  c.yaw += wrapAngle(c.ny - c.yaw) * k
}
