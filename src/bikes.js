// Fichas de las motos (aprox. de fábrica) y la física derivada de ellas.
// El empuje por marcha sale del torque, el régimen de corte y la relación de cada marcha:
//   a = T · ω_corte · η / (v_corte_marcha · masa)
// La velocidad máxima aparece sola, cuando la potencia se iguala con la resistencia del aire.

const G = 9.81
const RIDER = 75 // kg
const ETA = 0.88 // pérdidas de transmisión

export const BIKES = {
  dominar: {
    id: 'dominar',
    name: 'Dominar 400',
    tag: 'Naked touring, la más potente y pesada',
    cc: 373, hp: 40, hpRpm: 8800, nm: 35, nmRpm: 6500, redline: 9500, idle: 1400,
    kg: 193, topKmh: 148,
    gearTopKmh: [0, 56, 80, 102, 122, 140, 158],
    torque: [[0.15, 0.58], [0.45, 0.86], [0.68, 1], [0.93, 0.91], [1, 0.82]],
    cda: 0.58, crr: 0.015,
    front: 9.8, rear: 4.6, abs: true,
    leanLimit: 0.8, leanRate: 1.75, offroad: 0.6, highside: 0.09,
    look: { style: 'muscle', color: '#8c1d24', accent: '#141518', frame: '#2a2c31', wb: 1.45, rf: 0.31, rr: 0.32, seat: 0.8 },
  },
  duke: {
    id: 'duke',
    name: 'Duke 200',
    tag: 'Liviana y filosa, gira más que ninguna',
    cc: 200, hp: 25, hpRpm: 10000, nm: 19.3, nmRpm: 8000, redline: 10500, idle: 1600,
    kg: 159, topKmh: 136,
    gearTopKmh: [0, 50, 72, 92, 110, 126, 143],
    torque: [[0.15, 0.48], [0.5, 0.78], [0.76, 1], [0.95, 0.91], [1, 0.84]],
    cda: 0.44, crr: 0.015,
    front: 9.6, rear: 4.3, abs: true,
    leanLimit: 0.86, leanRate: 2.5, offroad: 0.6, highside: 0.06,
    look: { style: 'sharp', color: '#ff6a00', accent: '#f2f2f0', frame: '#ff6a00', wb: 1.36, rf: 0.3, rr: 0.31, seat: 0.82 },
  },
  nz250: {
    id: 'nz250',
    name: 'NZ250',
    tag: 'Naked clásica, noble y pareja',
    cc: 249, hp: 24, hpRpm: 7500, nm: 23, nmRpm: 6000, redline: 9000, idle: 1300,
    kg: 138, topKmh: 125,
    gearTopKmh: [0, 47, 68, 86, 102, 117, 132],
    torque: [[0.15, 0.6], [0.45, 0.88], [0.67, 1], [0.83, 0.99], [1, 0.8]],
    cda: 0.57, crr: 0.016,
    front: 8.8, rear: 4.0, abs: false,
    leanLimit: 0.78, leanRate: 2.1, offroad: 0.62, highside: 0.05,
    look: { style: 'retro', color: '#4f565e', accent: '#b8202a', frame: '#1c1d20', wb: 1.38, rf: 0.3, rr: 0.31, seat: 0.79 },
  },
  tornado: {
    id: 'tornado',
    name: 'Tornado 250',
    tag: 'Trail con cubiertas de taco: anda en la grava',
    cc: 249, hp: 23, hpRpm: 7500, nm: 24.3, nmRpm: 6000, redline: 9000, idle: 1300,
    kg: 140, topKmh: 128,
    gearTopKmh: [0, 42, 66, 86, 103, 118, 133],
    torque: [[0.15, 0.66], [0.45, 0.9], [0.67, 1], [0.83, 0.89], [1, 0.76]],
    cda: 0.52, crr: 0.017,
    front: 8.0, rear: 3.4, abs: false,
    leanLimit: 0.7, leanRate: 1.95, offroad: 0.95, highside: 0.05,
    look: { style: 'enduro', color: '#c4161c', accent: '#f4f4f2', frame: '#1c1d20', wb: 1.42, rf: 0.36, rr: 0.33, seat: 0.88 },
  },
}

export const BIKE_LIST = ['dominar', 'duke', 'nz250', 'tornado'].map((k) => BIKES[k])

// Derivados físicos
for (const b of BIKE_LIST) {
  b.mass = b.kg + RIDER
  b.gearTop = b.gearTopKmh.map((k) => k / 3.6)
  const wRed = (b.redline * 2 * Math.PI) / 60
  b.push = b.gearTop.map((v, i) => (i === 0 ? 0 : Math.min(7.4, (b.nm * wRed * ETA) / (v * b.mass))))
  b.engBrake = 2.6
}

export function torqueFrac(b, r) {
  if (r >= 1) return 0
  const t = b.torque
  if (r <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (r <= t[i][0]) {
      const [r0, v0] = t[i - 1]
      const [r1, v1] = t[i]
      return v0 + ((v1 - v0) * (r - r0)) / (r1 - r0)
    }
  }
  return t[t.length - 1][1]
}

export function dragAcc(b, v, extra = 0) {
  return (0.5 * 1.2 * b.cda * v * v) / b.mass + b.crr * G + extra
}

// Empuje con la mejor marcha posible (para la IA, que cambia perfecto)
export function bestDrive(b, v) {
  let best = 0
  for (let g = 1; g <= 6; g++) {
    const r = Math.max(v / b.gearTop[g], 0.4)
    if (v / b.gearTop[g] > 0.98) continue
    best = Math.max(best, b.push[g] * torqueFrac(b, r))
  }
  return best
}

export function topSpeed(b) {
  let v = 0
  for (let i = 0; i < 20000; i++) {
    const a = bestDrive(b, v) - dragAcc(b, v)
    if (a <= 0.0005) break
    v += a * 0.01
  }
  return v
}
