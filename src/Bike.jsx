import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { plateTexture } from './textures'

// Moto paramétrica: cada modelo cambia distancia entre ejes, ruedas, altura y carrocería.
// Mira hacia +z; el grupo `lean` rota sobre la línea de contacto con el piso.

const DARK = '#17181c'
const METAL = '#7a7f88'

function B({ c, p, s, r, rough = 0.5, metal = 0.1, shadow = true }) {
  return (
    <mesh position={p} rotation={r} castShadow={shadow}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} />
    </mesh>
  )
}

function Wheel({ wheelRef, z, r, w, knobby }) {
  return (
    <group ref={wheelRef} position={[0, r, z]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, w, knobby ? 12 : 22]} />
        <meshStandardMaterial color="#111214" roughness={0.95} flatShading={knobby} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r * 0.68, r * 0.68, w + 0.01, 16]} />
        <meshStandardMaterial color={knobby ? '#9a9da3' : '#2a2c31'} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[w + 0.02, r * 1.3, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[w + 0.02, r * 1.3, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Body({ look, color, accent, plate }) {
  const { style, wb, rf, rr, seat, frame } = look
  const fz = wb / 2
  const rz = -wb / 2
  const parts = []
  // horquilla
  const forkTop = seat + 0.18
  const forkLen = Math.hypot(forkTop - rf, 0.22)
  parts.push(
    <B key="fl" c={style === 'enduro' ? '#c9a24a' : METAL} metal={0.7} p={[0.1, (forkTop + rf) / 2, fz - 0.11]} s={[0.045, forkLen, 0.045]} r={[-0.42, 0, 0]} />,
    <B key="fr" c={style === 'enduro' ? '#c9a24a' : METAL} metal={0.7} p={[-0.1, (forkTop + rf) / 2, fz - 0.11]} s={[0.045, forkLen, 0.045]} r={[-0.42, 0, 0]} />,
    <B key="bar" c={DARK} p={[0, forkTop + 0.04, fz - 0.24]} s={[style === 'enduro' ? 0.82 : 0.64, 0.035, 0.035]} />,
    <B key="eng" c={style === 'retro' ? '#8d9097' : '#2a2c31'} metal={0.5} p={[0, rr + 0.2, 0.02]} s={[0.3, 0.36, 0.48]} />,
    <B key="arm" c={METAL} metal={0.6} p={[0, rr + 0.04, rz / 2]} s={[0.22, 0.07, -rz]} />
  )
  if (style === 'muscle') {
    parts.push(
      <B key="tank" c={color} rough={0.3} p={[0, seat + 0.02, 0.18]} s={[0.48, 0.3, 0.6]} r={[0.08, 0, 0]} />,
      <B key="shr" c={accent} p={[0, seat - 0.12, 0.38]} s={[0.52, 0.2, 0.32]} r={[-0.2, 0, 0]} />,
      <B key="belly" c={DARK} p={[0, rr + 0.0, 0.08]} s={[0.34, 0.12, 0.6]} />,
      <B key="seat" c={DARK} p={[0, seat + 0.02, -0.34]} s={[0.32, 0.1, 0.56]} />,
      <B key="tail" c={color} rough={0.3} p={[0, seat + 0.07, -0.66]} s={[0.24, 0.14, 0.34]} r={[0.2, 0, 0]} />,
      <B key="exh" c="#3a3d44" metal={0.6} p={[0.2, rr + 0.12, -0.42]} s={[0.12, 0.14, 0.5]} r={[0.15, 0, 0]} />,
      <mesh key="hl" position={[0, seat + 0.12, fz - 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 20]} />
        <meshStandardMaterial color="#fffbe8" emissive="#fff3c8" emissiveIntensity={1.6} />
      </mesh>
    )
  } else if (style === 'sharp') {
    parts.push(
      <B key="tank" c={DARK} rough={0.35} p={[0, seat + 0.02, 0.16]} s={[0.36, 0.26, 0.52]} />,
      <B key="shl" c={color} rough={0.3} p={[0.2, seat - 0.02, 0.3]} s={[0.05, 0.28, 0.46]} r={[0.25, 0.12, 0]} />,
      <B key="shr" c={color} rough={0.3} p={[-0.2, seat - 0.02, 0.3]} s={[0.05, 0.28, 0.46]} r={[0.25, -0.12, 0]} />,
      <B key="trl" c={frame} p={[0.16, rr + 0.32, -0.08]} s={[0.035, 0.035, 0.7]} r={[0.5, 0, 0]} />,
      <B key="trr" c={frame} p={[-0.16, rr + 0.32, -0.08]} s={[0.035, 0.035, 0.7]} r={[0.5, 0, 0]} />,
      <B key="seat" c={DARK} p={[0, seat + 0.03, -0.3]} s={[0.26, 0.09, 0.46]} r={[-0.08, 0, 0]} />,
      <B key="tail" c={accent} rough={0.3} p={[0, seat + 0.13, -0.6]} s={[0.18, 0.1, 0.36]} r={[-0.3, 0, 0]} />,
      <B key="exh" c="#2c2e33" metal={0.6} p={[0.12, rr - 0.08, -0.06]} s={[0.16, 0.12, 0.34]} />,
      <mesh key="hl" position={[0, seat + 0.1, fz - 0.03]}>
        <boxGeometry args={[0.1, 0.2, 0.05]} />
        <meshStandardMaterial color="#fffbe8" emissive="#fff3c8" emissiveIntensity={1.6} />
      </mesh>
    )
  } else if (style === 'retro') {
    parts.push(
      <mesh key="tank" position={[0, seat + 0.04, 0.18]} scale={[0.22, 0.15, 0.32]} castShadow>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.3} />
      </mesh>,
      <B key="stripe" c={accent} p={[0, seat + 0.19, 0.18]} s={[0.06, 0.02, 0.5]} />,
      <B key="seat" c="#3b2a20" p={[0, seat + 0.02, -0.34]} s={[0.3, 0.1, 0.66]} />,
      <B key="tail" c={DARK} p={[0, seat - 0.06, -0.7]} s={[0.24, 0.08, 0.2]} />,
      <B key="shl" c="#c9ccd2" metal={0.8} p={[0.16, rr + 0.25, -0.58]} s={[0.04, 0.42, 0.04]} r={[-0.3, 0, 0]} />,
      <B key="shr" c="#c9ccd2" metal={0.8} p={[-0.16, rr + 0.25, -0.58]} s={[0.04, 0.42, 0.04]} r={[-0.3, 0, 0]} />,
      <B key="exh" c="#c9ccd2" metal={0.9} rough={0.2} p={[0.19, rr + 0.06, -0.38]} s={[0.09, 0.09, 0.72]} r={[0.08, 0, 0]} />,
      <mesh key="hl" position={[0, seat + 0.1, fz - 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.11, 0.12, 20]} />
        <meshStandardMaterial color="#c9ccd2" metalness={0.9} roughness={0.2} emissive="#fff3c8" emissiveIntensity={0.6} />
      </mesh>
    )
  } else {
    // enduro
    parts.push(
      <B key="fend" c={accent} p={[0, rf * 2 + 0.06, fz + 0.06]} s={[0.16, 0.035, 0.52]} r={[-0.12, 0, 0]} />,
      <B key="tank" c={color} rough={0.35} p={[0, seat - 0.02, 0.2]} s={[0.3, 0.24, 0.44]} />,
      <B key="shl" c={color} rough={0.35} p={[0.17, seat - 0.08, 0.34]} s={[0.05, 0.26, 0.3]} r={[0.2, 0.1, 0]} />,
      <B key="shr" c={color} rough={0.35} p={[-0.17, seat - 0.08, 0.34]} s={[0.05, 0.26, 0.3]} r={[0.2, -0.1, 0]} />,
      <B key="seat" c={DARK} p={[0, seat + 0.02, -0.28]} s={[0.24, 0.09, 0.78]} />,
      <B key="side" c={accent} p={[0, seat - 0.1, -0.48]} s={[0.3, 0.2, 0.36]} />,
      <B key="tail" c={accent} p={[0, seat + 0.0, -0.84]} s={[0.18, 0.04, 0.4]} r={[0.12, 0, 0]} />,
      <B key="exh" c="#3a3d44" metal={0.6} p={[0.18, seat - 0.06, -0.5]} s={[0.1, 0.1, 0.5]} r={[-0.15, 0, 0]} />,
      <B key="mask" c={accent} p={[0, seat + 0.16, fz - 0.12]} s={[0.24, 0.28, 0.06]} r={[-0.3, 0, 0]} />,
      <mesh key="hl" position={[0, seat + 0.16, fz - 0.08]}>
        <boxGeometry args={[0.12, 0.1, 0.03]} />
        <meshStandardMaterial color="#fffbe8" emissive="#fff3c8" emissiveIntensity={1.6} />
      </mesh>
    )
  }
  // número lateral
  parts.push(
    <mesh key="pl" position={[0.152, seat - 0.02, -0.5]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[0.24, 0.16]} />
      <meshStandardMaterial map={plate} />
    </mesh>,
    <mesh key="pr" position={[-0.152, seat - 0.02, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[0.24, 0.16]} />
      <meshStandardMaterial map={plate} />
    </mesh>
  )
  return parts
}

export function Bike({ racer, suit }) {
  const root = useRef()
  const lean = useRef()
  const fw = useRef()
  const rw = useRef()
  const rider = useRef()
  const tail = useRef()
  const look = racer.bike.look
  const color = racer.isPlayer || !racer.color ? look.color : racer.color
  const plate = useMemo(() => plateTexture(racer.num ?? 77, color), [racer.num, color])
  const seat = look.seat
  const sport = look.style === 'muscle' || look.style === 'sharp'
  const knobby = look.style === 'enduro'

  useFrame((_, dt) => {
    if (!root.current) return
    root.current.position.set(racer.x, 0, racer.z)
    root.current.rotation.y = racer.yaw
    lean.current.rotation.z = racer.lean
    const d = Math.min(dt, 0.05)
    fw.current.rotation.x += (racer.v * d) / look.rf
    rw.current.rotation.x += (racer.v * d) / look.rr
    const b = racer.crash > 0 ? 0 : racer.body || 0
    rider.current.position.x += (-b * 0.2 - rider.current.position.x) * Math.min(1, d * 10)
    rider.current.rotation.z += (b * 0.28 - rider.current.rotation.z) * Math.min(1, d * 10)
    tail.current.material.emissiveIntensity = racer.braking ? 5 : 0.8
  })

  const lean0 = sport ? 0.95 : 0.55 // inclinación del torso
  const hipZ = -0.28
  const hipY = seat + 0.14
  return (
    <group ref={root}>
      <group ref={lean}>
        <Wheel wheelRef={fw} z={look.wb / 2} r={look.rf} w={knobby ? 0.12 : 0.13} knobby={knobby} />
        <Wheel wheelRef={rw} z={-look.wb / 2} r={look.rr} w={look.style === 'muscle' ? 0.2 : knobby ? 0.14 : 0.17} knobby={knobby} />
        <Body look={look} color={color} accent={look.accent} plate={plate} />
        <mesh ref={tail} position={[0, seat + 0.06, -look.wb / 2 - 0.2]}>
          <boxGeometry args={[0.12, 0.05, 0.02]} />
          <meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={0.8} />
        </mesh>
        <group ref={rider}>
          {/* torso, casco, brazos y piernas */}
          <B c={suit || racer.suit || '#1b2238'} p={[0, hipY + 0.26 * Math.cos(lean0), hipZ + 0.26 * Math.sin(lean0)]} s={[0.4, 0.56, 0.28]} r={[lean0, 0, 0]} />
          <mesh position={[0, hipY + 0.56 * Math.cos(lean0) + 0.1, hipZ + 0.56 * Math.sin(lean0) + 0.05]} castShadow>
            <sphereGeometry args={[0.16, 16, 12]} />
            <meshStandardMaterial color={color} roughness={0.2} />
          </mesh>
          <mesh position={[0, hipY + 0.56 * Math.cos(lean0) + 0.1, hipZ + 0.56 * Math.sin(lean0) + 0.18]}>
            <boxGeometry args={[0.2, 0.08, 0.06]} />
            <meshStandardMaterial color="#0d0f14" roughness={0.1} metalness={0.4} />
          </mesh>
          {[1, -1].map((s) => (
            <group key={s}>
              <B c={suit || racer.suit || '#1b2238'} p={[s * 0.2, hipY + 0.32, 0.12]} s={[0.09, 0.09, 0.5]} r={[sport ? 0.35 : 0.05, 0, 0]} />
              <B c={suit || racer.suit || '#1b2238'} p={[s * 0.2, hipY - 0.1, hipZ + 0.14]} s={[0.13, 0.13, 0.42]} r={[-0.3, 0, 0]} />
              <B c={DARK} p={[s * 0.22, hipY - 0.36, hipZ + 0.0]} s={[0.11, 0.42, 0.11]} r={[0.3, 0, 0]} />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

// Miniatura para el menú
export function BikePreview({ bike }) {
  const fake = useMemo(
    () => ({ bike, x: 0, z: 0, yaw: 0, lean: 0, v: 0, body: 0, crash: 0, braking: 0, isPlayer: true, num: 77 }),
    [bike]
  )
  return <Bike racer={fake} />
}
