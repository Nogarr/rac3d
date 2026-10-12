import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import {
  HALF, CURB, GRAVEL, WALL, S0, L, sample, distToCenter, bounds,
  ribbonGeometry, wallGeometry,
} from './track'
import {
  asphaltTexture, curbTexture, gravelTexture, wallTexture, checkerTexture, bannerTexture,
} from './textures'

export const SUN = new THREE.Vector3(-0.45, 0.13, -1).normalize()
const startSmp = sample(S0, {})
const START_YAW = Math.atan2(startSmp.tx, startSmp.tz)

// Pseudoaleatorio con semilla: la escenografía es igual en cada carga
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function Track() {
  const tex = useMemo(() => {
    const curb = curbTexture()
    const gravel = gravelTexture()
    gravel.repeat.set(2, 1)
    return {
      asphalt: asphaltTexture(),
      curb,
      gravel,
      wall: wallTexture(),
    }
  }, [])
  const geo = useMemo(
    () => ({
      road: ribbonGeometry(-HALF, HALF, 16, 0.03),
      curbR: ribbonGeometry(HALF, HALF + CURB, 3, 0.05),
      curbL: ribbonGeometry(-HALF - CURB, -HALF, 3, 0.05),
      gravR: ribbonGeometry(HALF + CURB, WALL, 6, 0.02),
      gravL: ribbonGeometry(-WALL, -HALF - CURB, 6, 0.02),
      wallR: wallGeometry(WALL, 0.95, 64, true),
      wallL: wallGeometry(-WALL, 0.95, 64, false),
    }),
    []
  )
  return (
    <group>
      <mesh geometry={geo.road} receiveShadow>
        <meshStandardMaterial map={tex.asphalt} roughness={0.92} />
      </mesh>
      <mesh geometry={geo.curbR} receiveShadow>
        <meshStandardMaterial map={tex.curb} roughness={0.7} />
      </mesh>
      <mesh geometry={geo.curbL} receiveShadow>
        <meshStandardMaterial map={tex.curb} roughness={0.7} />
      </mesh>
      <mesh geometry={geo.gravR} receiveShadow>
        <meshStandardMaterial map={tex.gravel} roughness={1} />
      </mesh>
      <mesh geometry={geo.gravL} receiveShadow>
        <meshStandardMaterial map={tex.gravel} roughness={1} />
      </mesh>
      <mesh geometry={geo.wallR} castShadow receiveShadow>
        <meshStandardMaterial map={tex.wall} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.wallL} castShadow receiveShadow>
        <meshStandardMaterial map={tex.wall} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function StartGate({ race }) {
  const checker = useMemo(() => checkerTexture(16, 3), [])
  const banner = useMemo(() => bannerTexture(), [])
  const lamps = useRef([])
  const w = HALF + CURB + 1.2

  useFrame(() => {
    const r = race.current
    lamps.current.forEach((m, i) => {
      if (!m) return
      let color = '#2a0a08'
      let intensity = 0.2
      if (r.running && r.phase === 'grid' && r.countdown <= 3 - i) {
        color = '#ff2a12'
        intensity = 4
      } else if (r.phase === 'race' && r.time < 1.6) {
        color = '#3dff6a'
        intensity = 4
      }
      m.material.emissive.set(color)
      m.material.emissiveIntensity = intensity
    })
  })

  return (
    <group position={[startSmp.x, 0, startSmp.z]} rotation={[0, START_YAW, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2, 2.4]} />
        <meshStandardMaterial map={checker} roughness={0.8} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * w, 3.4, 0]} castShadow>
          <boxGeometry args={[0.7, 6.8, 0.7]} />
          <meshStandardMaterial color="#1d2a52" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 6.6, 0]} castShadow>
        <boxGeometry args={[w * 2 + 0.7, 1.3, 0.6]} />
        <meshStandardMaterial color="#141b33" />
      </mesh>
      <mesh position={[0, 6.6, -0.31]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w * 2, 1.2]} />
        <meshStandardMaterial map={banner} />
      </mesh>
      <mesh position={[0, 5.45, -0.1]}>
        <boxGeometry args={[4.4, 0.9, 0.5]} />
        <meshStandardMaterial color="#0e0f12" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(e) => (lamps.current[i] = e)} position={[(i - 1) * 1.3, 5.45, -0.38]}>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshStandardMaterial color="#160404" emissive="#2a0a08" emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function Grandstand() {
  const crowd = useRef()
  const STEPS = 6
  const LEN = 70
  const x0 = -(WALL + 5)
  const count = 260
  useLayoutEffect(() => {
    const r = rng(7)
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const palette = ['#e3392c', '#f1ede4', '#1d2a52', '#ffb000', '#2a55cf', '#1fb5a6', '#3a3a3a', '#8d5bd8']
    for (let i = 0; i < count; i++) {
      const step = Math.floor(r() * STEPS)
      const z = (r() - 0.5) * (LEN - 4)
      m.makeTranslation(x0 - step * 1.6 - 0.8, (step + 1) * 0.8 + 0.4, z)
      crowd.current.setMatrixAt(i, m)
      crowd.current.setColorAt(i, c.set(palette[(r() * palette.length) | 0]))
    }
    crowd.current.instanceMatrix.needsUpdate = true
    crowd.current.instanceColor.needsUpdate = true
  }, [])
  return (
    <group position={[startSmp.x, 0, startSmp.z]} rotation={[0, START_YAW, 0]}>
      {Array.from({ length: STEPS }, (_, i) => (
        <mesh key={i} position={[x0 - i * 1.6 - 0.8, (i + 1) * 0.4, 5]} castShadow receiveShadow>
          <boxGeometry args={[1.6, (i + 1) * 0.8, LEN]} />
          <meshStandardMaterial color={i % 2 ? '#c9c3b6' : '#b7b0a2'} />
        </mesh>
      ))}
      <instancedMesh ref={crowd} args={[null, null, count]} castShadow position={[0, 0, 5]}>
        <boxGeometry args={[0.5, 0.8, 0.45]} />
        <meshStandardMaterial />
      </instancedMesh>
      <mesh position={[x0 - STEPS * 0.8, 8.4, 5]} rotation={[0, 0, 0.08]} castShadow>
        <boxGeometry args={[STEPS * 1.6 + 2.5, 0.25, LEN + 2]} />
        <meshStandardMaterial color="#1d2a52" />
      </mesh>
      {[-30, -10, 10, 30].map((z) => (
        <mesh key={z} position={[x0 - STEPS * 1.6 + 0.2, 4.2, z + 5]}>
          <boxGeometry args={[0.3, 8.4, 0.3]} />
          <meshStandardMaterial color="#1d2a52" />
        </mesh>
      ))}
    </group>
  )
}

function Trees() {
  const round = useRef()
  const roundTrunk = useRef()
  const poplar = useRef()
  const data = useMemo(() => {
    const r = rng(42)
    const b = bounds()
    const rounds = []
    let tries = 0
    while (rounds.length < 380 && tries < 6000) {
      tries++
      const x = b.minX - 220 + r() * (b.maxX - b.minX + 440)
      const z = b.minZ - 220 + r() * (b.maxZ - b.minZ + 440)
      // zona tribuna
      const lx = x - startSmp.x
      const lz = z - startSmp.z
      if (Math.abs(lx) < 45 && Math.abs(lz) < 60) continue
      if (distToCenter(x, z) < WALL + 7) continue
      rounds.push([x, z, 4 + r() * 4, 2 + r() * 1.8])
    }
    // cortinas de álamos rompeviento
    const poplars = []
    const rows = [
      [-90, -350, -90, 330, 9],
      [120, -180, 120, 190, 10],
      [380, -320, 380, 300, 9],
      [-40, 360, 330, 360, 10],
    ]
    rows.forEach(([x0, z0, x1, z1, step]) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      for (let d = 0; d < len; d += step) {
        const x = x0 + ((x1 - x0) * d) / len + (r() - 0.5) * 2
        const z = z0 + ((z1 - z0) * d) / len + (r() - 0.5) * 2
        if (distToCenter(x, z) < WALL + 6) continue
        poplars.push([x, z, 13 + r() * 6])
      }
    })
    return { rounds, poplars }
  }, [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const c = new THREE.Color()
    const greens = ['#3f6b2c', '#4d7a33', '#365e28', '#5a8338', '#2f5426']
    data.rounds.forEach(([x, z, h, rad], i) => {
      m.compose(new THREE.Vector3(x, h * 0.55 + 1.6, z), q, new THREE.Vector3(rad, h * 0.55, rad))
      round.current.setMatrixAt(i, m)
      round.current.setColorAt(i, c.set(greens[i % greens.length]))
      m.compose(new THREE.Vector3(x, 1, z), q, new THREE.Vector3(1, 2, 1))
      roundTrunk.current.setMatrixAt(i, m)
    })
    data.poplars.forEach(([x, z, h], i) => {
      m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(1.4, h, 1.4))
      poplar.current.setMatrixAt(i, m)
      poplar.current.setColorAt(i, c.set(i % 3 ? '#557a2e' : '#6b8c34'))
    })
    ;[round, roundTrunk, poplar].forEach((ref) => {
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    })
  }, [data])

  return (
    <group>
      <instancedMesh ref={round} args={[null, null, data.rounds.length]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roundTrunk} args={[null, null, data.rounds.length]}>
        <cylinderGeometry args={[0.22, 0.3, 1, 6]} />
        <meshStandardMaterial color="#4a3627" />
      </instancedMesh>
      <instancedMesh ref={poplar} args={[null, null, data.poplars.length]} castShadow>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

function Hills() {
  const hills = useMemo(() => {
    const r = rng(3)
    const b = bounds()
    const cx = (b.minX + b.maxX) / 2
    const cz = (b.minZ + b.maxZ) / 2
    return Array.from({ length: 26 }, (_, i) => {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2
      const d = 720 + r() * 260
      return [cx + Math.cos(a) * d, cz + Math.sin(a) * d, 60 + r() * 90, 140 + r() * 120]
    })
  }, [])
  return hills.map(([x, z, h, rad], i) => (
    <mesh key={i} position={[x, h / 2 - 4, z]}>
      <coneGeometry args={[rad, h, 6]} />
      <meshStandardMaterial color={i % 2 ? '#5a6a52' : '#6b7558'} flatShading roughness={1} />
    </mesh>
  ))
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[150, 0, 0]} receiveShadow>
      <planeGeometry args={[4000, 4000]} />
      <meshStandardMaterial color="#5b7a3a" roughness={1} />
    </mesh>
  )
}

export function TrackWorld({ race }) {
  return (
    <>
      <color attach="background" args={['#e9b98f']} />
      <fog attach="fog" args={['#e3b48d', 160, 1050]} />
      <Sky
        distance={4500}
        sunPosition={[SUN.x * 100, SUN.y * 100, SUN.z * 100]}
        turbidity={7}
        rayleigh={2.2}
        mieCoefficient={0.006}
        mieDirectionalG={0.86}
      />
      <hemisphereLight args={['#ffe2c2', '#46582f', 0.9]} />
      <ambientLight intensity={0.15} />
      <Ground />
      <Track />
      <StartGate race={race} />
      <Grandstand />
      <Trees />
      <Hills />
    </>
  )
}
