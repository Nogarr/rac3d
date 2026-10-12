// Ciudad "Barrio Puerto Nuevo": cuadrícula de 9×9 manzanas con avenidas cada 3 cuadras,
// calles internas, callejones que cruzan algunas manzanas y plazas.

export const BLOCK = 64 // distancia entre ejes de calles
export const LINES = 10 // calles por eje (0..9)
export const EXTENT = (LINES - 1) * BLOCK
export const SIDEWALK = 3
export const ALLEY = 5

export const isAvenue = (i) => i % 3 === 0
export const lineW = (i) => (isAvenue(i) ? 20 : 11)
export const linePos = (i) => i * BLOCK

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const AVENUE_NAMES = ['Av. del Puerto', 'Av. Belgrano', 'Av. Mitre', 'Av. Costanera']
const STREET_NAMES = ['Lavalle', 'Brown', 'Alsina', 'Moreno', 'Rivadavia', 'Paz', 'Sarmiento', 'Güemes', 'Dorrego', 'Laprida']
export function streetName(axis, i) {
  if (isAvenue(i)) return AVENUE_NAMES[i / 3]
  return STREET_NAMES[(i + axis * 5) % STREET_NAMES.length]
}

function generate() {
  const r = rng(2026)
  const buildings = []
  const parks = []
  const alleys = []
  const palette = ['#c9c1b3', '#b7a891', '#d6d0c4', '#a9b3bd', '#c2a48b', '#9aa49a', '#d9c8a9', '#b9b2c4', '#a99a8e']

  for (let i = 0; i < LINES - 1; i++) {
    for (let j = 0; j < LINES - 1; j++) {
      const bx0 = linePos(i) + lineW(i) / 2 + SIDEWALK
      const bx1 = linePos(i + 1) - lineW(i + 1) / 2 - SIDEWALK
      const bz0 = linePos(j) + lineW(j) / 2 + SIDEWALK
      const bz1 = linePos(j + 1) - lineW(j + 1) / 2 - SIDEWALK
      const nearAv = isAvenue(i) || isAvenue(i + 1) || isAvenue(j) || isAvenue(j + 1)
      if (r() < 0.06 && !(i === 4 && j === 4)) {
        parks.push({ x0: bx0 - SIDEWALK, z0: bz0 - SIDEWALK, x1: bx1 + SIDEWALK, z1: bz1 + SIDEWALK })
        continue
      }
      const subs = []
      if (r() < 0.5) {
        const alongX = r() < 0.5 // el callejón corre a lo largo de X (corta en Z)
        if (alongX) {
          const c = (bz0 + bz1) / 2 + (r() - 0.5) * 12
          subs.push([bx0, bz0, bx1, c - ALLEY / 2], [bx0, c + ALLEY / 2, bx1, bz1])
          alleys.push({ x0: bx0 - SIDEWALK, z0: c - ALLEY / 2, x1: bx1 + SIDEWALK, z1: c + ALLEY / 2 })
        } else {
          const c = (bx0 + bx1) / 2 + (r() - 0.5) * 12
          subs.push([bx0, bz0, c - ALLEY / 2, bz1], [c + ALLEY / 2, bz0, bx1, bz1])
          alleys.push({ x0: c - ALLEY / 2, z0: bz0 - SIDEWALK, x1: c + ALLEY / 2, z1: bz1 + SIDEWALK })
        }
      } else subs.push([bx0, bz0, bx1, bz1])

      for (const [x0, z0, x1, z1] of subs) {
        const longX = x1 - x0 >= z1 - z0
        const len = longX ? x1 - x0 : z1 - z0
        const n = len > 34 ? 1 + Math.floor(r() * 3) : 1
        let a = longX ? x0 : z0
        for (let k = 0; k < n; k++) {
          const end = k === n - 1 ? (longX ? x1 : z1) : a + len / n + (r() - 0.5) * 6
          const tall = r() < 0.1
          const h = tall ? 46 + r() * 30 : 9 + r() * 18 + (nearAv ? 10 + r() * 12 : 0)
          const color = palette[Math.floor(r() * palette.length)]
          buildings.push(
            longX
              ? { x0: a, z0, x1: end, z1, h, color }
              : { x0, z0: a, x1, z1: end, h, color }
          )
          a = end
        }
      }
    }
  }
  // anillo exterior cerrado: la ciudad no tiene salida
  const o = lineW(0) / 2 + SIDEWALK
  const far = 60
  buildings.push(
    { x0: -far - o, z0: -far - o, x1: -o, z1: EXTENT + far + o, h: 34, color: '#8f8a80', ring: true },
    { x0: EXTENT + o, z0: -far - o, x1: EXTENT + far + o, z1: EXTENT + far + o, h: 34, color: '#8f8a80', ring: true },
    { x0: -o, z0: -far - o, x1: EXTENT + o, z1: -o, h: 34, color: '#8f8a80', ring: true },
    { x0: -o, z0: EXTENT + o, x1: EXTENT + o, z1: EXTENT + far + o, h: 34, color: '#8f8a80', ring: true }
  )
  return { buildings, parks, alleys }
}

export const CITY = generate()

// ---------- índice espacial ----------
const CELL = BLOCK
const OFF = 2 // celdas extra para el anillo
const GRID = LINES + OFF * 2 + 1
const cells = Array.from({ length: GRID * GRID }, () => [])
const cellOf = (v) => Math.max(0, Math.min(GRID - 1, Math.floor(v / CELL) + OFF))
CITY.buildings.forEach((b, idx) => {
  for (let cx = cellOf(b.x0); cx <= cellOf(b.x1); cx++)
    for (let cz = cellOf(b.z0); cz <= cellOf(b.z1); cz++) cells[cx * GRID + cz].push(idx)
})

function near(x, z) {
  const cx = cellOf(x)
  const cz = cellOf(z)
  const out = new Set()
  for (let a = cx - 1; a <= cx + 1; a++)
    for (let b = cz - 1; b <= cz + 1; b++) {
      if (a < 0 || b < 0 || a >= GRID || b >= GRID) continue
      for (const i of cells[a * GRID + b]) out.add(i)
    }
  return out
}

export function insideBuilding(x, z, pad = 0) {
  const cx = cellOf(x)
  const cz = cellOf(z)
  for (const i of cells[cx * GRID + cz]) {
    const b = CITY.buildings[i]
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true
  }
  return false
}

// Empuja un círculo fuera de los edificios. Devuelve la normal del choque más fuerte (o null).
export function collideCircle(o, r) {
  let hit = null
  let maxPen = 0
  for (const i of near(o.x, o.z)) {
    const b = CITY.buildings[i]
    const cx = Math.max(b.x0, Math.min(o.x, b.x1))
    const cz = Math.max(b.z0, Math.min(o.z, b.z1))
    let dx = o.x - cx
    let dz = o.z - cz
    let d2 = dx * dx + dz * dz
    if (d2 >= r * r) continue
    let nx, nz, pen
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2)
      nx = dx / d
      nz = dz / d
      pen = r - d
    } else {
      // el centro quedó adentro: salir por la cara más cercana
      const opts = [
        [o.x - b.x0, -1, 0], [b.x1 - o.x, 1, 0], [o.z - b.z0, 0, -1], [b.z1 - o.z, 0, 1],
      ].sort((p, q) => p[0] - q[0])
      nx = opts[0][1]
      nz = opts[0][2]
      pen = opts[0][0] + r
    }
    o.x += nx * pen
    o.z += nz * pen
    if (pen > maxPen) {
      maxPen = pen
      hit = { nx, nz }
    }
  }
  return hit
}

// Línea de visión entre dos puntos (true = no hay edificios en el medio)
export function lineOfSight(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.ceil(len / 3)
  for (let k = 1; k < n; k++) {
    const t = k / n
    if (insideBuilding(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.5)) return false
  }
  return true
}

// ---------- grafo de calles ----------
export const DIRS = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
]
export const nodeId = (i, j) => i * LINES + j
export const nodeIJ = (id) => [Math.floor(id / LINES), id % LINES]
export function neighbor(id, d) {
  const [i, j] = nodeIJ(id)
  const ni = i + DIRS[d][0]
  const nj = j + DIRS[d][1]
  if (ni < 0 || nj < 0 || ni >= LINES || nj >= LINES) return -1
  return nodeId(ni, nj)
}
export function nodePos(id) {
  const [i, j] = nodeIJ(id)
  return [linePos(i), linePos(j)]
}
export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(LINES - 1, Math.round(x / BLOCK)))
  const j = Math.max(0, Math.min(LINES - 1, Math.round(z / BLOCK)))
  return nodeId(i, j)
}
// ancho de la calle por la que va un tramo que sale de `id` en dirección d
export function edgeWidth(id, d) {
  const [i, j] = nodeIJ(id)
  return DIRS[d][0] !== 0 ? lineW(j) : lineW(i)
}
// carriles de mano derecha
export function laneOffsets(width) {
  return width > 15 ? [2.6, 6.4] : [2.8]
}

// Distancias en el grafo hacia un nodo (BFS)
export function bfsFrom(target) {
  const dist = new Int16Array(LINES * LINES).fill(9999)
  const q = [target]
  dist[target] = 0
  while (q.length) {
    const n = q.shift()
    for (let d = 0; d < 4; d++) {
      const m = neighbor(n, d)
      if (m >= 0 && dist[m] > dist[n] + 1) {
        dist[m] = dist[n] + 1
        q.push(m)
      }
    }
  }
  return dist
}

// Proyección sobre la calle más cercana (para reaparecer tras una caída)
export function snapToStreet(x, z) {
  const i = Math.round(x / BLOCK)
  const j = Math.round(z / BLOCK)
  const cx = Math.max(0, Math.min(LINES - 1, i)) * BLOCK
  const cz = Math.max(0, Math.min(LINES - 1, j)) * BLOCK
  if (Math.abs(x - cx) < Math.abs(z - cz)) return { x: cx + 2.8, z: Math.max(0, Math.min(EXTENT, z)), yaw: 0 }
  return { x: Math.max(0, Math.min(EXTENT, x)), z: cz - 2.8, yaw: Math.PI / 2 }
}
