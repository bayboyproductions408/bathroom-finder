/* Store artwork, drawn rather than placeholder-ed.
     node tools/make-store-assets.js
   Produces everything Google Play and the App Store ask for, into store/.   */
const fs = require('fs'), zlib = require('zlib'), path = require('path');

const TEAL = [15,123,114], DEEP = [10,90,84], WHITE = [255,255,255], PORCELAIN = [232,238,239];

/* ---- PNG writer (RGBA) ---- */
const CRC = (() => { const t=[]; for(let n=0;n<256;n++){ let c=n;
  for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
const crc = b => { let c=0xFFFFFFFF; for(const x of b) c = CRC[(c^x)&0xFF] ^ (c>>>8); return (c^0xFFFFFFFF)>>>0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type,'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function writePNG(file, w, h, rgba){
  const raw = Buffer.alloc((w*4+1)*h);
  let o = 0;
  for (let y=0;y<h;y++){ raw[o++]=0; rgba.copy(raw, o, y*w*4, (y+1)*w*4); o += w*4; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw,{level:9})), chunk('IEND', Buffer.alloc(0))]));
}

/* ---- shapes ---- */
const inRound = (x,y,w,h,r) => {
  const dx = Math.max(r-x, 0, x-(w-r)), dy = Math.max(r-y, 0, y-(h-r));
  return Math.hypot(dx,dy) <= r;
};
function inPin(x,y,cx,cy,r,ty){
  if (Math.hypot(x-cx, y-cy) <= r) return true;
  if (y < cy || y > ty) return false;
  const t = (y-cy)/(ty-cy);
  return Math.abs(x-cx) <= r*(1-t)*Math.sqrt(Math.max(0,1-t*0.25));
}

/* square icon: pin on teal. `bleed` fills the whole canvas (Play wants no
   transparency); `inset` is the safe-zone padding for adaptive/maskable. */
function icon(size, {bleed = false, inset = 0, radius = 0.22} = {}){
  const S = 3, out = Buffer.alloc(size*size*4);
  const pad = size*inset, inner = size - pad*2;
  const cx = size/2, r = inner*0.205, cy = pad + inner*0.375, ty = pad + inner*0.83, hole = inner*0.083;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++){
    let bg=0, fg=0, hl=0;
    for (let sy=0;sy<S;sy++) for (let sx=0;sx<S;sx++){
      const px=x+(sx+.5)/S, py=y+(sy+.5)/S;
      if (bleed || inRound(px,py,size,size,size*radius)) bg++;
      if (inPin(px,py,cx,cy,r,ty)) fg++;
      if (Math.hypot(px-cx,py-cy) <= hole) hl++;
    }
    const n=S*S, a=bg/n, pin=Math.max(0, fg/n - hl/n), h2=hl/n;
    let R=TEAL[0], G=TEAL[1], B=TEAL[2];
    R=R*(1-pin)+WHITE[0]*pin; G=G*(1-pin)+WHITE[1]*pin; B=B*(1-pin)+WHITE[2]*pin;
    if (h2>0){ R=R*(1-h2)+DEEP[0]*h2; G=G*(1-h2)+DEEP[1]*h2; B=B*(1-h2)+DEEP[2]*h2; }
    const i=(y*size+x)*4;
    out[i]=R; out[i+1]=G; out[i+2]=B; out[i+3]=Math.round(a*255);
  }
  return out;
}

/* Play feature graphic, 1024x500: pin on the left, tile grid behind it */
function feature(w, h){
  const S = 2, out = Buffer.alloc(w*h*4);
  const cx = w*0.17, r = h*0.20, cy = h*0.40, ty = h*0.80, hole = h*0.082;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    let fg=0, hl=0;
    for (let sy=0;sy<S;sy++) for (let sx=0;sx<S;sx++){
      const px=x+(sx+.5)/S, py=y+(sy+.5)/S;
      if (inPin(px,py,cx,cy,r,ty)) fg++;
      if (Math.hypot(px-cx,py-cy) <= hole) hl++;
    }
    const n=S*S, pin=Math.max(0, fg/n - hl/n), h2=hl/n;
    /* grout grid on the teal ground */
    const grid = (x % 64 === 0 || y % 64 === 0) ? 0.055 : 0;
    let R=TEAL[0]*(1-grid)+PORCELAIN[0]*grid,
        G=TEAL[1]*(1-grid)+PORCELAIN[1]*grid,
        B=TEAL[2]*(1-grid)+PORCELAIN[2]*grid;
    R=R*(1-pin)+WHITE[0]*pin; G=G*(1-pin)+WHITE[1]*pin; B=B*(1-pin)+WHITE[2]*pin;
    if (h2>0){ R=R*(1-h2)+DEEP[0]*h2; G=G*(1-h2)+DEEP[1]*h2; B=B*(1-h2)+DEEP[2]*h2; }
    const i=(y*w+x)*4;
    out[i]=R; out[i+1]=G; out[i+2]=B; out[i+3]=255;
  }
  return out;
}

const OUT = path.join(__dirname, '..', 'store');
fs.mkdirSync(OUT, {recursive:true});

const jobs = [
  /* Google Play */
  ['play-icon-512.png',            512, 512, icon(512, {bleed:true, radius:0})],
  ['play-adaptive-foreground.png', 432, 432, icon(432, {inset:0.19, radius:0})],
  ['play-feature-graphic.png',    1024, 500, feature(1024, 500)],
  /* App Store */
  ['appstore-icon-1024.png',      1024, 1024, icon(1024, {bleed:true, radius:0})],
  /* in-app / web, regenerated so everything matches */
  ['icon-192.png',                 192, 192, icon(192)],
  ['icon-512.png',                 512, 512, icon(512)],
  ['icon-maskable-512.png',        512, 512, icon(512, {inset:0.14})],
  ['apple-touch-icon-180.png',     180, 180, icon(180)]
];
for (const [name, w, h, px] of jobs){
  writePNG(path.join(OUT, name), w, h, px);
  console.log(`store/${name}  ${w}x${h}`);
}
console.log('\nNote: Play requires a 512x512 icon with no transparency and no rounded');
console.log('corners of its own — play-icon-512.png is drawn that way. The App Store');
console.log('icon is 1024x1024, also fully opaque. Xcode derives the rest from it.');
