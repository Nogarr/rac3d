import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BIKE_LIST, BIKES } from './bikes'
import { MAX_PLAYERS, COLORS } from './net'

const maxOf = (k) => Math.max(...BIKE_LIST.map((b) => b[k]))
const STATS = [
  ['Potencia', (b) => b.hp / maxOf('hp')],
  ['Agilidad', (b) => (b.leanRate / maxOf('leanRate')) * 0.6 + (b.leanLimit / maxOf('leanLimit')) * 0.4],
  ['Frenos', (b) => b.front / maxOf('front')],
]

export function BikePicker({ value, onPick, compact }) {
  return (
    <div className={'bikes' + (compact ? ' compact' : '')} role="radiogroup" aria-label="Moto">
      {BIKE_LIST.map((b) => (
        <button
          key={b.id}
          type="button"
          role="radio"
          aria-checked={value === b.id}
          className={'bike-card' + (value === b.id ? ' on' : '')}
          style={{ '--c': b.look.color }}
          onClick={() => value !== b.id && onPick(b.id)}
        >
          <span className="bike-name">{b.name}</span>
          <span className="bike-spec">
            {b.cc} cc · {b.hp} CV · {b.nm} Nm
          </span>
          {!compact && (
            <span className="bike-spec">
              {b.kg} kg · {b.topKmh} km/h
            </span>
          )}
          {!compact && (
            <span className="bike-bars">
              {STATS.map(([label, f]) => (
                <span key={label} className="bar-row">
                  <small>{label}</small>
                  <i style={{ '--v': f(b).toFixed(2) }} />
                </span>
              ))}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Invite({ url, code }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#141b33', light: '#f3efe6' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [url])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="invite">
      {qr && <img src={qr} alt={`QR para entrar a la sala ${code}`} className="qr" />}
      <div className="invite-text">
        <span className="hud-label-sm">CÓDIGO DE SALA</span>
        <span className="room-code">{code}</span>
        <button type="button" className="btn-ghost small" onClick={copy}>
          {copied ? 'Link copiado' : 'Copiar link'}
        </button>
      </div>
    </div>
  )
}

export function Lobby({
  role, lobby, code, status, selfId, name, setName, joinCode, setJoinCode,
  bikeId, onPickBike, onCreate, onJoin, onLeave, onStart, onMode, onAiFill, inviteUrl,
}) {
  const inRoom = role !== 'off' && lobby.players.length > 0
  if (!inRoom) {
    return (
      <div className="panel lobby">
        <h2 className="title-sm">Con amigos</h2>
        <p className="meta small">Un celular crea la sala y los demás entran con el código o escaneando el QR. Funciona en el mismo Wi-Fi o por internet.</p>
        <label className="field">
          <span>Tu nombre</span>
          <input
            id="player-name"
            value={name}
            maxLength={14}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />
        </label>
        <div className="row">
          <button type="button" className="btn-go" onClick={onCreate} disabled={!name.trim()}>
            Crear sala
          </button>
        </div>
        <div className="join-row">
          <label className="field">
            <span>Código de sala</span>
            <input
              id="join-code"
              value={joinCode}
              maxLength={4}
              inputMode="text"
              autoCapitalize="characters"
              placeholder="ABCD"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={onJoin} disabled={joinCode.length !== 4 || !name.trim()}>
            Unirme
          </button>
        </div>
        {status && <p className="net-status">{status}</p>}
        <button type="button" className="link-btn" onClick={onLeave}>Volver</button>
      </div>
    )
  }
  const isHost = role === 'host'
  return (
    <div className="panel lobby">
      <div className="lobby-head">
        <h2 className="title-sm">Sala {code}</h2>
        <span className="meta small">
          {lobby.players.length}/{MAX_PLAYERS} pilotos
        </span>
      </div>
      {isHost && <Invite url={inviteUrl} code={code} />}

      <ul className="roster">
        {lobby.players.map((p, i) => (
          <li key={p.id} style={{ '--c': COLORS[i % COLORS.length] }}>
            <span className="roster-name">
              {p.name}
              {p.id === selfId ? ' (vos)' : ''}
              {p.host ? ' · host' : ''}
            </span>
            <span className="roster-bike">{BIKES[p.bike]?.name || '—'}</span>
          </li>
        ))}
      </ul>

      <div className="lobby-opts">
        <div className="seg" role="radiogroup" aria-label="Modo">
          {[
            ['race', 'Carrera'],
            ['chase', 'Escape'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={lobby.mode === id}
              className={'seg-btn' + (lobby.mode === id ? ' on' : '')}
              onClick={() => isHost && onMode(id)}
              disabled={!isHost}
            >
              {label}
            </button>
          ))}
        </div>
        {lobby.mode === 'race' && (
          <label className="toggle">
            <input type="checkbox" id="ai-fill" checked={lobby.aiFill} disabled={!isHost} onChange={(e) => onAiFill(e.target.checked)} />
            <span>Completar la grilla con rivales IA</span>
          </label>
        )}
      </div>
      <p className="meta small">
        {lobby.mode === 'race'
          ? 'Carrera en Las Toscas: cada uno con su moto.'
          : 'Escape en equipo: si la policía pierde de vista a todos durante 15 s, escapan. Si te atrapan, quedás afuera.'}
      </p>

      <span className="hud-label-sm">TU MOTO</span>
      <BikePicker value={bikeId} onPick={onPickBike} compact />

      {status && <p className="net-status">{status}</p>}
      <div className="row">
        {isHost ? (
          <button type="button" className="btn-go" onClick={onStart}>
            Largar
          </button>
        ) : (
          <p className="waiting">Esperando que el host largue…</p>
        )}
        <button type="button" className="btn-ghost" onClick={onLeave}>
          Salir de la sala
        </button>
      </div>
    </div>
  )
}
