import {
  BLOCK, LINES, CITY, DIRS, neighbor, nodePos, nearestNode, edgeWidth, laneOffsets,
  bfsFrom, collideCircle, lineOfSight, snapToStreet, nodeId, linePos,
} from './city'
import { BIKES } from './bikes'
import { createRider, stepBike, shiftRider, forceCrash } from './physics'
import { input } from './input'
import { readControls, toast, wrapAngle } from './shared'
import {
  bikePacket, applyBikePacket, stepRemoteBike, vehiclePacket, applyVehiclePacket, stepRemoteVehicle,
} from './remote'

// Modo escape: perdé a la policía. La barra de EVASIÓN se llena mientras ningún
// patrullero ve a nadie del grupo; si a alguien lo acorralan casi quieto, lo atrapan.
// Online: el host simula tráfico y policía; cada celular, su propia moto.

const TRAFFIC = 34
const EVADE_TIME = 15 // segundos sin que los vean para escapar
const BUST_TIME = 2.4

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const CAR_COLORS = ['#d8d4cc', '#2f3640', '#8c1d24', '#1f4e8c', '#c9a227', '#5d6a72', '#efefea', '#3d5a3a', '#7a4a2a', '#b7babd']

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function placeOnEdge(c) {
  const [nx, nz] = nodePos(c.from)
  const [dx, dz] = DIRS[c.d]
  const off = c.laneOff
  // derecha de la dirección de marcha = (-dz, dx)
  c.tx = nx + dx * c.prog + -dz * off
  c.tz = nz + dz * c.prog + dx * off
  c.tyaw = Math.atan2(dx, dz)
}

function setLane(c, laneIdx) {
  const lanes = laneOffsets(edgeWidth(c.from, c.d))
  c.lane = Math.min(laneIdx, lanes.length - 1)
  c.laneOff = c.police ? (lanes.length > 1 ? 3.5 : 1.6) : lanes[c.lane]
}

function makeCar(r, from, d, prog, police = false) {
  const c = {
    police, from, d, prog, lane: 0, laneOff: 2.8,
    speed: 0, vmax: police ? 30 : 9 + r() * 6, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0,
    color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)],
    next: -1, mode: 'graph', active: !police, sees: [], bfs: null,
  }
  setLane(c, Math.floor(r() * 2))
  if (edgeWidth(from, d) > 15) c.vmax += 4
  placeOnEdge(c)
  c.x = c.tx
  c.z = c.tz
  c.yaw = c.tyaw
  return c
}

function validEdge(from, d) {
  return neighbor(from, d) >= 0
}

/**
 * opts (online): { humans: [{id, name, bike, color, num}], selfId, authority, seed }
 */
export function createChase(bikeId, opts = null) {
  const online = !!opts
  const myBike = BIKES[bikeId] || BIKES.dominar
  const humans = online ? opts.humans : [{ id: 'me', name: 'Vos', bike: myBike.id, color: myBike.look.color, num: 77 }]
  const selfId = online ? opts.selfId : 'me'
  const r = rng(online ? opts.seed : Date.now() % 100000)
  // largan por Av. Belgrano (x = 192) hacia el norte, en fila de a dos
  const startX = linePos(3) - 2.6
  const startZ = linePos(4) + 20
  const players = humans.map((h, i) => {
    const bike = BIKES[h.bike] || myBike
    const p = createRider(bike, startX - (i % 2) * 3.6, startZ - Math.floor(i / 2) * 7, 0)
    return Object.assign(p, {
      id: h.id, name: h.name, color: h.color, num: h.num, suit: '#1b2238',
      isPlayer: h.id === selfId, isRemote: h.id !== selfId, human: true,
      busted: false, bust: 0, seen: true, offroad: false,
    })
  })
  const cars = []
  let guard = 0
  while (cars.length < TRAFFIC && guard++ < 500) {
    const from = Math.floor(r() * LINES * LINES)
    const d = Math.floor(r() * 4)
    if (!validEdge(from, d)) continue
    const c = makeCar(r, from, d, 8 + r() * (BLOCK - 16))
    if (Math.hypot(c.x - startX, c.z - startZ) < 45) continue
    cars.push(c)
  }
  // primer patrullero: una cuadra atrás, por la misma avenida
  const p1 = makeCar(r, nodeId(3, 3), 1, 10, true)
  p1.active = true
  const police = [p1, makeCar(r, nodeId(8, 8), 2, 10, true), makeCar(r, nodeId(0, 8), 0, 10, true)]
  police.forEach((p, i) => {
    p.id = i
    p.vmax = 30 + i
  })
  return {
    mode: 'chase',
    online,
    authority: online ? !!opts.authority : true,
    bike: myBike,
    players,
    player: players.find((p) => p.isPlayer),
    cars,
    police,
    rand: r,
    running: false,
    phase: 'grid',
    countdown: 3.6,
    time: 0,
    toast: { text: '', t: 0 },
    events: [],
    shake: 0,
    crashes: 0,
    idealBody: 0,
    evade: 0,
    bust: 0,
    seen: true,
    lastSeen: { x: startX, z: startZ },
    sinceSeen: 0,
    nearestCop: 999,
    result: null,
    finishAt: null,
    spawnAt: [8, 20],
    bfsCache: new Map(),
  }
}

const alive = (st) => st.players.filter((p) => !p.busted && !p.gone)

function bfsTo(st, node) {
  let d = st.bfsCache.get(node)
  if (!d) {
    d = bfsFrom(node)
    st.bfsCache.set(node, d)
  }
  return d
}

// ---------- tráfico ----------
function stepCar(c, st, dt) {
  let target = c.vmax
  for (const o of st.cars) {
    if (o === c || o.from !== c.from || o.d !== c.d || o.lane !== c.lane) continue
    const gap = o.prog - c.prog
    if (gap > 0 && gap < 12) target = Math.min(target, o.speed * (gap / 12))
  }
  // frenar si una moto está adelante
  const fx = Math.sin(c.yaw)
  const fz = Math.cos(c.yaw)
  for (const p of st.players) {
    if (p.gone) continue
    const dx = p.x - c.x
    const dz = p.z - c.z
    const ahead = dx * fx + dz * fz
    const side = Math.abs(dx * fz - dz * fx)
    if (ahead > 0 && ahead < 14 && side < 2.4) target = Math.min(target, (ahead - 4) * 0.8)
  }
  target = Math.max(0, target)
  c.speed += clamp(target - c.speed, -9 * dt, 3 * dt)
  advance(c, st, dt)
}

function chooseNext(c, st) {
  const at = neighbor(c.from, c.d)
  const back = (c.d + 2) % 4
  const opts = []
  for (let d = 0; d < 4; d++) if (d !== back && validEdge(at, d)) opts.push(d)
  if (!opts.length) return back
  if (c.police && c.bfs) {
    let best = opts[0]
    let bd = Infinity
    for (const d of opts) {
      const v = c.bfs[neighbor(at, d)] + st.rand() * 0.5
      if (v < bd) {
        bd = v
        best = d
      }
    }
    if (c.bfs[neighbor(at, back)] < bd - 0.5) return back
    return best
  }
  if (opts.includes(c.d) && st.rand() < 0.55) return c.d
  return opts[Math.floor(st.rand() * opts.length)]
}

function advance(c, st, dt) {
  if (c.next < 0 && c.prog > BLOCK - 34) c.next = chooseNext(c, st)
  if (c.next >= 0 && c.next !== c.d && c.prog > BLOCK - 26) c.speed = Math.min(c.speed, c.police ? 13 : 7)
  c.prog += c.speed * dt
  if (c.prog >= BLOCK) {
    const at = neighbor(c.from, c.d)
    const nd = c.next >= 0 ? c.next : chooseNext(c, st)
    c.prog -= BLOCK
    c.from = at
    c.d = nd
    c.next = -1
    setLane(c, c.lane)
  }
  placeOnEdge(c)
  const k = Math.min(1, dt * 8)
  c.x += (c.tx - c.x) * k
  c.z += (c.tz - c.z) * k
  c.yaw += wrapAngle(c.tyaw - c.yaw) * Math.min(1, dt * 6)
}

// ---------- policía (solo en el host) ----------
function toGraph(c) {
  const n = nearestNode(c.x, c.z)
  const [nx, nz] = nodePos(n)
  const dx = c.x - nx
  const dz = c.z - nz
  let d
  let prog
  if (Math.abs(dx) > Math.abs(dz)) {
    d = dx > 0 ? 0 : 2
    prog = Math.abs(dx)
  } else {
    d = dz > 0 ? 1 : 3
    prog = Math.abs(dz)
  }
  if (!validEdge(n, d)) d = (d + 2) % 4
  c.from = n
  c.d = d
  c.prog = Math.min(prog, BLOCK - 1)
  const [ex, ez] = DIRS[d]
  if (Math.sin(c.yaw) * ex + Math.cos(c.yaw) * ez < 0) {
    const m = neighbor(n, d)
    if (m >= 0) {
      c.from = m
      c.d = (d + 2) % 4
      c.prog = BLOCK - c.prog
    }
  }
  c.next = -1
  c.mode = 'graph'
  setLane(c, 0)
}

function stepPolice(c, st, dt) {
  const targets = alive(st)
  c.sees = []
  let tgt = null
  let tdist = Infinity
  for (const p of targets) {
    const dist = Math.hypot(p.x - c.x, p.z - c.z)
    const sees = dist < 26 || (dist < 180 && lineOfSight(c.x, c.z, p.x, p.z))
    if (sees) c.sees.push(p.id)
    // prioridad: a quien ve; entre esos, el más cercano
    const score = dist - (sees ? 1000 : 0)
    if (score < tdist) {
      tdist = score
      tgt = p
    }
  }
  const tDist = tgt ? Math.hypot(tgt.x - c.x, tgt.z - c.z) : Infinity
  const seesTgt = tgt && c.sees.includes(tgt.id)
  if (c.mode === 'graph' && tgt && tDist < 42 && seesTgt) c.mode = 'direct'
  if (c.mode === 'direct' && (!tgt || tDist > 60 || !seesTgt)) toGraph(c)

  if (c.mode === 'direct') {
    const lead = 0.5
    const aimX = tgt.x + Math.sin(tgt.yaw) * tgt.v * lead
    const aimZ = tgt.z + Math.cos(tgt.yaw) * tgt.v * lead
    const want = Math.atan2(aimX - c.x, aimZ - c.z)
    c.yaw += clamp(wrapAngle(want - c.yaw), -2.3 * dt, 2.3 * dt)
    const target = tDist > 14 ? c.vmax : Math.max(4, tgt.v + 2)
    c.speed += clamp(target - c.speed, -12 * dt, 6 * dt)
    c.x += Math.sin(c.yaw) * c.speed * dt
    c.z += Math.cos(c.yaw) * c.speed * dt
    const o = { x: c.x, z: c.z }
    if (collideCircle(o, 1.7)) c.speed *= 0.9
    c.x = o.x
    c.z = o.z
    return
  }
  // por las calles: hacia quien ve o hacia la última posición conocida del grupo
  const fresh = st.sinceSeen < 3 && tgt
  const node = fresh ? nearestNode(tgt.x, tgt.z) : nearestNode(st.lastSeen.x, st.lastSeen.z)
  c.bfs = bfsTo(st, node)
  const ahead = c.prog < BLOCK - 26 || c.next === c.d ? c.vmax : 13
  c.speed += clamp(ahead - c.speed, -12 * dt, 6 * dt)
  advance(c, st, dt)
}

function spawnPolice(c, st) {
  const group = alive(st)
  const ref = group[Math.floor(st.rand() * group.length)] || st.player
  const pn = nearestNode(ref.x, ref.z)
  const dist = bfsFrom(pn)
  const cands = []
  for (let n = 0; n < LINES * LINES; n++) if (dist[n] >= 4 && dist[n] <= 6) cands.push(n)
  const n = cands[Math.floor(st.rand() * cands.length)] ?? 0
  for (let d = 0; d < 4; d++) {
    const m = neighbor(n, d)
    if (m >= 0 && dist[m] < dist[n]) {
      c.from = n
      c.d = d
      break
    }
  }
  c.prog = 2
  c.speed = 15
  c.active = true
  c.mode = 'graph'
  setLane(c, 0)
  placeOnEdge(c)
  c.x = c.tx
  c.z = c.tz
  c.yaw = c.tyaw
  st.events.push('cop')
}

// ---------- choques de la moto propia ----------
const car2 = { x: 0, z: 0 }
function hitVehicle(st, c, radius, crashMsg) {
  const p = st.player
  if (p.crash > 0) return
  for (const s of [-1.15, 1.15]) {
    car2.x = c.x + Math.sin(c.yaw) * s
    car2.z = c.z + Math.cos(c.yaw) * s
    const dx = p.x - car2.x
    const dz = p.z - car2.z
    const d = Math.hypot(dx, dz)
    const R = radius + 0.55
    if (d >= R || d < 1e-6) continue
    const nx = dx / d
    const nz = dz / d
    p.x += nx * (R - d)
    p.z += nz * (R - d)
    const pvx = Math.sin(p.yaw) * p.v
    const pvz = Math.cos(p.yaw) * p.v
    const cvx = Math.sin(c.yaw) * c.speed
    const cvz = Math.cos(c.yaw) * c.speed
    const impact = -((pvx - cvx) * nx + (pvz - cvz) * nz)
    if (impact > 7.5) {
      if (forceCrash(p, crashMsg)) {
        st.crashes++
        st.shake = 1
        toast(st, p.crashReason, 2.4)
      }
    } else if (impact > 0) {
      p.v *= 0.75
      p.lean *= 0.6
      st.shake = Math.max(st.shake, 0.3)
    }
    if (st.authority) c.speed *= 0.8
    return
  }
}

function hitFriends(st) {
  const p = st.player
  for (const q of st.players) {
    if (q === p || q.gone) continue
    const dx = p.x - q.x
    const dz = p.z - q.z
    const d = Math.hypot(dx, dz)
    if (d > 1.1 || d < 1e-6) continue
    p.x += (dx / d) * (1.1 - d)
    p.z += (dz / d) * (1.1 - d)
    p.v *= 0.97
  }
}

const pc = { x: 0, z: 0 }
function drivePlayer(st, dt) {
  const p = st.player
  while (input.shifts.length) {
    const msg = shiftRider(p, input.shifts.shift())
    if (msg) toast(st, msg, 1.2)
  }
  const inPark = CITY.parks.some((k) => p.x > k.x0 && p.x < k.x1 && p.z > k.z0 && p.z < k.z1)
  const env = inPark ? { grip: p.bike.offroad, drag: p.bike.offroad > 0.9 ? 0.4 : 1.6 + p.v * 0.04 } : { grip: 1 }
  p.offroad = inPark
  const ev = stepBike(p, readControls(0), dt, env)
  if (ev === 'crash') {
    st.crashes++
    st.shake = 1
    toast(st, p.crashReason, 2.4)
  }
  if (ev === 'respawn') {
    const s = snapToStreet(p.x, p.z)
    pc.x = s.x
    pc.z = s.z
    collideCircle(pc, 0.6)
    p.x = pc.x
    p.z = pc.z
    p.yaw = s.yaw
  }
  pc.x = p.x
  pc.z = p.z
  const hit = collideCircle(pc, 0.55)
  p.x = pc.x
  p.z = pc.z
  if (hit && p.crash <= 0) {
    const fx = Math.sin(p.yaw)
    const fz = Math.cos(p.yaw)
    const into = -(fx * hit.nx + fz * hit.nz)
    if (into > 0) {
      const impact = p.v * into
      st.shake = Math.max(st.shake, Math.min(1, impact * 0.1))
      if (impact > 8 && forceCrash(p, '¡CONTRA LA PARED!')) {
        st.crashes++
        toast(st, p.crashReason, 2.4)
      } else {
        p.v *= 1 - 0.75 * into
        const sx = fx + hit.nx * into
        const sz = fz + hit.nz * into
        if (Math.hypot(sx, sz) > 0.05) p.yaw = Math.atan2(sx, sz)
        p.lean *= 0.5
      }
    }
  }
}

function coast(p, dt) {
  p.v = Math.max(0, p.v - 6 * dt)
  p.x += Math.sin(p.yaw) * p.v * dt
  p.z += Math.cos(p.yaw) * p.v * dt
  p.throttle = 0
  p.rpm += (p.bike.idle / p.bike.redline - p.rpm) * Math.min(1, dt * 3)
}

// Evasión del grupo, atrapados y final (solo el host decide)
function judge(st, dt) {
  const group = alive(st)
  const seenIds = new Set()
  for (const c of st.police) if (c.active) c.sees.forEach((id) => seenIds.add(id))
  st.seenIds = [...seenIds]
  const seenAny = seenIds.size > 0
  if (seenAny) {
    const who = group.find((p) => seenIds.has(p.id))
    if (who) {
      st.lastSeen.x = who.x
      st.lastSeen.z = who.z
    }
    st.sinceSeen = 0
    st.evade = Math.max(0, st.evade - dt * 0.5)
  } else {
    st.sinceSeen += dt
    st.evade += dt / EVADE_TIME
  }
  for (const p of group) {
    const cornered = st.police.some(
      (c) => c.active && Math.hypot(c.x - p.x, c.z - p.z) < 8 && (p.v < 5 || p.crash > 0)
    )
    p.bust = cornered ? p.bust + dt / BUST_TIME : Math.max(0, p.bust - dt / 1.2)
    if (p.bust >= 1) {
      p.busted = true
      p.bust = 1
      st.events.push('busted:' + p.id)
    }
  }
  if (st.evade >= 1) {
    st.result = 'escaped'
    st.finishAt = st.time + 2.5
  } else if (alive(st).length === 0) {
    st.result = 'busted'
    st.finishAt = st.time + 2.5
    for (const c of st.police) c.speed = 0
  }
}

function afterResult(st) {
  if (st.result === 'escaped') toast(st, st.player.busted ? 'TUS AMIGOS LOS PERDIERON' : '¡LOS PERDIERON!', 3)
  else toast(st, st.online ? 'ATRAPARON A TODOS' : 'TE ATRAPARON', 3)
}

export function stepChase(st, dt) {
  if (st.toast.t > 0) st.toast.t -= dt
  st.shake = Math.max(0, st.shake - dt * 2.5)
  const p = st.player
  if (!st.running) return
  for (const q of st.players) if (q.isRemote) stepRemoteBike(q, dt)
  if (!st.authority) {
    for (const c of st.cars) stepRemoteVehicle(c, dt)
    for (const c of st.police) if (c.active) stepRemoteVehicle(c, dt)
  }
  if (st.phase === 'grid') {
    input.shifts.length = 0
    p.rpm += ((input.throttle ? 0.72 : p.bike.idle / p.bike.redline) - p.rpm) * Math.min(1, dt * 6)
    p.throttle = input.throttle ? 1 : 0
    if (st.authority) for (const c of st.cars) stepCar(c, st, dt)
    st.countdown -= dt
    if (st.countdown <= 0) {
      st.phase = 'race'
      st.time = 0
      st.events.push('go')
      toast(st, st.online ? '¡LOS VIERON! PIERDAN A LA POLICÍA' : '¡TE VIERON! PERDÉ A LA POLICÍA', 2.6)
    }
    return
  }
  st.time += dt
  if (!st.result && !p.busted) {
    drivePlayer(st, dt)
    hitFriends(st)
  } else coast(p, dt)

  if (st.authority) {
    for (const c of st.cars) stepCar(c, st, dt)
    st.spawnAt.forEach((t, i) => {
      if (t !== null && st.time >= t && !st.result) {
        spawnPolice(st.police[i + 1], st)
        st.spawnAt[i] = null
      }
    })
    for (const c of st.police) if (c.active) stepPolice(c, st, dt)
  }

  let nearest = 999
  for (const c of st.police) if (c.active) nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.z - p.z))
  st.nearestCop = nearest

  if (!st.result && !p.busted) {
    for (const c of st.cars) hitVehicle(st, c, 1.0, 'TE LLEVASTE PUESTO UN AUTO')
    for (const c of st.police) if (c.active) hitVehicle(st, c, 1.15, 'TE TUMBÓ UN PATRULLERO')
  }

  if (st.authority && !st.result) {
    judge(st, dt)
    if (st.result) afterResult(st)
  }
  st.seen = (st.seenIds || []).includes(p.id)
  st.bust = p.bust

  if (st.finishAt !== null && st.time >= st.finishAt) {
    st.finishAt = null
    st.events.push('finish')
  }
}

// ---------- red ----------
export function chaseSnapshot(st) {
  return {
    type: 'snap',
    t: Math.round(st.time * 100) / 100,
    ps: st.players.filter((p) => !p.gone).map((p) => ({ ...bikePacket(p), bs: Math.round(p.bust * 100) / 100 })),
    po: st.police.map((c) => [...vehiclePacket(c), c.active ? 1 : 0]),
    ca: st.cars.map(vehiclePacket),
    tm: { e: Math.round(st.evade * 1000) / 1000, s: st.seenIds || [], r: st.result },
  }
}

export function selfChasePacket(st) {
  return { type: 'me', p: bikePacket(st.player) }
}

export function applyChaseSnapshot(st, snap) {
  const ids = new Set(snap.ps.map((pk) => pk.i))
  for (const q of st.players) if (q.isRemote && !ids.has(q.id)) q.gone = true
  for (const pk of snap.ps) {
    const q = st.players.find((x) => x.id === pk.i)
    if (!q) continue
    if (q.isPlayer) {
      // del host solo tomamos lo que decide él: atrapado y barra de acorralado
      if (pk.bu && !q.busted) {
        q.busted = true
        st.events.push('busted:' + q.id)
      }
      q.bust = pk.bs || 0
    } else {
      applyBikePacket(q, pk)
      q.bust = pk.bs || 0
    }
  }
  snap.po.forEach((a, i) => {
    const c = st.police[i]
    if (!c) return
    if (a[4] && !c.active) {
      c.active = true
      c.netT = undefined
      st.events.push('cop')
    }
    applyVehiclePacket(c, a)
  })
  snap.ca.forEach((a, i) => st.cars[i] && applyVehiclePacket(st.cars[i], a))
  st.evade = snap.tm.e
  st.seenIds = snap.tm.s
  if (snap.tm.r && !st.result) {
    st.result = snap.tm.r
    st.finishAt = st.time + 2.5
    afterResult(st)
  }
}

export function applyRemoteChasePlayer(st, id, pk) {
  const q = st.players.find((x) => x.id === id)
  if (!q || q.isPlayer) return
  const bust = q.bust
  const busted = q.busted
  applyBikePacket(q, pk)
  // el host es quien decide si alguien quedó atrapado
  q.bust = bust
  q.busted = busted
}

export function markChaseGone(st, id) {
  const q = st.players.find((x) => x.id === id)
  if (q) q.gone = true
}
