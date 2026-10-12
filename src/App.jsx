import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { createRace, getResults, LAPS, TRACK_KM } from './race'
import { createChase } from './chase'
import { BIKE_LIST, BIKES } from './bikes'
import { settings, fmtTime } from './shared'
import { bindKeyboard, resetInput } from './input'
import { Hud, TouchControls } from './Hud'
import { startAudio, setMuted, silence } from './audio'
import { tilt, enableGyro, calibrate } from './gyro'

const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

const MODES = [
  { id: 'race', name: 'Carrera', place: `Autódromo Las Toscas · ${TRACK_KM} km · ${LAPS} vueltas` },
  { id: 'chase', name: 'Escape', place: 'Barrio Puerto Nuevo · perdé a la policía' },
]

// Para las barras comparativas del menú
const maxOf = (k) => Math.max(...BIKE_LIST.map((b) => b[k]))
const STATS = [
  ['Potencia', (b) => b.hp / maxOf('hp')],
  ['Agilidad', (b) => (b.leanRate / maxOf('leanRate')) * 0.6 + (b.leanLimit / maxOf('leanLimit')) * 0.4],
  ['Frenos', (b) => b.front / maxOf('front')],
]

function newState(mode, bikeId) {
  return mode === 'chase' ? createChase(bikeId) : createRace(bikeId)
}

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

function loadPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem('rueda-libre') || '{}')
    return { mode: MODES.some((m) => m.id === v.mode) ? v.mode : 'race', bike: BIKES[v.bike] ? v.bike : 'dominar' }
  } catch {
    return { mode: 'race', bike: 'dominar' }
  }
}

export default function App() {
  const prefs = useRef(loadPrefs())
  const [mode, setMode] = useState(prefs.current.mode)
  const [bikeId, setBikeId] = useState(prefs.current.bike)
  const [phase, setPhase] = useState('menu')
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [results, setResults] = useState(null)
  const [sceneKey, setSceneKey] = useState(0)
  const [assist, setAssist] = useState(true)
  const [invert, setInvert] = useState(false)
  const [gyroState, setGyroState] = useState(isTouch ? 'idle' : 'none')
  const [portraitOk, setPortraitOk] = useState(false)
  const portrait = usePortrait()

  const state = useRef(null)
  if (!state.current) state.current = newState(mode, bikeId)
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
  useEffect(() => {
    try {
      localStorage.setItem('rueda-libre', JSON.stringify({ mode, bike: bikeId }))
    } catch {
      /* sin almacenamiento */
    }
  }, [mode, bikeId])

  const rebuild = useCallback((m, b) => {
    state.current = newState(m, b)
    setSceneKey((k) => k + 1)
  }, [])

  const pick = (m, b) => {
    setMode(m)
    setBikeId(b)
    rebuild(m, b)
  }

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

  const begin = useCallback(
    (fresh) => {
      startAudio()
      resetInput()
      if (fresh) rebuild(mode, bikeId)
      setResults(null)
      state.current.running = true
      setPaused(false)
      setPhase('countdown')
      if (tilt.receiving) calibrate()
    },
    [mode, bikeId, rebuild]
  )

  const start = useCallback(() => {
    askGyro()
    if (isTouch) goFullscreen()
    begin(false)
  }, [askGyro, begin])
  const restart = useCallback(() => begin(true), [begin])
  const toMenu = useCallback(() => {
    silence()
    resetInput()
    rebuild(mode, bikeId)
    setResults(null)
    setPaused(false)
    setPhase('menu')
  }, [mode, bikeId, rebuild])

  const onEvent = useRef(() => {})
  onEvent.current = (type) => {
    const st = state.current
    if (type === 'go') setPhase('race')
    if (type === 'finish') {
      setResults(
        st.mode === 'race'
          ? { mode: 'race', list: getResults(st), best: st.player.bestLap, crashes: st.crashes }
          : { mode: 'chase', outcome: st.result, time: st.time - 2.5, crashes: st.crashes }
      )
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

  const inRace = phase === 'race' || phase === 'countdown'
  const bike = BIKES[bikeId]
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
        camera={{ fov: 62, near: 0.1, far: 2500, position: [10, 4, 140] }}
        gl={{ antialias: !isTouch, powerPreference: 'high-performance' }}
      >
        <Scene key={sceneKey} state={state} paused={pausedRef} onEvent={onEvent} phase={phaseRef} />
      </Canvas>

      <Hud visible={inRace && !paused} mode={mode} onPause={() => setPaused(true)} />
      <TouchControls visible={isTouch && inRace && !paused} />

      {phase === 'menu' && (
        <section className="overlay menu">
          <div className="panel menu-panel">
            <h1 className="title">Rueda Libre</h1>

            <div className="seg" role="radiogroup" aria-label="Modo">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  className={'seg-btn' + (mode === m.id ? ' on' : '')}
                  onClick={() => mode !== m.id && pick(m.id, bikeId)}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <p className="meta">{MODES.find((m) => m.id === mode).place}</p>

            <div className="bikes" role="radiogroup" aria-label="Moto">
              {BIKE_LIST.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={bikeId === b.id}
                  className={'bike-card' + (bikeId === b.id ? ' on' : '')}
                  style={{ '--c': b.look.color }}
                  onClick={() => bikeId !== b.id && pick(mode, b.id)}
                >
                  <span className="bike-name">{b.name}</span>
                  <span className="bike-spec">
                    {b.cc} cc · {b.hp} CV · {b.nm} Nm
                  </span>
                  <span className="bike-spec">
                    {b.kg} kg · {b.topKmh} km/h
                  </span>
                  <span className="bike-bars">
                    {STATS.map(([label, f]) => (
                      <span key={label} className="bar-row">
                        <small>{label}</small>
                        <i style={{ '--v': f(b).toFixed(2) }} />
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <p className="meta small">{bike.tag}</p>

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
            <button type="button" className="btn-go" onClick={start} autoFocus>
              {mode === 'race' ? 'Largar' : 'Arrancar'}
            </button>
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
              <p>El manubrio inclina la moto y la inclinación la hace doblar. Cada moto tiene un límite: si lo pasás, patina y te caés. El número en grados se pone rojo cuando estás al límite.</p>
              <p>Frenar o acelerar a fondo inclinado achica ese límite. Con el freno trasero podés corregir dentro de la curva. Subí de cambio cuando la marcha se pone azul.</p>
            </details>
            <div className="row">
              <button type="button" className="btn-go" onClick={() => setPaused(false)} autoFocus>Seguir</button>
              <button type="button" className="btn-ghost" onClick={restart}>Reiniciar</button>
              <button type="button" className="btn-ghost" onClick={toMenu}>Menú</button>
            </div>
          </div>
        </section>
      )}

      {phase === 'finished' && results?.mode === 'race' && (
        <section className="overlay center">
          <div className="panel results">
            <div className="checker-strip" aria-hidden="true" />
            <h2 className="title-sm">
              {results.list.findIndex((r) => r.isPlayer) === 0
                ? 'Ganaste en Las Toscas'
                : `Terminaste ${results.list.findIndex((r) => r.isPlayer) + 1}º`}
            </h2>
            <p className="meta small">Copa {bike.name}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Pos</th><th>Piloto</th><th className="num">Tiempo</th><th className="num col-best">Mejor</th></tr>
                </thead>
                <tbody>
                  {results.list.map((r, i) => (
                    <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="plate" style={{ '--c': r.color }}>{r.num}</span> {r.name}
                      </td>
                      <td className="num">
                        {i === 0 ? fmtTime(r.time) : '+' + (r.time - results.list[0].time).toFixed(3)}
                        {r.estimated ? '*' : ''}
                      </td>
                      <td className="num col-best">{fmtTime(r.best)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="foot">
              Tu mejor vuelta: {fmtTime(results.best)} · Caídas: {results.crashes}
              {results.list.some((r) => r.estimated) ? ' · * tiempo proyectado' : ''}
            </p>
            <div className="row">
              <button type="button" className="btn-go" onClick={restart} autoFocus>Revancha</button>
              <button type="button" className="btn-ghost" onClick={toMenu}>Menú</button>
            </div>
          </div>
        </section>
      )}

      {phase === 'finished' && results?.mode === 'chase' && (
        <section className="overlay center">
          <div className={'panel small chase-result ' + results.outcome}>
            <h2 className="title-sm">{results.outcome === 'escaped' ? 'Los perdiste' : 'Te atraparon'}</h2>
            <dl className="facts">
              <div>
                <dt>{results.outcome === 'escaped' ? 'Escapaste en' : 'Aguantaste'}</dt>
                <dd>{fmtTime(Math.max(0, results.time))}</dd>
              </div>
              <div><dt>Moto</dt><dd>{bike.name}</dd></div>
              <div><dt>Caídas</dt><dd>{results.crashes}</dd></div>
            </dl>
            <div className="row">
              <button type="button" className="btn-go" onClick={restart} autoFocus>Otra vez</button>
              <button type="button" className="btn-ghost" onClick={toMenu}>Menú</button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
