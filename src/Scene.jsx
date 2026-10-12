import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { stepRace } from './race'
import { stepChase } from './chase'
import { TrackWorld, SUN } from './TrackScene'
import { CityWorld } from './CityScene'
import { Bike } from './Bike'
import { updateHud } from './Hud'
import { updateAnalog } from './input'
import { updateTilt } from './gyro'
import { updateAudio, updateSiren } from './audio'

const MOON = new THREE.Vector3(0.5, 0.55, -0.65).normalize()
const desired = new THREE.Vector3()
const target = new THREE.Vector3()

function Loop({ state, paused, onEvent, phase }) {
  const { camera, scene } = useThree()
  const light = useRef()
  const look = useRef(new THREE.Vector3())
  const orbit = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    if (light.current) scene.add(light.current.target)
  }, [scene])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state.current
    const city = st.mode === 'chase'
    updateAnalog(dt)
    updateTilt()
    if (!paused.current) (city ? stepChase : stepRace)(st, dt)
    while (st.events.length) onEvent.current(st.events.shift())

    const p = st.player
    const fx = Math.sin(p.yaw)
    const fz = Math.cos(p.yaw)
    const mode = phase.current
    const riding = mode === 'race' || mode === 'countdown'

    if (!riding) {
      orbit.current += dt * 0.18
      const a = p.yaw + Math.PI * 0.8 + orbit.current
      desired.set(p.x + Math.sin(a) * 5.2, 1.9, p.z + Math.cos(a) * 5.2)
      target.set(p.x, 0.9, p.z)
    } else {
      // cámara cerca, apenas por encima del casco
      const back = 3.4 + p.v * 0.03
      desired.set(p.x - fx * back, 1.75 + p.v * 0.008, p.z - fz * back)
      target.set(p.x + fx * 7, 1.15, p.z + fz * 7)
    }
    const k = first.current ? 1 : 1 - Math.exp(-dt * (riding ? 9 : 2.5))
    camera.position.lerp(desired, k)
    look.current.lerp(target, first.current ? 1 : 1 - Math.exp(-dt * 12))
    first.current = false
    if (st.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * st.shake * 0.3
      camera.position.y += (Math.random() - 0.5) * st.shake * 0.2
    }
    camera.lookAt(look.current)
    if (riding) camera.rotateZ(-p.lean * 0.3)
    const fov = 64 + p.v * 0.22
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4)
    camera.updateProjectionMatrix()

    if (light.current) {
      const L = city ? MOON : SUN
      light.current.position.set(p.x + L.x * 120, L.y * 120 + 40, p.z + L.z * 120)
      light.current.target.position.set(p.x, 0, p.z)
      light.current.target.updateMatrixWorld()
    }

    updateHud(st, dt)
    const live = st.running && !paused.current && mode !== 'finished'
    updateAudio(Math.min(1.05, p.rpm), p.throttle, live && p.crash <= 0, p.bike.redline)
    if (city) updateSiren(st.nearestCop, live && st.phase === 'race' && st.police.some((c) => c.active))
  }, -1)

  const city = state.current.mode === 'chase'
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={city ? 1.1 : 2.4}
      color={city ? '#cfd9ff' : '#ffd2a1'}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-45}
      shadow-camera-right={45}
      shadow-camera-top={45}
      shadow-camera-bottom={-45}
      shadow-camera-near={1}
      shadow-camera-far={400}
      shadow-bias={-0.0004}
    />
  )
}

export function Scene({ state, paused, onEvent, phase }) {
  const st = state.current
  const riders = st.mode === 'race' ? st.racers : [st.player]
  return (
    <>
      {st.mode === 'race' ? <TrackWorld race={state} /> : <CityWorld st={state} />}
      <Loop state={state} paused={paused} onEvent={onEvent} phase={phase} />
      {riders.map((r, i) => (
        <Bike key={`${i}-${r.bike.id}`} racer={r} />
      ))}
    </>
  )
}
