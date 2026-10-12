import { Peer } from 'peerjs'

// Multijugador P2P con WebRTC. Un celular hostea la sala (id "rueda-libre-<CÓDIGO>")
// y los demás se conectan directo a él. El servidor de PeerJS solo se usa para el
// "apretón de manos" inicial; después los datos van de celular a celular.

const PREFIX = 'rueda-libre-v1-'
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ' // sin I, L, O para no confundir

function iceServers() {
  const env = import.meta.env || {}
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  // TURN opcional para datos móviles con NAT estricto (ver README)
  if (env.VITE_TURN_URL) {
    list.push({
      urls: env.VITE_TURN_URL.split(','),
      username: env.VITE_TURN_USER,
      credential: env.VITE_TURN_PASS,
    })
  }
  return list
}

function peerOptions() {
  const env = import.meta.env || {}
  const o = { config: { iceServers: iceServers() }, debug: 0 }
  if (env.VITE_PEER_HOST) {
    o.host = env.VITE_PEER_HOST
    o.port = Number(env.VITE_PEER_PORT || 443)
    o.path = env.VITE_PEER_PATH || '/'
    o.secure = env.VITE_PEER_SECURE !== 'false'
  }
  return o
}

export const COLORS = ['#ffb000', '#1fb5a6', '#e3392c', '#8d5bd8', '#2a55cf', '#ff8a1a']
export const NUMBERS = [77, 11, 27, 5, 31, 88]
export const MAX_PLAYERS = 6

const listeners = {}
export function onNet(type, fn) {
  ;(listeners[type] = listeners[type] || new Set()).add(fn)
  return () => listeners[type].delete(fn)
}
function emit(type, data) {
  listeners[type]?.forEach((fn) => fn(data))
}

export const net = {
  role: 'off', // off | host | client
  code: '',
  selfId: '',
  hostId: '',
  peer: null,
  conns: new Map(), // host: id -> conexión; cliente: 'host' -> conexión
  lobby: { players: [], mode: 'race', aiFill: true },
  status: '',
}

function randomCode() {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

function setStatus(s) {
  net.status = s
  emit('status', s)
}

function errorText(err) {
  const t = err?.type
  if (t === 'peer-unavailable') return 'No existe esa sala o el host se fue.'
  if (t === 'unavailable-id') return 'Ese código está en uso, probá de nuevo.'
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
    return 'No hay conexión con el servidor de salas. Revisá internet.'
  if (t === 'browser-incompatible') return 'Este navegador no soporta juego online.'
  return 'Error de conexión: ' + (err?.message || t || 'desconocido')
}

// ---------- host ----------
export function hostRoom(me, tries = 0) {
  leaveRoom()
  const code = randomCode()
  const peer = new Peer(PREFIX + code, peerOptions())
  net.peer = peer
  net.role = 'host'
  net.code = code
  setStatus('Creando sala…')
  peer.on('open', (id) => {
    net.selfId = id
    net.hostId = id
    net.lobby = { players: [{ id, name: me.name, bike: me.bike, host: true }], mode: me.mode || 'race', aiFill: true }
    setStatus('')
    emit('lobby', net.lobby)
  })
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (net.lobby.players.length >= MAX_PLAYERS || net.lobby.locked) {
        conn.send({ type: 'reject', reason: net.lobby.locked ? 'La carrera ya empezó.' : 'La sala está llena.' })
        setTimeout(() => conn.close(), 300)
        return
      }
      net.conns.set(conn.peer, conn)
    })
    conn.on('data', (msg) => hostReceive(conn.peer, msg))
    conn.on('close', () => dropPlayer(conn.peer))
    conn.on('error', () => dropPlayer(conn.peer))
  })
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && tries < 3) return hostRoom(me, tries + 1)
    setStatus(errorText(err))
    emit('error', errorText(err))
  })
  peer.on('disconnected', () => {
    // perder el servidor de salas no corta a los que ya están conectados
    if (!peer.destroyed) peer.reconnect()
  })
}

function hostReceive(id, msg) {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'hello') {
    if (!net.lobby.players.some((p) => p.id === id)) {
      net.lobby.players.push({ id, name: String(msg.name || 'Piloto').slice(0, 14), bike: msg.bike })
    }
    broadcastLobby()
    return
  }
  if (msg.type === 'pick') {
    const p = net.lobby.players.find((q) => q.id === id)
    if (p) p.bike = msg.bike
    broadcastLobby()
    return
  }
  emit('msg', { from: id, msg })
}

function dropPlayer(id) {
  if (!net.conns.has(id)) return
  net.conns.delete(id)
  const was = net.lobby.players.find((p) => p.id === id)
  net.lobby.players = net.lobby.players.filter((p) => p.id !== id)
  broadcastLobby()
  if (was) emit('left', was)
}

export function broadcastLobby() {
  if (net.role !== 'host') return
  broadcast({ type: 'lobby', lobby: net.lobby })
  emit('lobby', net.lobby)
}

export function setLobby(patch) {
  Object.assign(net.lobby, patch)
  broadcastLobby()
}

export function broadcast(msg) {
  for (const c of net.conns.values()) {
    if (c.open) {
      try {
        c.send(msg)
      } catch {
        /* conexión cerrándose */
      }
    }
  }
}

// ---------- cliente ----------
export function joinRoom(code, me) {
  leaveRoom()
  code = String(code || '').trim().toUpperCase()
  const peer = new Peer(peerOptions())
  net.peer = peer
  net.role = 'client'
  net.code = code
  setStatus('Conectando…')
  peer.on('open', (id) => {
    net.selfId = id
    net.hostId = PREFIX + code
    const conn = peer.connect(net.hostId, { reliable: true, serialization: 'json' })
    net.conns.set('host', conn)
    const timer = setTimeout(() => {
      if (!conn.open) {
        setStatus('El host no responde. ¿Están en la misma red o tienen internet?')
        emit('error', net.status)
      }
    }, 12000)
    conn.on('open', () => {
      clearTimeout(timer)
      setStatus('')
      conn.send({ type: 'hello', name: me.name, bike: me.bike })
    })
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'lobby') {
        net.lobby = msg.lobby
        emit('lobby', net.lobby)
      } else if (msg.type === 'reject') {
        setStatus(msg.reason)
        emit('error', msg.reason)
      } else emit('msg', { from: 'host', msg })
    })
    conn.on('close', () => {
      if (net.role === 'client') {
        emit('hostgone', null)
        setStatus('Se cortó la conexión con el host.')
      }
    })
  })
  peer.on('error', (err) => {
    setStatus(errorText(err))
    emit('error', errorText(err))
  })
}

export function sendHost(msg) {
  const c = net.conns.get('host')
  if (c?.open) {
    try {
      c.send(msg)
    } catch {
      /* conexión cerrándose */
    }
  }
}

export function pickBike(bike) {
  if (net.role === 'client') sendHost({ type: 'pick', bike })
  if (net.role === 'host') {
    const p = net.lobby.players.find((q) => q.id === net.selfId)
    if (p) p.bike = bike
    broadcastLobby()
  }
}

export function leaveRoom() {
  const wasClient = net.role === 'client'
  net.role = 'off'
  for (const c of net.conns.values()) {
    try {
      c.close()
    } catch {
      /* ya cerrada */
    }
  }
  net.conns.clear()
  if (net.peer && !net.peer.destroyed) net.peer.destroy()
  net.peer = null
  net.code = ''
  net.lobby = { players: [], mode: 'race', aiFill: true }
  if (wasClient) setStatus('')
}

export function inviteUrl(code) {
  const u = new URL(window.location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('sala', code)
  return u.toString()
}
