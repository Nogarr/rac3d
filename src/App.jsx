import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { createRace, getResults, LAPS, TRACK_KM } from './race'
import { createChase } from './chase'
import { BIKES } from './bikes'
import { settings, fmtTime, toast } from './shared'
import { bindKeyboard, resetInput } from './input'
import { Hud, TouchControls } from './Hud'
import { startAudio, setMuted, silence } from './audio'
import { tilt, enableGyro, calibrate } from './gyro'
import {
  net, onNet, hostRoom, joinRoom, leaveRoom, setLobby, broadcast, pickBike, inviteUrl, COLORS, NUMBERS,
} from './net'
import { netReceive, netGone } from './netsync'
import { Lobby, BikePicker } from './Lobby'

const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

// El visor de artifacts de Claude bloquea WebRTC: ahí el online no se ofrece
const ONLINE_OK = import.meta.env.MODE !== 'single' && typeof RTCPeerConnection !== 'undefined'

const MODES = [
  { id: 'race', name: 'Carrera', place: `Autódromo Las Toscas · ${TRACK_KM} km · ${LAPS} vueltas` },
  { id: 'chase', name: 'Escape', place: 'Barrio Puerto Nuevo · perdé a la policía' },
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
    return {
      mode: MODES.some((m) => m.id === v.mode) ? v.mode : 'race',
      bike: BIKES[v.bike] ? v.bike : 'dominar',
      name: typeof v.name === 'string' ? v.name : '',
    }
  } catch {
    return { mode: 'race', bike: 'dominar', name: '' }
  }
}

function roomFromUrl() {
  try {
    const c = new URLSearchParams(window.location.search).get('sala')
    return c && /^[A-Za-z]{4}$/.test(c) ? c.toUpperCase() : ''
  } catch {
    return ''
  }
}

export default function App() {
  const prefs = useRef(loadPrefs())
  const urlRoom = useRef(ONLINE_OK ? roomFromUrl() : '')
  const [mode, setMode] = useState(prefs.current.mode)
  const [bikeId, setBikeId] = useState(prefs.current.bike)
  const [phase, setPhase] = useState(urlRoom.current ? 'lobby' : 'menu')
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [results, setResults] = useState(null)
  const [sceneKey, setSceneKey] = useState(0)
  const [assist, setAssist] = useState(true)
  const [invert, setInvert] = useState(false)
  const [gyroState, setGyroState] = useState(isTouch ? 'idle' : 'none')
  const [portraitOk, setPortraitOk] = useState(false)
  const portrait = usePortrait()

  // online
  const [role, setRole] = useState('off')
  const [lobby, setLobbyState] = useState(net.lobby)
  const [netStatus, setNetStatus] = useState('')
  const [name, setName] = useState(prefs.current.name)
  const [joinCode, setJoinCode] = useState(urlRoom.current)
  const [onlineGame, setOnlineGame] = useState(false)

  const state = useRef(null)
  if (!state.current) state.current = newState(mode, bikeId)
  const pausedRef = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  pausedRef.current = paused && !onlineGame

  useEffect(() => {
    settings.assist = assist
  }, [assist])
  useEffect(() => {
    tilt.invert = invert
  }, [invert])
  useEffect(() => {
    try {
      localStorage.setItem('rueda-libre', JSON.stringify({ mode, bike: bikeId, name }))
    } catch {
      /* sin almacenamiento */
    }
  }, [mode, bikeId, name])

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
    if (!isTouch || !tilt.supported || tilt.enabled) return
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

  const launch = useCallback(() => {
    startAudio()
    resetInput()
    setResults(null)
    state.current.running = true
    setPaused(false)
    setPhase('countdown')
    if (tilt.receiving) calibrate()
  }, [])

  const begin = useCallback(
    (fresh) => {
      if (fresh) rebuild(mode, bikeId)
      launch()
    },
    [mode, bikeId, rebuild, launch]
  )

  const start = useCallback(() => {
    askGyro()
    if (isTouch) goFullscreen()
    begin(false)
  }, [askGyro, begin])

  // ---------- online ----------
  const launchOnline = useCallback(
    (msg) => {
      const opts = { humans: msg.humans, selfId: net.selfId, authority: net.role === 'host', aiFill: msg.aiFill, seed: msg.seed }
      const mine = msg.humans.find((h) => h.id === net.selfId)?.bike || bikeId
      state.current = msg.mode === 'race' ? createRace(msg.aiBike, opts) : createChase(mine, opts)
      setMode(msg.mode)
      setSceneKey((k) => k + 1)
      setOnlineGame(true)
      launch()
    },
    [bikeId, launch]
  )

  const startOnline = useCallback(() => {
    if (net.role !== 'host') return
    askGyro()
    if (isTouch) goFullscreen()
    const humans = net.lobby.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      bike: BIKES[p.bike] ? p.bike : 'dominar',
      color: COLORS[i % COLORS.length],
      num: NUMBERS[i % NUMBERS.length],
    }))
    const msg = { type: 'start', mode: net.lobby.mode, humans, aiBike: bikeId, aiFill: net.lobby.aiFill, seed: Math.floor(Math.random() * 1e9) }
    setLobby({ locked: true })
    broadcast(msg)
    launchOnline(msg)
  }, [askGyro, bikeId, launchOnline])

  const backToLobby = useCallback(() => {
    silence()
    resetInput()
    setOnlineGame(false)
    setResults(null)
    setPaused(false)
    if (net.role === 'host') setLobby({ locked: false })
    rebuild(net.lobby.mode, bikeId)
    setPhase('lobby')
  }, [bikeId, rebuild])

  const leaveOnline = useCallback(() => {
    leaveRoom()
    setRole('off')
    setLobbyState(net.lobby)
    setOnlineGame(false)
    silence()
    resetInput()
    setResults(null)
    setPaused(false)
    rebuild(mode, bikeId)
    setPhase('menu')
  }, [mode, bikeId, rebuild])

  const restart = useCallback(() => {
    if (onlineGame) {
      if (net.role === 'host') startOnline()
      return
    }
    begin(true)
  }, [onlineGame, startOnline, begin])

  const toMenu = useCallback(() => {
    if (onlineGame || net.role !== 'off') return leaveOnline()
    silence()
    resetInput()
    rebuild(mode, bikeId)
    setResults(null)
    setPaused(false)
    setPhase('menu')
  }, [onlineGame, leaveOnline, mode, bikeId, rebuild])

  // eventos de red
  const handlers = useRef({})
  handlers.current = { launchOnline, backToLobby, leaveOnline }
  useEffect(() => {
    const offs = [
      onNet('lobby', (l) => {
        setLobbyState({ ...l, players: [...l.players] })
        setRole(net.role)
      }),
      onNet('status', setNetStatus),
      onNet('error', (e) => setNetStatus(e)),
      onNet('msg', ({ from, msg }) => {
        if (msg.type === 'start' && net.role === 'client') handlers.current.launchOnline(msg)
        else if (msg.type === 'tolobby' && net.role === 'client') handlers.current.backToLobby()
        else netReceive(state.current, from, msg)
      }),
      onNet('left', (p) => {
        netGone(state.current, p.id)
        if (state.current?.online) toast(state.current, `${p.name.toUpperCase()} SE DESCONECTÓ`, 2.2)
      }),
      onNet('hostgone', () => {
        handlers.current.leaveOnline()
        setPhase('lobby')
        setNetStatus('Se cortó la conexión con el host.')
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [])
  useEffect(() => () => leaveRoom(), [])

  const onEvent = useRef(() => {})
  onEvent.current = (type) => {
    const st = state.current
    if (type === 'go') setPhase('race')
    else if (type === 'cop') toast(st, 'OTRO PATRULLERO EN CAMINO', 2)
    else if (type.startsWith('busted:')) {
      const id = type.slice(7)
      if (!st.online) return
      if (id === st.player.id) toast(st, 'TE ATRAPARON · TUS AMIGOS SIGUEN', 3)
      else toast(st, `ATRAPARON A ${(st.players.find((p) => p.id === id)?.name || '').toUpperCase()}`, 2.4)
    } else if (type === 'finish') {
      setResults(resultsOf(st))
      setPhase('finished')
    }
  }

  // online: los resultados se van completando mientras llegan los demás
  useEffect(() => {
    if (phase !== 'finished' || !onlineGame) return
    const t = setInterval(() => setResults(resultsOf(state.current)), 1000)
    return () => clearInterval(t)
  }, [phase, onlineGame])

  useEffect(
    () =>
      bindKeyboard((cmd) => {
        const ph = phaseRef.current
        if (cmd === 'pause' && (ph === 'race' || ph === 'countdown')) setPaused((p) => !p)
        if (cmd === 'blur' && (ph === 'race' || ph === 'countdown') && !state.current.online) setPaused(true)
        if (cmd === 'restart' && ph !== 'menu' && ph !== 'lobby') restart()
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
    if (paused && !onlineGame) {
      silence()
      resetInput()
    }
  }, [paused, onlineGame])

  const inRace = phase === 'race' || phase === 'countdown'
  const bike = BIKES[bikeId]
  const isHost = role === 'host'
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

            <BikePicker value={bikeId} onPick={(b) => pick(mode, b)} />
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
            <div className="row">
              <button type="button" className="btn-go" onClick={start} autoFocus>
                {mode === 'race' ? 'Largar' : 'Arrancar'}
              </button>
              {ONLINE_OK ? (
                <button type="button" className="btn-ghost" onClick={() => setPhase('lobby')}>
                  Con amigos
                </button>
              ) : (
                <span className="foot">El modo online anda en tu deploy, no dentro de Claude.</span>
              )}
            </div>
          </div>
        </section>
      )}

      {phase === 'lobby' && (
        <section className="overlay menu">
          <Lobby
            role={role}
            lobby={lobby}
            code={net.code}
            status={netStatus}
            selfId={net.selfId}
            name={name}
            setName={setName}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            bikeId={bikeId}
            onPickBike={(b) => {
              setBikeId(b)
              pickBike(b)
              rebuild(net.role === 'off' ? mode : net.lobby.mode, b)
            }}
            onCreate={() => {
              askGyro()
              setNetStatus('')
              hostRoom({ name: name.trim(), bike: bikeId, mode })
              setRole('host')
            }}
            onJoin={() => {
              askGyro()
              if (isTouch) goFullscreen()
              setNetStatus('')
              joinRoom(joinCode, { name: name.trim(), bike: bikeId })
              setRole('client')
            }}
            onLeave={() => {
              leaveOnline()
              setNetStatus('')
            }}
            onStart={startOnline}
            onMode={(m) => {
              setLobby({ mode: m })
              setMode(m)
              rebuild(m, bikeId)
            }}
            onAiFill={(v) => setLobby({ aiFill: v })}
            inviteUrl={net.code ? inviteUrl(net.code) : ''}
          />
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
            <h2 className="title-sm">{onlineGame ? 'Menú' : 'Pausa'}</h2>
            {onlineGame && <p className="meta small">La partida online sigue corriendo.</p>}
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
              {!onlineGame && <button type="button" className="btn-ghost" onClick={restart}>Reiniciar</button>}
              <button type="button" className="btn-ghost" onClick={toMenu}>{onlineGame ? 'Salir de la sala' : 'Menú'}</button>
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
            <p className="meta small">{onlineGame ? 'Carrera online' : `Copa ${bike.name}`}</p>
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
              {results.list.some((r) => r.estimated) ? ' · * todavía en pista, tiempo proyectado' : ''}
            </p>
            <FinishButtons online={onlineGame} isHost={isHost} onRestart={restart} onLobby={() => { if (isHost) broadcast({ type: 'tolobby' }); backToLobby() }} onMenu={toMenu} />
          </div>
        </section>
      )}

      {phase === 'finished' && results?.mode === 'chase' && (
        <section className="overlay center">
          <div className={'panel small chase-result ' + results.outcome}>
            <h2 className="title-sm">
              {results.outcome === 'escaped'
                ? onlineGame ? 'Los perdieron' : 'Los perdiste'
                : onlineGame ? 'Atraparon a todos' : 'Te atraparon'}
            </h2>
            <dl className="facts">
              <div>
                <dt>{results.outcome === 'escaped' ? 'Escape en' : 'Aguantaron'}</dt>
                <dd>{fmtTime(Math.max(0, results.time))}</dd>
              </div>
              <div><dt>Moto</dt><dd>{bike.name}</dd></div>
              <div><dt>Caídas</dt><dd>{results.crashes}</dd></div>
            </dl>
            {onlineGame && (
              <ul className="roster">
                {results.players.map((p) => (
                  <li key={p.id} style={{ '--c': p.color }}>
                    <span className="roster-name">{p.name}{p.self ? ' (vos)' : ''}</span>
                    <span className="roster-bike">{p.busted ? 'Atrapado' : 'Escapó'}</span>
                  </li>
                ))}
              </ul>
            )}
            <FinishButtons online={onlineGame} isHost={isHost} onRestart={restart} onLobby={() => { if (isHost) broadcast({ type: 'tolobby' }); backToLobby() }} onMenu={toMenu} />
          </div>
        </section>
      )}
    </div>
  )
}

function resultsOf(st) {
  return st.mode === 'race'
    ? { mode: 'race', list: getResults(st), best: st.player.bestLap, crashes: st.crashes }
    : {
        mode: 'chase',
        outcome: st.result,
        time: st.time - 2.5,
        crashes: st.crashes,
        players: st.players.filter((p) => !p.gone).map((p) => ({ id: p.id, name: p.name, color: p.color, busted: p.busted, self: p.isPlayer })),
      }
}

function FinishButtons({ online, isHost, onRestart, onLobby, onMenu }) {
  if (!online) {
    return (
      <div className="row">
        <button type="button" className="btn-go" onClick={onRestart} autoFocus>Revancha</button>
        <button type="button" className="btn-ghost" onClick={onMenu}>Menú</button>
      </div>
    )
  }
  return (
    <div className="row">
      {isHost ? (
        <>
          <button type="button" className="btn-go" onClick={onRestart} autoFocus>Revancha</button>
          <button type="button" className="btn-ghost" onClick={onLobby}>Volver a la sala</button>
        </>
      ) : (
        <p className="waiting">Esperando al host…</p>
      )}
      <button type="button" className="btn-ghost" onClick={onMenu}>Salir</button>
    </div>
  )
}
