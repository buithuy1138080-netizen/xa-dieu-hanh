// Run: node generate-icons.mjs
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { deflateSync } from 'zlib'

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const outDir = join('public', 'icons')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let n = i
    for (let j = 0; j < 8; j++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1)
    table[i] = n >>> 0
  }
  let c = 0xffffffff
  for (const b of buf) c = (table[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const cval = crc32(Buffer.concat([t, data]))
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(cval)
  return Buffer.concat([len, t, data, crcBuf])
}

function createPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB

  // Build raw scanlines (filter byte 0 + RGB pixels)
  const raw = Buffer.alloc((1 + size * 3) * size, 0)
  for (let y = 0; y < size; y++) {
    const rowBase = y * (1 + size * 3)
    raw[rowBase] = 0 // filter none
    for (let x = 0; x < size; x++) {
      const px = rowBase + 1 + x * 3
      // Rounded square check (superellipse r=4)
      const nx = (x / size - 0.5) * 2, ny = (y / size - 0.5) * 2
      const inside = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4) < 0.7
      if (inside) {
        const t = (x + y) / (size * 2)
        raw[px]     = Math.round(0x1e + (0x4f - 0x1e) * t)
        raw[px + 1] = Math.round(0x40 + (0x46 - 0x40) * t)
        raw[px + 2] = Math.round(0xaf + (0xe5 - 0xaf) * t)
      } else {
        raw[px] = 0xf0; raw[px + 1] = 0xf2; raw[px + 2] = 0xf5
      }
    }
  }

  const compressed = deflateSync(raw)
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))])
}

for (const size of sizes) {
  const png = createPNG(size)
  writeFileSync(join(outDir, `icon-${size}.png`), png)
  console.log(`icon-${size}.png (${png.length}B)`)
}
console.log('Done.')
