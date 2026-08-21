/* Generates the PWA icons — a map pin on the signage teal, drawn
   analytically with 3x supersampling. node tools/make-icons.js          */
const fs = require('fs'), zlib = require('zlib'), path = require('path');

const TEAL = [15, 123, 114], WHITE = [255, 255, 255], DEEP = [10, 90, 84];

/* signed helpers: >0 means inside */
const insideRoundRect = (x, y, s, r) => {
  const dx = Math.max(r - x, 0, x - (s - r));
  const dy = Math.max(r - y, 0, y - (s - r));
  return Math.hypot(dx, dy) <= r;
};
/* teardrop pin: circle of radius r at (cx,cy) plus tapering point down to ty */
function insidePin(x, y, cx, cy, r, ty){
  if (Math.hypot(x - cx, y - cy) <= r) return true;
  if (y < cy || y > ty) return false;
  const t = (y - cy) / (ty - cy);               // 0 at circle centre → 1 at tip
  const halfWidth = r * (1 - t) * Math.sqrt(Math.max(0, 1 - t * 0.25));
  return Math.abs(x - cx) <= halfWidth;
}

function iconPixels(size, maskable){
  const pad = maskable ? size * 0.14 : 0;       // safe zone for maskable icons
  const inner = size - pad * 2;
  const S = 3;                                   // supersample factor
  const out = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const pinR  = inner * 0.205;
  const pinCy = pad + inner * 0.375;
  const pinTy = pad + inner * 0.83;
  const holeR = inner * 0.083;

  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      let bg = 0, fg = 0, hole = 0;
      for (let sy = 0; sy < S; sy++){
        for (let sx = 0; sx < S; sx++){
          const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
          if (insideRoundRect(px, py, size, size * 0.22)) bg++;
          if (insidePin(px, py, cx, pinCy, pinR, pinTy)) fg++;
          if (Math.hypot(px - cx, py - pinCy) <= holeR) hole++;
        }
      }
      const n = S * S;
      const a = bg / n, pin = fg / n, hl = hole / n;
      /* teal ground, white pin, teal hole punched back through it */
      let r = TEAL[0], g = TEAL[1], b = TEAL[2];
      const pinAlpha = Math.max(0, pin - hl);
      r = r * (1 - pinAlpha) + WHITE[0] * pinAlpha;
      g = g * (1 - pinAlpha) + WHITE[1] * pinAlpha;
      b = b * (1 - pinAlpha) + WHITE[2] * pinAlpha;
      if (hl > 0){ r = r * (1 - hl) + DEEP[0] * hl; g = g * (1 - hl) + DEEP[1] * hl; b = b * (1 - hl) + DEEP[2] * hl; }
      const i = (y * size + x) * 4;
      out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = Math.round(a * 255);
    }
  }
  return out;
}

/* ---- minimal PNG writer (RGBA) ---- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++){ let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function writePNG(file, size, rgba){
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++){
    raw[o++] = 0;
    rgba.copy(raw, o, y * size * 4, (y + 1) * size * 4);
    o += size * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level:9})),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

const dir = path.join(__dirname, '..', 'app');
for (const [size, name, maskable] of [[192,'icon-192.png',false], [512,'icon-512.png',false],
                                      [512,'icon-maskable.png',true], [180,'apple-touch-icon.png',false]]){
  writePNG(path.join(dir, name), size, iconPixels(size, maskable));
  console.log('wrote app/' + name + '  ' + size + 'x' + size);
}
