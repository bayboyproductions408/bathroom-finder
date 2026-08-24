/* Decides whether a simulator screenshot shows a running app or a dead one.

     node tools/screenshot-check.js shot.png

   Exits non-zero if the screen is effectively blank. A Capacitor app that
   fails to load its web bundle does not crash — it sits there showing a
   white rectangle, which looks exactly like a healthy launch to anything
   that only checks whether the process is alive. This is what tells the
   difference, and it is the failure App Review writes up as "the app
   displays a blank screen" under Guideline 2.1.

   No dependencies: PNG is zlib plus five scanline filters, and Node has
   zlib. Pulling an image library into CI for this would be a worse trade.  */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

/* ---- minimal PNG reader (8-bit RGB/RGBA/grey, non-interlaced) ---------- */
function readPNG(file){
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR'){
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT'){
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;                       /* len + type + data + crc */
  }
  if (depth !== 8) throw new Error(`only 8-bit PNGs supported, got ${depth}`);

  const channels = {0:1, 2:3, 4:2, 6:4}[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  /* Undo the per-scanline filters. Each line names its own filter in a
     leading byte and refers to the line above, so this cannot be done out
     of order or in parallel. */
  for (let y = 0; y < height; y++){
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++){
      const a = i >= channels ? cur[i - channels] : 0;      /* left */
      const b = prev ? prev[i] : 0;                          /* above */
      const c = (prev && i >= channels) ? prev[i - channels] : 0;  /* upper left */
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4){
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`bad filter ${filter} on line ${y}`);
      cur[i] = v & 0xff;
    }
  }
  return {width, height, channels, data: out};
}

/* ---- what the screen actually shows ------------------------------------ */
function analyse(img){
  const {width, height, channels, data} = img;
  const counts = new Map();
  let total = 0;
  /* Quantise to 4 bits per channel: a photo of a map has thousands of near
     neighbours that are not meaningfully different, and counting exact RGB
     would call any gradient "varied". */
  for (let y = 0; y < height; y++){
    for (let x = 0; x < width; x++){
      const i = y * width * channels + x * channels;
      const r = data[i] >> 4, g = data[i + (channels > 2 ? 1 : 0)] >> 4,
            b = data[i + (channels > 2 ? 2 : 0)] >> 4;
      const key = (r << 8) | (g << 4) | b;
      counts.set(key, (counts.get(key) || 0) + 1);
      total++;
    }
  }
  let top = 0, topKey = 0;
  for (const [k, n] of counts) if (n > top){ top = n; topKey = k; }
  return {
    distinct: counts.size,
    dominantShare: top / total,
    dominant: `#${((topKey >> 8) & 15).toString(16)}${((topKey >> 4) & 15).toString(16)}${(topKey & 15).toString(16)}`
  };
}

/* A coarse picture in the log, so a human reading CI output can see roughly
   what the app drew without downloading an artifact. */
function preview(img, cols = 44){
  const {width, height, channels, data} = img;
  const rows = Math.max(1, Math.round(cols * (height / width) * 0.5));
  const ramp = ' .:-=+*#%@';
  const lines = [];
  for (let ry = 0; ry < rows; ry++){
    let line = '';
    for (let rx = 0; rx < cols; rx++){
      const x0 = Math.floor(rx * width / cols), x1 = Math.max(x0 + 1, Math.floor((rx + 1) * width / cols));
      const y0 = Math.floor(ry * height / rows), y1 = Math.max(y0 + 1, Math.floor((ry + 1) * height / rows));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += 2){
        for (let x = x0; x < x1; x += 2){
          const i = y * width * channels + x * channels;
          sum += channels > 2 ? (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) : data[i];
          n++;
        }
      }
      const lum = n ? sum / n : 255;
      line += ramp[Math.min(ramp.length - 1, Math.floor((255 - lum) / 256 * ramp.length))];
    }
    lines.push('  |' + line + '|');
  }
  return lines.join('\n');
}

const file = process.argv[2];
if (!file){ console.error('usage: screenshot-check.js <file.png>'); process.exit(2); }

const img = readPNG(file);
const a = analyse(img);
console.log(`${file}: ${img.width}x${img.height}, ${a.distinct} distinct colours, ` +
            `largest flat area ${(a.dominantShare * 100).toFixed(1)}% (${a.dominant})`);
console.log(preview(img));

/* Thresholds are deliberately loose. This is here to catch "nothing
   rendered at all", not to police the design — a real screen of a map with
   a sheet over it still lands far below 97% one colour. */
const BLANK_SHARE = 0.97, MIN_COLOURS = 12;
if (a.dominantShare > BLANK_SHARE || a.distinct < MIN_COLOURS){
  console.error(`\nBLANK: ${(a.dominantShare * 100).toFixed(1)}% of the screen is one colour ` +
                `across ${a.distinct} distinct colours.`);
  console.error('The app launched but drew nothing — usually the web bundle failed to load.');
  process.exit(1);
}
console.log('\nOK: the app drew a real screen.');
