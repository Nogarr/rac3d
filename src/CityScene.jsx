import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CITY, EXTENT, LINES, linePos, lineW, isAvenue, SIDEWALK } from './city'

const W0 = -70
const W1 = EXTENT + 70
const SPAN = W1 - W0

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------- piso: calles, veredas, sendas peatonales y demarcación en una textura ----------
function groundTexture() {
  const S = 2048
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const k = S / SPAN
  const X = (x) => (x - W0) * k
  const rect = (x0, z0, x1, z1, color) => {
    g.fillStyle = color
    g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k)
  }
  rect(W0, W0, W1, W1, '#8f8b84')
  const lo = -lineW(0) / 2
  const hi = EXTENT + lineW(0) / 2
  // calzadas
  for (let i = 0; i < LINES; i++) {
    const w = lineW(i)
    const p = linePos(i)
    rect(p - w / 2, lo, p + w / 2, hi, '#3a3d44')
    rect(lo, p - w / 2, hi, p + w / 2, '#3a3d44')
  }
  CITY.alleys.forEach((a) => rect(a.x0, a.z0, a.x1, a.z1, '#4a4b4f'))
  CITY.parks.forEach((p) => {
    rect(p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, '#5b7a3c')
    const mx = (p.x0 + p.x1) / 2
    const mz = (p.z0 + p.z1) / 2
    rect(mx - 1.5, p.z0, mx + 1.5, p.z1, '#b9ab8e')
    rect(p.x0, mz - 1.5, p.x1, mz + 1.5, '#b9ab8e')
  })
  // demarcación
  const dashes = (horizontal, line, off, color, width, dash, gap) => {
    g.fillStyle = color
    const p = linePos(line) + off
    for (let s = lo; s < hi; s += dash + gap) {
      if (horizontal) g.fillRect(X(s), X(p - width / 2), dash * k, width * k)
      else g.fillRect(X(p - width / 2), X(s), width * k, dash * k)
    }
  }
  for (let i = 0; i < LINES; i++) {
    for (const h of [true, false]) {
      if (isAvenue(i)) {
        dashes(h, i, -0.3, '#e8c34a', 0.22, 1000, 0)
        dashes(h, i, 0.3, '#e8c34a', 0.22, 1000, 0)
        dashes(h, i, -4.5, '#e9e6de', 0.2, 3, 5)
        dashes(h, i, 4.5, '#e9e6de', 0.2, 3, 5)
      } else dashes(h, i, 0, '#e9e6de', 0.18, 3, 6)
    }
  }
  // cruces: repintar asfalto y sendas peatonales
  for (let i = 0; i < LINES; i++) {
    for (let j = 0; j < LINES; j++) {
      const x = linePos(i)
      const z = linePos(j)
      const wx = lineW(i)
      const wz = lineW(j)
      rect(x - wx / 2, z - wz / 2, x + wx / 2, z + wz / 2, '#3a3d44')
      g.fillStyle = '#e9e6de'
      for (let s = -wx / 2 + 0.6; s < wx / 2 - 0.4; s += 1.2) {
        g.fillRect(X(x + s), X(z - wz / 2 - 4), 0.6 * k, 3 * k)
        g.fillRect(X(x + s), X(z + wz / 2 + 1), 0.6 * k, 3 * k)
      }
      for (let s = -wz / 2 + 0.6; s < wz / 2 - 0.4; s += 1.2) {
        g.fillRect(X(x - wx / 2 - 4), X(z + s), 3 * k, 0.6 * k)
        g.fillRect(X(x + wx / 2 + 1), X(z + s), 3 * k, 0.6 * k)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ---------- fachadas: 4 ventanas × 4 pisos por textura (16 m × 14 m) ----------
function facadeTextures() {
  const S = 512
  const make = () => {
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    return [c, c.getContext('2d')]
  }
  const [cm, m] = make()
  const [ce, e] = make()
  m.fillStyle = '#efebe3'
  m.fillRect(0, 0, S, S)
  e.fillStyle = '#000'
  e.fillRect(0, 0, S, S)
  const r = rng(11)
  const cw = S / 4
  const ch = S / 4
  for (let bx = 0; bx < 4; bx++)
    for (let by = 0; by < 4; by++) {
      const x = bx * cw + cw * 0.18
      const y = by * ch + ch * 0.22
      const w = cw * 0.64
      const h = ch * 0.56
      m.fillStyle = '#3c4a5c'
      m.fillRect(x, y, w, h)
      m.fillStyle = '#d8d3c8'
      m.fillRect(x - 3, y + h, w + 6, 5)
      if (r() < 0.38) {
        e.fillStyle = r() < 0.5 ? '#ffcf7a' : '#ffe6b0'
        e.fillRect(x, y, w, h)
      }
    }
  const map = new THREE.CanvasTexture(cm)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  const emi = new THREE.CanvasTexture(ce)
  emi.colorSpace = THREE.SRGBColorSpace
  emi.wrapS = emi.wrapT = THREE.RepeatWrapping
  return { map, emi }
}

function buildingsGeometry() {
  const r = rng(5)
  const geos = []
  const col = new THREE.Color()
  for (const b of CITY.buildings) {
    const w = b.x1 - b.x0
    const d = b.z1 - b.z0
    const g = new THREE.BoxGeometry(w, b.h, d)
    g.translate((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2)
    const uv = g.attributes.uv
    const du = Math.floor(r() * 4) * 0.25
    const dv = Math.floor(r() * 4) * 0.25
    const faces = [[d, b.h], [d, b.h], null, null, [w, b.h], [w, b.h]]
    faces.forEach((f, fi) => {
      for (let v = 0; v < 4; v++) {
        const idx = fi * 4 + v
        if (!f) uv.setXY(idx, 0.02, 0.02)
        else uv.setXY(idx, uv.getX(idx) * (f[0] / 16) + du, uv.getY(idx) * (f[1] / 14) + dv)
      }
    })
    col.set(b.color)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geos.push(g)
  }
  return mergeGeometries(geos)
}

function Buildings() {
  const geo = useMemo(buildingsGeometry, [])
  const tex = useMemo(facadeTextures, [])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors map={tex.map} emissiveMap={tex.emi} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.85} />
    </mesh>
  )
}

function Ground() {
  const tex = useMemo(groundTexture, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(W0 + W1) / 2, 0, (W0 + W1) / 2]} receiveShadow>
      <planeGeometry args={[SPAN, SPAN]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  )
}

function StreetFurniture() {
  const poles = useRef()
  const heads = useRef()
  const crowns = useRef()
  const trunks = useRef()
  const data = useMemo(() => {
    const r = rng(9)
    const lamps = []
    for (let i = 0; i < LINES; i++) {
      if (!isAvenue(i)) continue
      const off = lineW(i) / 2 + SIDEWALK * 0.5
      for (let s = 12; s < EXTENT; s += 32) {
        lamps.push([linePos(i) + off, s, 0], [linePos(i) - off, s + 16, Math.PI])
        lamps.push([s, linePos(i) + off, Math.PI / 2], [s + 16, linePos(i) - off, -Math.PI / 2])
      }
    }
    const trees = []
    CITY.parks.forEach((p) => {
      for (let n = 0; n < 9; n++) {
        const x = p.x0 + 5 + r() * (p.x1 - p.x0 - 10)
        const z = p.z0 + 5 + r() * (p.z1 - p.z0 - 10)
        const mx = (p.x0 + p.x1) / 2
        const mz = (p.z0 + p.z1) / 2
        if (Math.abs(x - mx) < 3 || Math.abs(z - mz) < 3) continue
        trees.push([x, z, 3 + r() * 2.5])
      }
    })
    return { lamps, trees }
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    data.lamps.forEach(([x, z, a], i) => {
      m.compose(new THREE.Vector3(x, 3.2, z), q, new THREE.Vector3(1, 1, 1))
      poles.current.setMatrixAt(i, m)
      q.setFromEuler(e.set(0, a, 0))
      const hx = x - Math.sin(a + Math.PI / 2) * 0
      m.compose(new THREE.Vector3(hx, 6.3, z), q, new THREE.Vector3(1, 1, 1))
      heads.current.setMatrixAt(i, m)
      q.identity()
    })
    data.trees.forEach(([x, z, s], i) => {
      m.compose(new THREE.Vector3(x, 2.2 + s * 0.5, z), q, new THREE.Vector3(s, s, s))
      crowns.current.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, 1.1, z), q, new THREE.Vector3(1, 2.2, 1))
      trunks.current.setMatrixAt(i, m)
    })
    ;[poles, heads, crowns, trunks].forEach((rf) => (rf.current.instanceMatrix.needsUpdate = true))
  }, [data])
  return (
    <group>
      <instancedMesh ref={poles} args={[null, null, data.lamps.length]}>
        <cylinderGeometry args={[0.08, 0.12, 6.4, 6]} />
        <meshStandardMaterial color="#3a3f48" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[null, null, data.lamps.length]}>
        <boxGeometry args={[0.5, 0.18, 0.9]} />
        <meshStandardMaterial color="#fff1c9" emissive="#ffd58a" emissiveIntensity={2.2} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[null, null, data.trees.length]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#3f6630" flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[null, null, data.trees.length]}>
        <cylinderGeometry args={[0.18, 0.24, 1, 6]} />
        <meshStandardMaterial color="#4a3627" />
      </instancedMesh>
    </group>
  )
}

// ---------- tráfico (instanciado) ----------
function Traffic({ st }) {
  const body = useRef()
  const cabin = useRef()
  const base = useRef()
  const n = st.current.cars.length
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), c: new THREE.Color(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }), [])
  useLayoutEffect(() => {
    st.current.cars.forEach((c, i) => {
      body.current.setColorAt(i, tmp.c.set(c.color))
      cabin.current.setColorAt(i, tmp.c.set(c.color).multiplyScalar(0.85))
    })
    body.current.instanceColor.needsUpdate = true
    cabin.current.instanceColor.needsUpdate = true
  }, [st, tmp])
  useFrame(() => {
    const { m, q, e, v, s } = tmp
    st.current.cars.forEach((c, i) => {
      q.setFromEuler(e.set(0, c.yaw, 0))
      const fx = Math.sin(c.yaw)
      const fz = Math.cos(c.yaw)
      m.compose(v.set(c.x, 0.62, c.z), q, s)
      body.current.setMatrixAt(i, m)
      m.compose(v.set(c.x - fx * 0.25, 1.2, c.z - fz * 0.25), q, s)
      cabin.current.setMatrixAt(i, m)
      m.compose(v.set(c.x, 0.3, c.z), q, s)
      base.current.setMatrixAt(i, m)
    })
    body.current.instanceMatrix.needsUpdate = true
    cabin.current.instanceMatrix.needsUpdate = true
    base.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={body} args={[null, null, n]} castShadow>
        <boxGeometry args={[1.8, 0.62, 4.3]} />
        <meshStandardMaterial roughness={0.35} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[null, null, n]} castShadow>
        <boxGeometry args={[1.62, 0.56, 2.2]} />
        <meshStandardMaterial roughness={0.2} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={base} args={[null, null, n]}>
        <boxGeometry args={[1.86, 0.36, 3.9]} />
        <meshStandardMaterial color="#111215" roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

function PoliceCar({ c, st }) {
  const g = useRef()
  const red = useRef()
  const blue = useRef()
  useFrame(() => {
    const on = c.active
    g.current.visible = on
    if (!on) return
    g.current.position.set(c.x, 0, c.z)
    g.current.rotation.y = c.yaw
    const t = (st.current.time + c.id * 0.13) * 6
    const a = Math.floor(t) % 2 === 0
    red.current.material.emissiveIntensity = a ? 4 : 0.2
    blue.current.material.emissiveIntensity = a ? 0.2 : 4
  })
  return (
    <group ref={g} visible={false}>
      <B3 p={[0, 0.62, 0]} s={[1.84, 0.64, 4.5]} c="#f2f2ef" />
      <B3 p={[0, 0.63, 0]} s={[1.86, 0.22, 4.52]} c="#1d3f8f" />
      <B3 p={[0, 1.2, -0.25]} s={[1.64, 0.56, 2.3]} c="#e9e9e6" />
      <B3 p={[0, 0.3, 0]} s={[1.9, 0.36, 4.1]} c="#111215" />
      <mesh ref={red} position={[0.38, 1.56, -0.2]}>
        <boxGeometry args={[0.62, 0.16, 0.3]} />
        <meshStandardMaterial color="#ff2a2a" emissive="#ff1a1a" emissiveIntensity={3} />
      </mesh>
      <mesh ref={blue} position={[-0.38, 1.56, -0.2]}>
        <boxGeometry args={[0.62, 0.16, 0.3]} />
        <meshStandardMaterial color="#2a6bff" emissive="#1a5cff" emissiveIntensity={3} />
      </mesh>
    </group>
  )
}

function B3({ p, s, c }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.35} metalness={0.25} />
    </mesh>
  )
}

export function CityWorld({ st }) {
  return (
    <>
      <color attach="background" args={['#56658f']} />
      <fog attach="fog" args={['#56658f', 90, 520]} />
      <hemisphereLight args={['#aebde6', '#3b3732', 1.05]} />
      <ambientLight intensity={0.2} />
      <Ground />
      <Buildings />
      <StreetFurniture />
      <Traffic st={st} />
      {st.current.police.map((c) => (
        <PoliceCar key={c.id} c={c} st={st} />
      ))}
    </>
  )
}
