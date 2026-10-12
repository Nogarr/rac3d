import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { plateTexture } from './textures'

const DARK = '#1a1c21'
const METAL = '#6d727c'

function Part({ color, rough = 0.5, metal = 0.1, children, ...props }) {
  return (
    <mesh castShadow {...props}>
      {children}
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  )
}

function Wheel({ wheelRef, position }) {
  return (
    <group ref={wheelRef} position={position}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.33, 0.33, 0.17, 20]} />
        <meshStandardMaterial color="#121214" roughness={0.9} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.18, 16]} />
        <meshStandardMaterial color={METAL} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.19, 0.5, 0.06]} />
        <meshStandardMaterial color="#2a2d33" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.19, 0.5, 0.06]} />
        <meshStandardMaterial color="#2a2d33" />
      </mesh>
    </group>
  )
}

export function Bike({ racer }) {
  const root = useRef()
  const lean = useRef()
  const fw = useRef()
  const rw = useRef()
  const rider = useRef()
  const tail = useRef()
  const plate = useMemo(() => plateTexture(racer.num, racer.color), [racer.num, racer.color])

  useFrame((_, dt) => {
    if (!root.current) return
    root.current.position.set(racer.x, 0, racer.z)
    root.current.rotation.y = racer.yaw
    lean.current.rotation.z = racer.lean
    const spin = (racer.v * Math.min(dt, 0.05)) / 0.33
    fw.current.rotation.x += spin
    rw.current.rotation.x += spin
    // el piloto se cuelga hacia adentro de la curva (derecha = -x local)
    const b = racer.crash > 0 ? 0 : racer.body
    rider.current.position.x += (-b * 0.2 - rider.current.position.x) * Math.min(1, dt * 10)
    rider.current.rotation.z += (b * 0.28 - rider.current.rotation.z) * Math.min(1, dt * 10)
    tail.current.material.emissiveIntensity = racer.braking ? 5 : 0.8
  })

  return (
    <group ref={root}>
      <group ref={lean}>
        <Wheel wheelRef={fw} position={[0, 0.33, 0.74]} />
        <Wheel wheelRef={rw} position={[0, 0.33, -0.7]} />
        {/* motor y basculante */}
        <Part color={DARK} position={[0, 0.52, 0.04]}><boxGeometry args={[0.32, 0.36, 0.52]} /></Part>
        <Part color={METAL} metal={0.6} position={[0, 0.38, -0.36]}><boxGeometry args={[0.2, 0.08, 0.72]} /></Part>
        {/* horquilla */}
        <Part color={METAL} metal={0.7} position={[0.1, 0.62, 0.64]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.04, 0.62, 0.04]} /></Part>
        <Part color={METAL} metal={0.7} position={[-0.1, 0.62, 0.64]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.04, 0.62, 0.04]} /></Part>
        {/* tanque y carenado */}
        <Part color={racer.color} rough={0.3} position={[0, 0.8, 0.14]}><boxGeometry args={[0.36, 0.32, 0.76]} /></Part>
        <Part color={racer.color} rough={0.3} position={[0, 0.8, 0.6]} rotation={[-0.35, 0, 0]}><boxGeometry args={[0.44, 0.52, 0.34]} /></Part>
        <mesh position={[0, 1.1, 0.7]} rotation={[-0.6, 0, 0]}>
          <boxGeometry args={[0.34, 0.2, 0.03]} />
          <meshStandardMaterial color="#9fc3d9" transparent opacity={0.45} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.84, 0.795]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.3, 0.24]} />
          <meshStandardMaterial map={plate} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.66, 0.8]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshStandardMaterial color="#fff6dc" emissive="#fff1c4" emissiveIntensity={2} />
        </mesh>
        {/* asiento y colín */}
        <Part color={DARK} position={[0, 0.94, -0.32]}><boxGeometry args={[0.3, 0.12, 0.5]} /></Part>
        <Part color={racer.color} rough={0.3} position={[0, 1.0, -0.62]} rotation={[0.25, 0, 0]}><boxGeometry args={[0.28, 0.2, 0.42]} /></Part>
        <mesh position={[0.142, 1.0, -0.62]} rotation={[0.25, Math.PI / 2, 0]}>
          <planeGeometry args={[0.36, 0.17]} />
          <meshStandardMaterial map={plate} />
        </mesh>
        <mesh position={[-0.142, 1.0, -0.62]} rotation={[0.25, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.36, 0.17]} />
          <meshStandardMaterial map={plate} />
        </mesh>
        <mesh ref={tail} position={[0, 1.0, -0.84]}>
          <boxGeometry args={[0.14, 0.05, 0.02]} />
          <meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={0.8} />
        </mesh>
        {/* escape */}
        <Part color="#8b8f98" metal={0.8} rough={0.25} position={[0.17, 0.62, -0.62]} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.5, 10]} />
        </Part>
        {/* piloto */}
        <group ref={rider}>
        <Part color={racer.suit} position={[0, 1.2, -0.06]} rotation={[0.95, 0, 0]}><boxGeometry args={[0.4, 0.56, 0.3]} /></Part>
        <Part color={racer.color} rough={0.2} position={[0, 1.36, 0.26]}><sphereGeometry args={[0.16, 16, 12]} /></Part>
        <mesh position={[0, 1.36, 0.39]}>
          <boxGeometry args={[0.2, 0.08, 0.06]} />
          <meshStandardMaterial color="#0d0f14" roughness={0.1} metalness={0.4} />
        </mesh>
        <Part color={racer.suit} position={[0.19, 1.17, 0.3]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.09, 0.09, 0.44]} /></Part>
        <Part color={racer.suit} position={[-0.19, 1.17, 0.3]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.09, 0.09, 0.44]} /></Part>
        <Part color={racer.suit} position={[0.2, 0.94, -0.12]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.13, 0.13, 0.44]} /></Part>
        <Part color={racer.suit} position={[-0.2, 0.94, -0.12]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.13, 0.13, 0.44]} /></Part>
        <Part color={DARK} position={[0.22, 0.7, -0.3]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.11, 0.42, 0.11]} /></Part>
        <Part color={DARK} position={[-0.22, 0.7, -0.3]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.11, 0.42, 0.11]} /></Part>
        </group>
      </group>
    </group>
  )
}
