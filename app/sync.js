/* =====================================================================
   Talks to the shared backend.

   Everything still works with no server and no signal: writes go into an
   outbox in localStorage and drain when the connection comes back, and the
   app keeps its local copy either way. If the backend is unreachable the
   app degrades to exactly what it was before — single-player, not broken.
   ===================================================================== */
'use strict';

const Sync = (() => {
  /* empty on the web (same origin); set by config.js in the native builds */
  const BASE = () => (window.BF_CONFIG && window.BF_CONFIG.apiBase) || '';
  const KEY_ID = 'bf.identity.v1';
  const KEY_OUT = 'bf.outbox.v1';

  let identity = null, online = false, checked = false;
  try { identity = JSON.parse(localStorage.getItem(KEY_ID) || 'null'); } catch(e){}

  const outbox = () => { try { return JSON.parse(localStorage.getItem(KEY_OUT) || '[]'); } catch(e){ return []; } };
  const setOutbox = list => { try { localStorage.setItem(KEY_OUT, JSON.stringify(list.slice(-200))); } catch(e){} };

  async function req(method, path, body, extra){
    const headers = {'Content-Type':'application/json', ...(extra || {})};
    if (identity && identity.token) headers.Authorization = 'Bearer ' + identity.token;
    const res = await fetch(BASE() + path, {
      method, headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = null; }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `HTTP ${res.status}`), {status:res.status});
    return data;
  }

  async function check(){
    checked = true;
    try {
      const h = await req('GET', '/api/v1/health');
      online = !!(h && h.ok);
    } catch(e){ online = false; }
    return online;
  }

  async function ensureIdentity(name){
    if (identity && identity.token) return identity;
    const out = await req('POST', '/api/v1/register', {name: name || 'Anonymous'});
    identity = {userId: out.userId, token: out.token, name: out.name};
    try { localStorage.setItem(KEY_ID, JSON.stringify(identity)); } catch(e){}
    return identity;
  }

  async function rename(name){
    if (!online) return;
    try { await ensureIdentity(name); await req('POST', '/api/v1/me', {name}); identity.name = name;
          localStorage.setItem(KEY_ID, JSON.stringify(identity)); } catch(e){}
  }

  /* ---- writes: try now, otherwise queue ---- */
  async function send(path, payload){
    if (!online){ queue(path, payload); return {queued:true}; }
    try {
      await ensureIdentity(payload && payload.userName);
      return await req('POST', path, payload);
    } catch(err){
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      queue(path, payload);
      return {queued:true};
    }
  }
  function queue(path, payload){
    const list = outbox();
    list.push({path, payload, at:Date.now()});
    setOutbox(list);
  }
  async function flush(){
    if (!online) return 0;
    const list = outbox();
    if (!list.length) return 0;
    let sent = 0;
    const keep = [];
    for (const item of list){
      try { await ensureIdentity(); await req('POST', item.path, item.payload); sent++; }
      catch(err){
        /* a permanent rejection is dropped; a temporary one is kept */
        if (!(err.status >= 400 && err.status < 500 && err.status !== 429)) keep.push(item);
      }
    }
    setOutbox(keep);
    return sent;
  }

  /* ---- reads ---- */
  async function pullArea(bounds){
    if (!online) return null;
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(n => n.toFixed(5)).join(',');
    return req('GET', `/api/v1/places?bbox=${bbox}`);
  }
  const pullPlace = id => online ? req('GET', `/api/v1/place?id=${encodeURIComponent(id)}`) : Promise.resolve(null);

  const photoURL = id => BASE() + '/api/v1/photo?id=' + encodeURIComponent(id);

  return {
    get online(){ return online; },
    get checked(){ return checked; },
    get identity(){ return identity; },
    get pending(){ return outbox().length; },
    check, ensureIdentity, rename, flush, pullArea, pullPlace, photoURL,
    review:     p => send('/api/v1/review', p),
    photo:      p => send('/api/v1/photo', p),
    confirm:    p => send('/api/v1/confirm', p),
    report:     p => send('/api/v1/report', p),
    correction: p => send('/api/v1/correction', p),
    place:      p => send('/api/v1/place', p),
    feedback:   p => send('/api/v1/feedback', p)
  };
})();
