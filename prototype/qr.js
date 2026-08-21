/* Minimal QR encoder (byte mode, EC level L, versions 1-5 = single EC block)
   plus a verifier: RS syndrome check, structural checks, and a full decode
   round-trip. Emits PNG (via zlib) and SVG. No third-party code. */
const fs = require('fs'), zlib = require('zlib');

/* ---------- GF(256) ---------- */
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
         for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function genPoly(n) {                       // product (x - a^i), i=0..n-1
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
    g = ng;
  }
  return g;
}
function rsEncode(data, ecLen) {
  const g = genPoly(ecLen), res = new Array(ecLen).fill(0);
  for (const d of data) {
    const f = d ^ res[0];
    res.shift(); res.push(0);
    if (f !== 0) for (let j = 0; j < ecLen; j++) res[j] ^= mul(g[j + 1], f);
  }
  return res;
}
/* independent check: a valid RS codeword has zero syndromes at a^0..a^(n-1) */
function syndromesZero(codeword, ecLen) {
  for (let i = 0; i < ecLen; i++) {
    let s = 0;
    for (const c of codeword) s = mul(s, EXP[i]) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

/* ---------- version tables (single-block L only) ---------- */
const EC_L = { 1:{data:19, ec:7}, 2:{data:34, ec:10}, 3:{data:55, ec:15}, 4:{data:80, ec:20}, 5:{data:108, ec:26} };

function reservedMatrix(size, version) {
  const R = Array.from({length:size}, () => new Array(size).fill(false));
  const block = (r, c, h, w) => { for (let i=0;i<h;i++) for (let j=0;j<w;j++) if (r+i<size && c+j<size && r+i>=0 && c+j>=0) R[r+i][c+j] = true; };
  block(0,0,9,9); block(0,size-8,9,8); block(size-8,0,8,9);   // finders + separators + format
  for (let i=0;i<size;i++){ R[6][i]=true; R[i][6]=true; }      // timing
  if (version >= 2) block(size-9, size-9, 5, 5);               // single alignment pattern
  return R;
}
function buildFunctionPatterns(m, size, version) {
  const finder = (r, c) => {
    for (let i=-1;i<=7;i++) for (let j=-1;j<=7;j++){
      const rr=r+i, cc=c+j; if (rr<0||cc<0||rr>=size||cc>=size) continue;
      const on = (i>=0&&i<=6&&(j===0||j===6)) || (j>=0&&j<=6&&(i===0||i===6)) || (i>=2&&i<=4&&j>=2&&j<=4);
      m[rr][cc] = on ? 1 : 0;
    }
  };
  finder(0,0); finder(0,size-7); finder(size-7,0);
  for (let i=8;i<size-8;i++){ const v = i%2===0?1:0; m[6][i]=v; m[i][6]=v; }
  if (version >= 2) {
    const cr = size-7, cc = size-7;
    for (let i=-2;i<=2;i++) for (let j=-2;j<=2;j++)
      m[cr+i][cc+j] = (Math.max(Math.abs(i),Math.abs(j)) !== 1) ? 1 : 0;
  }
  m[size-8][8] = 1;                                            // dark module
}

/* ---------- bit stream ---------- */
function makeBits(text, version) {
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  const cap = EC_L[version].data;
  const bits = [];
  const push = (val, len) => { for (let i=len-1;i>=0;i--) bits.push((val>>i)&1); };
  push(0b0100, 4); push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const total = cap * 8;
  if (bits.length > total) throw new Error('too long for version ' + version);
  for (let i=0;i<4 && bits.length<total;i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const pads = [0xEC, 0x11];
  for (let i=0; bits.length<total; i++) push(pads[i%2], 8);
  const data = [];
  for (let i=0;i<bits.length;i+=8) data.push(parseInt(bits.slice(i,i+8).join(''),2));
  return data;
}

/* ---------- placement ---------- */
function placementOrder(size, reserved) {
  const order = [];
  let up = true;
  for (let right = size-1; right > 0; right -= 2) {
    if (right === 6) right = 5;                                // skip vertical timing column
    for (let k = 0; k < size; k++) {
      const row = up ? size-1-k : k;
      for (const col of [right, right-1]) if (!reserved[row][col]) order.push([row, col]);
    }
    up = !up;
  }
  return order;
}
const MASKS = [
  (i,j)=>(i+j)%2===0, (i,j)=>i%2===0, (i,j)=>j%3===0, (i,j)=>(i+j)%3===0,
  (i,j)=>((i>>1)+Math.floor(j/3))%2===0, (i,j)=>((i*j)%2)+((i*j)%3)===0,
  (i,j)=>((((i*j)%2)+((i*j)%3))%2)===0, (i,j)=>((((i+j)%2)+((i*j)%3))%2)===0
];
function formatBits(maskId) {                                  // EC level L = 01
  let v = (0b01 << 3) | maskId;
  let d = v << 10;
  for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
  return ((v << 10) | d) ^ 0x5412;
}
function placeFormat(m, size, maskId) {
  const f = formatBits(maskId);
  const bit = i => (f >> i) & 1;
  for (let i=0;i<6;i++)  { m[8][i] = bit(i); m[size-1-i][8] = bit(i); }
  m[8][7] = bit(6); m[size-7][8] = bit(6);
  m[8][8] = bit(7); m[8][size-8] = bit(7);
  m[7][8] = bit(8); m[8][size-7] = bit(8);
  for (let i=9;i<15;i++){ m[14-i][8] = bit(i); m[8][size-15+i] = bit(i); }
}
function penalty(m, size) {
  let p = 0;
  const run = line => { let s=0, c=1; for (let i=1;i<line.length;i++){ if(line[i]===line[i-1]) c++; else { if(c>=5) s+=c-2; c=1; } } if(c>=5) s+=c-2; return s; };
  for (let i=0;i<size;i++){ p += run(m[i]); p += run(m.map(r=>r[i])); }
  for (let i=0;i<size-1;i++) for (let j=0;j<size-1;j++)
    if (m[i][j]===m[i][j+1] && m[i][j]===m[i+1][j] && m[i][j]===m[i+1][j+1]) p += 3;
  const pat = [1,0,1,1,1,0,1,0,0,0,0];
  const hit = (line, s) => pat.every((v,k)=>line[s+k]===v);
  for (let i=0;i<size;i++) for (let j=0;j<=size-11;j++){
    const row = m[i], col = m.map(r=>r[i]);
    if (hit(row,j)) p += 40;
    if (hit(col,j)) p += 40;
  }
  let dark = 0; for (const r of m) for (const v of r) dark += v;
  p += Math.floor(Math.abs(dark*100/(size*size) - 50)/5)*10;
  return p;
}

function encode(text) {
  let version = null;
  for (const v of [1,2,3,4,5]) {
    const need = 4 + 8 + Buffer.byteLength(text,'utf8')*8;
    if (need <= EC_L[v].data*8) { version = v; break; }
  }
  if (!version) throw new Error('text too long for versions 1-5');
  const size = 17 + 4*version;
  const {data:dataLen, ec:ecLen} = EC_L[version];

  /* codeword total must match the spec sequence — derived, not trusted */
  const reserved = reservedMatrix(size, version);
  let free = 0; for (let i=0;i<size;i++) for (let j=0;j<size;j++) if (!reserved[i][j]) free++;
  const derivedTotal = Math.floor(free/8);
  if (derivedTotal !== dataLen + ecLen)
    throw new Error(`codeword mismatch v${version}: matrix gives ${derivedTotal}, table says ${dataLen+ecLen}`);

  const dataCw = makeBits(text, version);
  const ecCw = rsEncode(dataCw, ecLen);
  const all = dataCw.concat(ecCw);
  if (!syndromesZero(all, ecLen)) throw new Error('RS syndrome check failed');

  const bits = [];
  for (const cw of all) for (let i=7;i>=0;i--) bits.push((cw>>i)&1);
  const order = placementOrder(size, reserved);
  if (order.length < bits.length) throw new Error('placement order too short');

  let best = null;
  for (let maskId=0; maskId<8; maskId++) {
    const m = Array.from({length:size}, ()=>new Array(size).fill(0));
    buildFunctionPatterns(m, size, version);
    order.forEach(([r,c], i) => { const b = i < bits.length ? bits[i] : 0; m[r][c] = MASKS[maskId](r,c) ? b^1 : b; });
    placeFormat(m, size, maskId);
    const p = penalty(m, size);
    if (!best || p < best.p) best = {p, m, maskId};
  }
  return {matrix: best.m, size, version, maskId: best.maskId, order, reserved, ecLen, dataLen};
}

/* ---------- verification: read the symbol back ---------- */
function decode(sym) {
  const {matrix:m, size, order, maskId} = sym;
  /* format info, read from copy 1, must decode to level L and the same mask */
  let f = 0;
  const rd = [];
  for (let i=0;i<6;i++) rd[i] = m[8][i];
  rd[6] = m[8][7]; rd[7] = m[8][8]; rd[8] = m[7][8];
  for (let i=9;i<15;i++) rd[i] = m[14-i][8];
  for (let i=0;i<15;i++) f |= rd[i] << i;
  f ^= 0x5412;
  const ecBits = (f >> 13) & 0b11, readMask = (f >> 10) & 0b111;
  if (ecBits !== 0b01) throw new Error('format info: EC level did not read back as L');
  if (readMask !== maskId) throw new Error('format info: mask did not read back');

  /* structural: finder rings and timing */
  const ringOK = (r,c) => m[r][c]===1 && m[r+1][c+1]===0 && m[r+2][c+2]===1 && m[r+3][c+3]===1;
  if (!ringOK(0,0) || !ringOK(0,size-7) || !ringOK(size-7,0)) throw new Error('finder pattern malformed');
  for (let i=8;i<size-8;i++) if (m[6][i] !== (i%2===0?1:0)) throw new Error('timing pattern broken');

  /* data: unmask and read in the same zigzag order */
  const bits = order.map(([r,c]) => (MASKS[maskId](r,c) ? m[r][c]^1 : m[r][c]));
  const cw = [];
  for (let i=0;i+8<=bits.length;i+=8) cw.push(parseInt(bits.slice(i,i+8).join(''),2));
  const all = cw.slice(0, sym.dataLen + sym.ecLen);
  if (!syndromesZero(all, sym.ecLen)) throw new Error('decoded codewords fail RS check');
  const mode = (all[0] >> 4) & 0xF;
  if (mode !== 0b0100) throw new Error('mode is not byte mode');
  const len = ((all[0] & 0xF) << 4) | ((all[1] >> 4) & 0xF);
  const out = [];
  for (let i=0;i<len;i++) out.push((((all[1+i] & 0xF) << 4) | ((all[2+i] >> 4) & 0xF)) & 0xFF);
  return Buffer.from(out).toString('utf8');
}

/* ---------- PNG ---------- */
function png(matrix, size, scale, quiet, file) {
  const dim = (size + quiet*2) * scale;
  const raw = Buffer.alloc((dim*3 + 1) * dim);
  let o = 0;
  for (let y=0;y<dim;y++) {
    raw[o++] = 0;
    for (let x=0;x<dim;x++) {
      const mx = Math.floor(x/scale) - quiet, my = Math.floor(y/scale) - quiet;
      const dark = mx>=0 && my>=0 && mx<size && my<size && matrix[my][mx] === 1;
      const [r,g,b] = dark ? [15,30,29] : [255,255,255];
      raw[o++]=r; raw[o++]=g; raw[o++]=b;
    }
  }
  const crcTable = (()=>{ const t=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
  const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim,0); ihdr.writeUInt32BE(dim,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level:9})), chunk('IEND', Buffer.alloc(0))
  ]));
  return dim;
}
function svg(matrix, size, quiet, file) {
  const dim = size + quiet*2;
  let path = '';
  for (let y=0;y<size;y++) for (let x=0;x<size;x++)
    if (matrix[y][x]) path += `M${x+quiet} ${y+quiet}h1v1h-1z`;
  fs.writeFileSync(file,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim*12}" height="${dim*12}" shape-rendering="crispEdges">
<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#0F1E1D"/></svg>`);
}

/* ---------- run ---------- */
const text = process.argv[2];
const out  = process.argv[3] || 'qr';
const sym = encode(text);
const back = decode(sym);
if (back !== text) throw new Error(`round-trip failed:\n  in:  ${text}\n  out: ${back}`);
const dim = png(sym.matrix, sym.size, 12, 4, out + '.png');
svg(sym.matrix, sym.size, 4, out + '.svg');
console.log(JSON.stringify({
  encoded: text, version: sym.version, modules: `${sym.size}x${sym.size}`,
  ec: 'L', mask: sym.maskId, png: `${out}.png (${dim}x${dim}px)`, svg: `${out}.svg`,
  checks: 'codeword count derived from matrix ✓, RS syndromes zero ✓, format info reads back ✓, finders+timing ✓, decoded text matches ✓'
}, null, 1));
