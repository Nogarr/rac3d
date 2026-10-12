import * as THREE from 'three'

// Medidas de pista en metros
export const HALF = 7.5 // medio ancho de asfalto
export const CURB = 1.3 // pianos
export const GRAVEL = 3.6 // cama de grava
export const WALL = HALF + CURB + GRAVEL // distancia del eje al muro
export const S0 = 80 // metro del eje donde está la línea de largada

// Trazado del Autódromo Las Toscas (x, z). Sentido horario visto desde arriba.
const CONTROL = [
  [0, 200], [0, 40], [0, -180], [30, -280], [120, -330], [220, -300],
  [255, -210], [205, -130], [190, -50], [250, 20], [310, 110], [280, 230],
  [170, 285], [70, 270],
]

const SCALE = 1.3
const curve = new THREE.CatmullRomCurve3(
  CONTROL.map(([x, z]) => new THREE.Vector3(x * SCALE, 0, z * SCALE)),
  true,
  'centripetal'
)

export const N = 1600
const pts = curve.getSpacedPoints(N)
export const L = curve.getLength()
export const DS = L / N

const P = new Float32Array(N * 2)
const T = new Float32Array(N * 2)
const K = new Float32Array(N)

for (let i = 0; i < N; i++) {
  P[i * 2] = pts[i].x
  P[i * 2 + 1] = pts[i].z
}
for (let i = 0; i < N; i++) {
  const a = (i - 1 + N) % N
  const b = (i + 1) % N
  const tx = P[b * 2] - P[a * 2]
  const tz = P[b * 2 + 1] - P[a * 2 + 1]
  const len = Math.hypot(tx, tz) || 1
  T[i * 2] = tx / len
  T[i * 2 + 1] = tz / len
}
// Curvatura con signo: positiva = la pista dobla a la derecha
const raw = new Float32Array(N)
for (let i = 0; i < N; i++) {
  const a = (i - 1 + N) % N
  const b = (i + 1) % N
  const dx = T[b * 2] - T[a * 2]
  const dz = T[b * 2 + 1] - T[a * 2 + 1]
  const rx = -T[i * 2 + 1]
  const rz = T[i * 2]
  raw[i] = (dx * rx + dz * rz) / (2 * DS)
}
const W = 12
for (let i = 0; i < N; i++) {
  let sum = 0
  for (let j = -W; j <= W; j++) sum += raw[(i + j + N) % N]
  K[i] = sum / (W * 2 + 1)
}

const wrap = (s) => ((s % L) + L) % L

export function sample(s, o) {
  const f = wrap(s) / DS
  const fi = Math.floor(f)
  const i = fi % N
  const j = (i + 1) % N
  const a = f - fi
  o.x = P[i * 2] + (P[j * 2] - P[i * 2]) * a
  o.z = P[i * 2 + 1] + (P[j * 2 + 1] - P[i * 2 + 1]) * a
  let tx = T[i * 2] + (T[j * 2] - T[i * 2]) * a
  let tz = T[i * 2 + 1] + (T[j * 2 + 1] - T[i * 2 + 1]) * a
  const len = Math.hypot(tx, tz) || 1
  tx /= len
  tz /= len
  o.tx = tx
  o.tz = tz
  o.rx = -tz
  o.rz = tx
  o.k = K[i] + (K[j] - K[i]) * a
  return o
}

export function kAt(s) {
  const f = wrap(s) / DS
  return K[Math.floor(f) % N]
}

export function maxAbsK(s, step, dist) {
  let m = 0
  for (let d = 0; d <= dist; d += step) {
    const k = Math.abs(kAt(s + d))
    if (k > m) m = k
  }
  return m
}

// Distancia mínima aproximada de un punto al eje (para ubicar escenografía)
export function distToCenter(x, z, stride = 4) {
  let m = Infinity
  for (let i = 0; i < N; i += stride) {
    const dx = P[i * 2] - x
    const dz = P[i * 2 + 1] - z
    const d = dx * dx + dz * dz
    if (d < m) m = d
  }
  return Math.sqrt(m)
}

export function bounds() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, P[i * 2]); maxX = Math.max(maxX, P[i * 2])
    minZ = Math.min(minZ, P[i * 2 + 1]); maxZ = Math.max(maxZ, P[i * 2 + 1])
  }
  return { minX, maxX, minZ, maxZ }
}

export function centerline(stride = 8) {
  const out = []
  for (let i = 0; i < N; i += stride) out.push([P[i * 2], P[i * 2 + 1]])
  return out
}

// Cinta horizontal entre dos desplazamientos laterales
export function ribbonGeometry(off0, off1, vScale, y = 0) {
  const count = (N + 1) * 2
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  for (let i = 0; i <= N; i++) {
    const m = i % N
    const cx = P[m * 2], cz = P[m * 2 + 1]
    const rx = -T[m * 2 + 1], rz = T[m * 2]
    const offs = [off0, off1]
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s
      pos[v * 3] = cx + rx * offs[s]
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = cz + rz * offs[s]
      nor[v * 3 + 1] = 1
      uv[v * 2] = s
      uv[v * 2 + 1] = (i * DS) / vScale
    }
  }
  const idx = []
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, b, c, b, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

// Muro vertical a un desplazamiento lateral
export function wallGeometry(off, height, uScale, flip) {
  const count = (N + 1) * 2
  const pos = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  for (let i = 0; i <= N; i++) {
    const m = i % N
    const cx = P[m * 2] + -T[m * 2 + 1] * off
    const cz = P[m * 2 + 1] + T[m * 2] * off
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s
      pos[v * 3] = cx
      pos[v * 3 + 1] = s * height
      pos[v * 3 + 2] = cz
      uv[v * 2] = ((flip ? -1 : 1) * i * DS) / uScale
      uv[v * 2 + 1] = s
    }
  }
  const idx = []
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
