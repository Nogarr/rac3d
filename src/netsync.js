// Puente entre el estado del juego y la red: envíos periódicos y mensajes entrantes.
import { net, broadcast, sendHost } from './net'
import { raceSnapshot, selfPacket, applyRaceSnapshot, applyRemotePlayer, markGone } from './race'
import { chaseSnapshot, selfChasePacket, applyChaseSnapshot, applyRemoteChasePlayer, markChaseGone } from './chase'

const HOST_HZ = 15
const CLIENT_HZ = 20
let acc = 0

export function netTick(st, dt) {
  if (!st.online || net.role === 'off' || !st.running) return
  acc += dt
  if (net.role === 'host') {
    if (acc < 1 / HOST_HZ) return
    acc = 0
    broadcast(st.mode === 'race' ? raceSnapshot(st) : chaseSnapshot(st))
  } else {
    if (acc < 1 / CLIENT_HZ) return
    acc = 0
    sendHost(st.mode === 'race' ? selfPacket(st) : selfChasePacket(st))
  }
}

export function netReceive(st, from, msg) {
  if (!st?.online) return
  if (msg.type === 'me' && net.role === 'host' && msg.p) {
    if (st.mode === 'race') applyRemotePlayer(st, from, msg.p)
    else applyRemoteChasePlayer(st, from, msg.p)
  } else if (msg.type === 'snap' && net.role === 'client') {
    if (st.mode === 'race' && msg.rs) applyRaceSnapshot(st, msg)
    if (st.mode === 'chase' && msg.ps) applyChaseSnapshot(st, msg)
  }
}

export function netGone(st, id) {
  if (!st?.online) return
  if (st.mode === 'race') markGone(st, id)
  else markChaseGone(st, id)
}
