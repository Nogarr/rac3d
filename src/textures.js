import * as THREE from 'three'

const FONT = '"Saira Condensed", "Arial Narrow", Impact, sans-serif'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function toTexture(c, repeatS = false, repeatT = false) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeatS) t.wrapS = THREE.RepeatWrapping
  if (repeatT) t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function noise(ctx, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0]
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size)
  }
}

export function asphaltTexture() {
  const [c, ctx] = canvas(256, 512)
  ctx.fillStyle = '#3b3e45'
  ctx.fillRect(0, 0, 256, 512)
  noise(ctx, 256, 512, 9000, ['#33363c', '#45484f', '#2e3035', '#4c4f56'])
  // goma en la trazada
  const g = ctx.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0.3, 'rgba(20,20,22,0)')
  g.addColorStop(0.5, 'rgba(20,20,22,0.25)')
  g.addColorStop(0.7, 'rgba(20,20,22,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 512)
  ctx.fillStyle = '#efeadf'
  ctx.fillRect(6, 0, 7, 512)
  ctx.fillRect(243, 0, 7, 512)
  ctx.fillRect(125, 0, 6, 256)
  return toTexture(c, false, true)
}

export function curbTexture() {
  const [c, ctx] = canvas(32, 128)
  ctx.fillStyle = '#d8382c'
  ctx.fillRect(0, 0, 32, 64)
  ctx.fillStyle = '#f1ede4'
  ctx.fillRect(0, 64, 32, 64)
  return toTexture(c, false, true)
}

export function gravelTexture() {
  const [c, ctx] = canvas(128, 128)
  ctx.fillStyle = '#b39a74'
  ctx.fillRect(0, 0, 128, 128)
  noise(ctx, 128, 128, 2500, ['#a68c66', '#c4ad88', '#8f7858', '#d1bc98'], 2)
  return toTexture(c, true, true)
}

export function wallTexture() {
  const [c, ctx] = canvas(1024, 64)
  const panels = [
    ['#1d2a52', '#f1ede4', 'LAS TOSCAS'],
    ['#f1ede4', '#d8382c', 'RUEDA LIBRE'],
    ['#ffb000', '#1d2a52', 'AUTÓDROMO'],
    ['#f1ede4', '#1d2a52', 'CURVA DEL ÁLAMO'],
  ]
  panels.forEach(([bg, fg, text], i) => {
    ctx.fillStyle = bg
    ctx.fillRect(i * 256, 0, 256, 64)
    ctx.fillStyle = fg
    ctx.font = `800 36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, i * 256 + 128, 34)
  })
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 58, 1024, 6)
  return toTexture(c, true, false)
}

export function checkerTexture(cols = 16, rows = 3) {
  const [c, ctx] = canvas(cols * 16, rows * 16)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'
      ctx.fillRect(x * 16, y * 16, 16, 16)
    }
  const t = toTexture(c)
  t.magFilter = THREE.NearestFilter
  return t
}

export function bannerTexture() {
  const [c, ctx] = canvas(1024, 128)
  ctx.fillStyle = '#1d2a52'
  ctx.fillRect(0, 0, 1024, 128)
  for (let x = 0; x < 64; x++)
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'
      ctx.fillRect(x * 16, y * 8 + 112, 16, 8)
      ctx.fillRect(x * 16, y * 8, 16, 8)
    }
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `800 64px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('LARGADA · LAS TOSCAS', 512, 66)
  return toTexture(c)
}

export function plateTexture(num, color) {
  const [c, ctx] = canvas(128, 128)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#f4f1ea'
  ctx.beginPath()
  ctx.ellipse(64, 64, 56, 50, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#121418'
  ctx.font = `800 76px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(num), 64, 70)
  return toTexture(c)
}
