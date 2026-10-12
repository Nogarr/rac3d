import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { createRace, getResults, fmtTime, LAPS, TRACK_KM, settings } from './game'
import { bindKeyboard, resetInput } from './input'
import { Hud, TouchControls } from './Hud'
import { startAudio, setMuted, silence } from './audio'
import { tilt, enableGyro, calibrate } from './gyro'

const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

function usePortrait() {
  const q = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  const [p, setP] = useState(q)
  useEffect(() => {
    const on = () => setP(q())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return p
}

async function goFullscreen() {
  try {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    await window.screen?.orientation?.lock?.('landscape')
  } catch {
    /* algunos navegadores o vistas no lo permiten */
  }
}

export default function App() {
  const [phase, setPhase] = useState('menu')
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [results, setResults] = useState(null)
  const [raceKey, setRaceKey] = useState(0)
  const [assist, setAssist] = useState(true)
  const [invert, setInvert] = useState(false)
  const [gyroState, setGyroState] = useState(isTouch ? 'idle' : 'none')
  const [portraitOk, setPortraitOk] = useState(false)
  const portrait = usePortrait()

  const race = useRef(null)
  if (!race.current) race.current = createRace()
  const pausedRef = useRef(false)
  const phaseRef = useRef('menu')
  phaseRef.current = phase
  pausedRef.current = paused

  useEffect(() => {
    settings.assist = assist
  }, [assist])
  useEffect(() => {
    tilt.invert = invert
  }, [invert])

  // Tiene que llamarse dentro del toque (iOS pide permiso solo en un gesto)
  const askGyro = useCallback(() => {
    if (!isTouch || !tilt.supported) return
    enableGyro().then((ok) => {
      if (!ok) return setGyroState('denied')
      setGyroState('waiting')
      setTimeout(() => {
        if (tilt.receiving) {
          calibrate()
          setGyroState('on')
        } else setGyroState('nodata')
      }, 900)
    })
  }, [])

  const begin = useCallback((fresh) => {
    startAudio()
    resetInput()
    if (fresh) {
      race.current = createRace()
      setRaceKey((k) => k + 1)
      setResults(null)
    }
    race.current.running = true
    setPaused(false)
    setPhase('countdown')
    if (tilt.receiving) calibrate()
  }, [])

  const start = useCallback(() => {
    askGyro()
    if (isTouch) goFullscreen()
    begin(false)
  }, [askGyro, begin])
  const restart = useCallback(() => begin(true), [begin])

  const onEvent = useRef(() => {})
  onEvent.current = (type) => {
    if (type === 'go') setPhase('race')
    if (type === 'finish') {
      setResults(getResults(race.current))
      setPhase('finished')
    }
  }

  useEffect(
    () =>
      bindKeyboard((cmd) => {
        const ph = phaseRef.current
        if (cmd === 'pause' && (ph === 'race' || ph === 'countdown')) setPaused((p) => !p)
        if (cmd === 'blur' && (ph === 'race' || ph === 'countdown')) setPaused(true)
        if (cmd === 'restart' && ph !== 'menu') restart()
        if (cmd === 'mute') setMutedState((m) => !m)
        if (cmd === 'calibrate') calibrate()
        if (cmd === 'enter') {
          if (ph === 'menu') start()
          else if (ph === 'finished') restart()
        }
      }),
    [start, restart]
  )

  useEffect(() => {
    setMuted(muted)
  }, [muted])
  useEffect(() => {
    if (paused) {
      silence()
      resetInput()
    }
  }, [paused])

  const p = race.current.player
  const inRace = phase === 'race' || phase === 'countdown'
  const gyroLabel = {
    none: 'Cuerpo: teclas A / D o asistido',
    idle: 'Giroscopio: se activa al largar',
    waiting: 'Giroscopio: leyendo…',
    on: 'Giroscopio activo',
    denied: 'Giroscopio sin permiso: cuerpo asistido',
    nodata: 'Giroscopio no disponible acá: cuerpo asistido',
  }[gyroState]

  return (
    <div className="app">
      <Canvas
        shadows
        dpr={isTouch ? [1, 1.5] : [1, 1.75]}
        camera={{ fov: 60, near: 0.1, far: 2500, position: [10, 4, 140] }}
        gl={{ antialias: !isTouch, powerPreference: 'high-performance' }}
      >
        <Scene key={raceKey} race={race} paused={pausedRef} onEvent={onEvent} phase={phaseRef} />
      </Canvas>

      <Hud visible={inRace && !paused} onPause={() => setPaused(true)} />
      <TouchControls visible={isTouch && inRace && !paused} />

      {phase === 'menu' && (
        <section className="overlay menu">
          <div className="panel">
            <h1 className="title">Rueda<br />Libre</h1>
            <p className="meta">Las Toscas · {TRACK_KM} km · {LAPS} vueltas · largás 4º</p>
            {!isTouch && (
              <ul className="keys">
                <li><kbd>↑</kbd> gas</li>
                <li><kbd>←</kbd><kbd>→</kbd> manubrio</li>
                <li><kbd>A</kbd><kbd>D</kbd> cuerpo</li>
                <li><kbd>Z</kbd><kbd>X</kbd> cambios</li>
                <li><kbd>↓</kbd> freno del.</li>
                <li><kbd>Espacio</kbd> freno tras.</li>
              </ul>
            )}
            <button type="button" className="btn-go" onClick={start} autoFocus>Largar</button>
          </div>
        </section>
      )}

      {isTouch && portrait && !portraitOk && (phase === 'menu' || inRace) && (
        <section className="overlay center rotate">
          <div className="panel small">
            <div className="phone-icon" aria-hidden="true" />
            <h2 className="title-sm">Girá el celular</h2>
                        <button type="button" className="btn-ghost" onClick={() => setPortraitOk(true)}>Jugar igual</button>
          </div>
        </section>
      )}

      {paused && inRace && (
        <section className="overlay center">
          <div className="panel small">
            <h2 className="title-sm">Pausa</h2>
            <p className="sensor">{gyroLabel}</p>
            {tilt.receiving && (
              <div className="row">
                <button type="button" className="btn-ghost" onClick={calibrate}>Centrar</button>
                <label className="toggle">
                  <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} id="invert" />
                  <span>Invertir giro</span>
                </label>
              </div>
            )}
            <label className="toggle">
              <input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} id="assist-pause" />
              <span>Cuerpo asistido sin giroscopio</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={!muted} onChange={(e) => setMutedState(!e.target.checked)} id="sound" />
              <span>Sonido</span>
            </label>
            <details className="help">
              <summary>Cómo se maneja</summary>
              <p>Pulgar izquierdo: manubrio y cambios (+ / −). Derecho: GAS y frenos. Inclinás el teléfono para mover el cuerpo hacia adentro de la curva.</p>
              <p>Subí de cambio cuando la marcha se pone azul. El freno DEL frena fuerte pero con la moto inclinada te tira al piso; el TRAS se puede usar en la curva.</p>
            </details>
            <div className="row">
              <button type="button" className="btn-go" onClick={() => setPaused(false)} autoFocus>Seguir</button>
              <button type="button" className="btn-ghost" onClick={restart}>Reiniciar</button>
            </div>
          </div>
        </section>
      )}

      {phase === 'finished' && results && (
        <section className="overlay center">
          <div className="panel results">
            <div className="checker-strip" aria-hidden="true" />
                        <h2 className="title-sm">
              {results.findIndex((r) => r.isPlayer) === 0 ? 'Ganaste en Las Toscas' : `Terminaste ${results.findIndex((r) => r.isPlayer) + 1}º`}
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Pos</th><th>Piloto</th><th className="num">Tiempo</th><th className="num col-best">Mejor</th></tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="plate" style={{ '--c': r.color }}>{r.num}</span> {r.name}
                      </td>
                      <td className="num">
                        {i === 0 ? fmtTime(r.time) : '+' + (r.time - results[0].time).toFixed(3)}
                        {r.estimated ? '*' : ''}
                      </td>
                      <td className="num col-best">{fmtTime(r.best)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.some((r) => r.estimated) && <p className="foot">* tiempo proyectado</p>}
            <p className="foot">
              Tu mejor vuelta: {fmtTime(p.bestLap)} · Caídas: {race.current.crashes}
            </p>
            <button type="button" className="btn-go" onClick={restart} autoFocus>Revancha</button>
          </div>
        </section>
      )}
    </div>
  )
}
