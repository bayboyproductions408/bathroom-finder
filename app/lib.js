/* =====================================================================
   Pure helpers — no DOM, no network. Loaded by the browser as a plain
   script and by the node test runner via require(), so the logic that
   decides "is it open" and "can I trust this pin" is tested headlessly.
   ===================================================================== */
'use strict';

/* ---------- distance ---------- */
function haversine(a, b){
  const R = 6371000, t = Math.PI/180;
  const dLat = (b.lat-a.lat)*t, dLon = (b.lng-a.lng)*t;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
const fmtDist = (m, metric = true) => metric
  ? (m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(m < 10000 ? 1 : 0)} km`)
  : (m < 1609 ? `${Math.round(m*3.28084)} ft` : `${(m/1609.34).toFixed(m < 16093 ? 1 : 0)} mi`);
const walkMin = m => Math.max(1, Math.round(m/80));      // ~4.8 km/h

/* ---------- opening_hours ----------------------------------------------
   OSM's opening_hours grammar is enormous. This covers the shapes that
   actually appear on toilets and small venues:
     24/7 · Mo-Fr 08:00-18:00 · Mo-Su 10:00-20:00; Sa off
     Mo-Fr 08:00-12:00,13:00-17:00 · Tu,Th 09:00-17:00 · 22:00-02:00
   Anything it does not understand returns 'unknown' rather than guessing,
   because telling someone a locked bathroom is open is worse than saying
   nothing.                                                              */
const DAYS = ['su','mo','tu','we','th','fr','sa'];
const DAY_IDX = {su:0, mo:1, tu:2, we:3, th:4, fr:5, sa:6};

function parseHours(spec, now = new Date()){
  if (!spec || typeof spec !== 'string') return {state:'unknown', reason:'no hours recorded'};
  const s = spec.trim().toLowerCase();
  if (!s) return {state:'unknown', reason:'no hours recorded'};
  if (s === '24/7' || s === '24 hours' || s === 'mo-su 00:00-24:00')
    return {state:'open', always:true, reason:'open 24 hours'};
  if (/sunrise|sunset|dusk|dawn|by appointment|school|ph\s+open/.test(s))
    return {state:'unknown', reason:'hours are conditional'};

  const day = now.getDay(), yesterday = (day + 6) % 7;
  const mins = now.getHours()*60 + now.getMinutes();

  /* Parse every rule first. In opening_hours a later rule overrides an
     earlier one for the days it names — "Mo-Su 09:00-17:00; We off" is
     closed on Wednesday — so the last rule matching a day wins.        */
  const rules = [];
  for (let rule of s.split(';')){
    rule = rule.trim();
    if (!rule) continue;
    rule = rule.replace(/\bph\b\s*(off|closed)?/g, '').trim();     // ignore public holidays
    if (!rule) continue;
    const m = rule.match(/^([a-z,\-\s]*?)\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+|off|closed|24\/7)$/);
    if (!m) return {state:'unknown', reason:'hours are in a format we cannot read'};
    const days = parseDays(m[1].trim());
    if (days === null) return {state:'unknown', reason:'hours are in a format we cannot read'};
    rules.push({days, time:m[2].trim()});
  }
  if (!rules.length) return {state:'unknown', reason:'no hours recorded'};

  const lastFor = d => { let hit = null; for (const r of rules) if (r.days.has(d)) hit = r; return hit; };
  const today = lastFor(day), prior = lastFor(yesterday);

  const spans = rule => {
    const out = [];
    for (const span of rule.time.split(',')){
      const t = span.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!t) return null;
      const from = (+t[1])*60 + (+t[2]);
      let to = (+t[3])*60 + (+t[4]);
      const overnight = to <= from;
      if (overnight) to += 1440;
      out.push({from, to, overnight});
    }
    return out;
  };

  /* a window that started yesterday and runs past midnight */
  if (prior && prior.time !== 'off' && prior.time !== 'closed' && prior.time !== '24/7'){
    const sp = spans(prior);
    if (sp === null) return {state:'unknown', reason:'hours are in a format we cannot read'};
    for (const s2 of sp)
      if (s2.overnight && mins + 1440 < s2.to)
        return {state:'open', until: fmtClock(s2.to % 1440), reason:`open until ${fmtClock(s2.to % 1440)}`};
  }

  if (!today) return {state:'closed', reason:'closed today'};
  if (today.time === 'off' || today.time === 'closed') return {state:'closed', reason:'closed today'};
  if (today.time === '24/7') return {state:'open', reason:'open 24 hours'};

  const sp = spans(today);
  if (sp === null) return {state:'unknown', reason:'hours are in a format we cannot read'};
  let opensAt = null;
  for (const s2 of sp){
    const nowAdj = (mins < s2.from && s2.overnight) ? mins + 1440 : mins;
    if (nowAdj >= s2.from && nowAdj < s2.to)
      return {state:'open', until: fmtClock(s2.to % 1440), reason:`open until ${fmtClock(s2.to % 1440)}`};
    if (mins < s2.from && (opensAt === null || s2.from < opensAt)) opensAt = s2.from;
  }
  return {state:'closed', opensAt: opensAt != null ? fmtClock(opensAt) : null,
          reason: opensAt != null ? `closed until ${fmtClock(opensAt)}` : 'closed for the day'};
}
function parseDays(part){
  if (!part) return new Set([0,1,2,3,4,5,6]);              // no day part = every day
  const out = new Set();
  for (let chunk of part.split(',')){
    chunk = chunk.trim();
    if (!chunk) continue;
    const range = chunk.match(/^([a-z]{2})\s*-\s*([a-z]{2})$/);
    if (range){
      const a = DAY_IDX[range[1]], b = DAY_IDX[range[2]];
      if (a == null || b == null) return null;
      for (let i = 0; i < 7; i++){ const d = (a + i) % 7; out.add(d); if (d === b) break; }
      continue;
    }
    const one = DAY_IDX[chunk];
    if (one == null) return null;
    out.add(one);
  }
  return out.size ? out : null;
}
const fmtClock = m => `${String(Math.floor(m/60) % 24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* ---------- freshness -------------------------------------------------
   The loudest complaint about every app in this category is stale and
   wrong data. Age is shown honestly rather than hidden.                */
const DAY_MS = 86400000;
function freshness(feature, community, now = Date.now()){
  const confirms = (community && community.confirms) || [];
  const last = confirms.length ? confirms[confirms.length-1] : null;
  const reports = (community && community.reports) || [];
  if (reports.length >= 2) return {level:'disputed', label:'Reported as wrong', age:null};
  if (last){
    const days = (now - last.at)/DAY_MS;
    if (days < 1)  return {level:'fresh',   label:'Confirmed today', age:days};
    if (days < 7)  return {level:'fresh',   label:`Confirmed ${Math.round(days)} day${Math.round(days)===1?'':'s'} ago`, age:days};
    if (days < 60) return {level:'ageing',  label:`Last confirmed ${Math.round(days/7)} week${Math.round(days/7)===1?'':'s'} ago`, age:days};
    return {level:'stale', label:'Not confirmed in months', age:days};
  }
  const checked = feature && feature.tags && feature.tags.check_date;
  if (checked){
    const days = (now - Date.parse(checked))/DAY_MS;
    if (!isNaN(days)){
      if (days < 180) return {level:'ageing', label:`Checked on OpenStreetMap ${Math.round(days/30)} month${Math.round(days/30)===1?'':'s'} ago`, age:days};
      return {level:'stale', label:'Not checked in over a year', age:days};
    }
  }
  return {level:'unverified', label:'Nobody has confirmed this yet', age:null};
}

/* ---------- trust ------------------------------------------------------
   Ranks how much a listing has earned its place, so confirmed, reviewed,
   recently-touched entries beat an untouched import.                    */
function trustScore(feature, community, now = Date.now()){
  const c = community || {};
  const reviews = (c.reviews || []).filter(r => !r.photoOnly).length;
  const photos  = (c.reviews || []).reduce((a,r) => a + ((r.photos||[]).length), 0);
  const confirms = (c.confirms || []).length;
  const reports = (c.reports || []).length;
  const f = freshness(feature, c, now);
  const ageBonus = {fresh:30, ageing:12, unverified:0, stale:-10, disputed:-40}[f.level];
  const named = feature && feature.tags && feature.tags.name ? 8 : 0;
  const detail = feature && feature.tags
    ? ['opening_hours','wheelchair','fee','changing_table','unisex'].filter(k => feature.tags[k]).length * 4 : 0;
  const BASE = 20;      // an unverified import still starts above zero, so a
                        // reported listing can measurably sink below it
  return Math.max(0, Math.round(
    BASE + reviews*14 + Math.min(photos,6)*6 + Math.min(confirms,10)*5 + named + detail + ageBonus - reports*25));
}

/* ---------- clustering -------------------------------------------------
   Grid clustering in screen space. Dense cities produced hundreds of
   overlapping pins; this keeps the map readable without a plugin.      */
function project(lat, lng, zoom){
  const s = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * s;
  const sinLat = Math.sin(lat * Math.PI/180);
  const y = (0.5 - Math.log((1+sinLat)/(1-sinLat)) / (4*Math.PI)) * s;
  return {x, y};
}
function cluster(points, zoom, cellPx = 70){
  const cells = new Map();
  for (const p of points){
    const {x, y} = project(p.lat, p.lng, zoom);
    const key = `${Math.floor(x/cellPx)}:${Math.floor(y/cellPx)}`;
    let cell = cells.get(key);
    if (!cell){ cell = {items:[], sx:0, sy:0}; cells.set(key, cell); }
    cell.items.push(p); cell.sx += p.lat; cell.sy += p.lng;
  }
  const out = [];
  for (const cell of cells.values()){
    if (cell.items.length === 1){ out.push({type:'point', item:cell.items[0], lat:cell.items[0].lat, lng:cell.items[0].lng}); }
    else {
      /* keep the single most trustworthy pin visible, cluster the rest */
      const best = cell.items.reduce((a,b) => (b.score||0) > (a.score||0) ? b : a, cell.items[0]);
      out.push({type:'cluster', count:cell.items.length, items:cell.items, lead:best,
                lat:cell.sx/cell.items.length, lng:cell.sy/cell.items.length});
    }
  }
  return out;
}

/* ---------- search ranking ---------- */
function scoreMatch(feature, query){
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const name = (feature.name || '').toLowerCase();
  const sub  = (feature.sub || '').toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (sub.includes(q)) return 30;
  const words = q.split(/\s+/);
  if (words.length > 1 && words.every(w => (name + ' ' + sub).includes(w))) return 40;
  return 0;
}

const LIB = {haversine, fmtDist, walkMin, parseHours, parseDays, freshness, trustScore,
             cluster, project, scoreMatch};
if (typeof module !== 'undefined' && module.exports) module.exports = LIB;
if (typeof window !== 'undefined') Object.assign(window, LIB);
