// Estado de mandos del jugador. Los controles táctiles y el teclado escriben acá.
export const input = {
  throttle: false,
  front: false, // freno delantero
  rear: false, // freno trasero
  steer: 0, // manubrio analógico -1..1 (derecha positivo)
  steerTouch: null, // valor del pad táctil mientras se toca
  keyLeft: false,
  keyRight: false,
  bodyKey: 0, // inclinación corporal por teclado -1..1
  bodyLeft: false,
  bodyRight: false,
  shifts: [], // +1 subir, -1 bajar
}

const KEYMAP = {
  ArrowUp: 'throttle', KeyW: 'throttle',
  ArrowDown: 'front', KeyS: 'front',
  Space: 'rear',
  ArrowLeft: 'keyLeft', ArrowRight: 'keyRight',
  KeyA: 'bodyLeft', KeyD: 'bodyRight',
}

export function resetInput() {
  input.throttle = input.front = input.rear = false
  input.keyLeft = input.keyRight = input.bodyLeft = input.bodyRight = false
  input.steer = 0
  input.steerTouch = null
  input.bodyKey = 0
  input.shifts.length = 0
}

// Suaviza teclas digitales hacia valores analógicos
export function updateAnalog(dt) {
  if (input.steerTouch !== null) {
    input.steer = input.steerTouch
  } else {
    const t = (input.keyRight ? 1 : 0) - (input.keyLeft ? 1 : 0)
    const rate = t === 0 ? 7 : 4.5
    input.steer += Math.max(-rate * dt, Math.min(rate * dt, t - input.steer))
  }
  const b = (input.bodyRight ? 1 : 0) - (input.bodyLeft ? 1 : 0)
  input.bodyKey += Math.max(-4 * dt, Math.min(4 * dt, b - input.bodyKey))
}

export function bindKeyboard(onCommand) {
  const down = (e) => {
    const k = KEYMAP[e.code]
    if (k) {
      input[k] = true
      e.preventDefault()
      return
    }
    if (e.repeat) return
    if (e.code === 'KeyX' || e.code === 'KeyE') input.shifts.push(1)
    if (e.code === 'KeyZ' || e.code === 'KeyQ') input.shifts.push(-1)
    if (e.code === 'KeyP' || e.code === 'Escape') onCommand('pause')
    if (e.code === 'KeyR') onCommand('restart')
    if (e.code === 'KeyM') onCommand('mute')
    if (e.code === 'KeyC') onCommand('calibrate')
    if (e.code === 'Enter') onCommand('enter')
  }
  const up = (e) => {
    const k = KEYMAP[e.code]
    if (k) input[k] = false
  }
  const blur = () => {
    resetInput()
    onCommand('blur')
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
