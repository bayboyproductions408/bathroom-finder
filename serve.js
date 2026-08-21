/* =====================================================================
   Bathroom Finder — dev server
     - serves app/ over http and (if certs/ exists) https
     - https matters: phone browsers refuse geolocation on plain http
     - /api/pay/*  payment authorise → capture → void, with a provider seam
   Usage:  node serve.js [httpPort] [httpsPort]
   ===================================================================== */
const http = require('http'), https = require('https'), fs = require('fs'),
      path = require('path'), os = require('os'), crypto = require('crypto');

const ROOT       = path.join(__dirname, 'app');
const CERT_DIR   = path.join(__dirname, 'certs');
const LEDGER     = path.join(__dirname, 'ledger.json');
/* Hosted platforms (Render, Railway, Koyeb, Fly…) hand you one port and
   terminate TLS themselves. When PORT is set we listen on exactly that and
   skip the local certificate machinery entirely. */
const HOSTED     = !!process.env.PORT;
const HTTP_PORT  = Number(process.env.PORT) || Number(process.argv[2]) || 8080;
const HTTPS_PORT = Number(process.argv[3]) || 8443;
const PLATFORM_FEE = 0.15;

const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png',
               '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json',
               '.crt':'application/x-x509-ca-cert'};

/* ---------- payment provider seam ----------------------------------------
   Default provider is 'sim': it moves no money and stores nothing sensitive.
   Set STRIPE_SECRET_KEY (a test key, sk_test_…) to switch to real Stripe
   PaymentIntents with manual capture — the same three calls, same shapes.
   Card details are never posted to this server in either mode.            */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const PROVIDER = STRIPE_KEY ? 'stripe' : 'sim';

let ledger = {};
try { ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch(e){ ledger = {}; }
const persist = () => { try { fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); } catch(e){} };

async function stripeCall(endpoint, params, method = 'POST'){
  const body = new URLSearchParams(params).toString();
  const res = await fetch('https://api.stripe.com/v1/' + endpoint, {
    method,
    headers:{'Authorization':'Bearer ' + STRIPE_KEY, 'Content-Type':'application/x-www-form-urlencoded'},
    body: method === 'POST' ? body : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error && json.error.message || 'stripe error');
  return json;
}

const money = (amount, currency) => ({
  amount, currency,
  fee: Math.round(amount * PLATFORM_FEE * 100) / 100,
  payout: Math.round(amount * (1 - PLATFORM_FEE) * 100) / 100
});

const API = {
  async config(){
    return {provider:PROVIDER, platformFee:PLATFORM_FEE,
            note: PROVIDER === 'sim'
              ? 'Simulation mode — no money moves and no card details are collected.'
              : 'Stripe test mode — real API calls, test money only.'};
  },
  /* authorise = put a hold on the guest's method, taken when the host accepts */
  async authorize(b){
    const {bookingId, amount, currency = 'usd', method = 'sim_visa'} = b;
    if (!bookingId || !(amount > 0)) throw new Error('bookingId and a positive amount are required');
    const id = 'pay_' + crypto.randomBytes(8).toString('hex');
    const m = money(amount, currency);
    let providerRef = null;
    if (PROVIDER === 'stripe'){
      const pi = await stripeCall('payment_intents', {
        amount: Math.round(amount * 100), currency,
        capture_method:'manual', 'metadata[bookingId]':bookingId,
        'automatic_payment_methods[enabled]':'true'
      });
      providerRef = {id:pi.id, client_secret:pi.client_secret, status:pi.status};
    }
    ledger[id] = {id, bookingId, ...m, method, status:'authorized', provider:PROVIDER,
                  providerRef, created:Date.now(), events:[{at:Date.now(), type:'authorized'}]};
    persist();
    return ledger[id];
  },
  /* capture = actually take it, once the guest has arrived and been let in */
  async capture(b){
    const p = ledger[b.id];
    if (!p) throw new Error('unknown payment');
    if (p.status === 'captured') return p;
    if (p.status !== 'authorized') throw new Error(`cannot capture a ${p.status} payment`);
    if (PROVIDER === 'stripe' && p.providerRef) await stripeCall(`payment_intents/${p.providerRef.id}/capture`, {});
    p.status = 'captured'; p.capturedAt = Date.now();
    p.receipt = 'rcpt_' + crypto.randomBytes(5).toString('hex');
    p.events.push({at:Date.now(), type:'captured'});
    persist();
    return p;
  },
  /* void = release the hold, nothing is taken */
  async void(b){
    const p = ledger[b.id];
    if (!p) throw new Error('unknown payment');
    if (p.status === 'captured') throw new Error('already captured — refund instead');
    if (PROVIDER === 'stripe' && p.providerRef) await stripeCall(`payment_intents/${p.providerRef.id}/cancel`, {});
    p.status = 'voided'; p.events.push({at:Date.now(), type:'voided'});
    persist();
    return p;
  },
  async refund(b){
    const p = ledger[b.id];
    if (!p) throw new Error('unknown payment');
    if (p.status !== 'captured') throw new Error('only captured payments can be refunded');
    if (PROVIDER === 'stripe' && p.providerRef) await stripeCall('refunds', {payment_intent:p.providerRef.id});
    p.status = 'refunded'; p.events.push({at:Date.now(), type:'refunded'});
    persist();
    return p;
  },
  async get(b){ const p = ledger[b.id]; if (!p) throw new Error('unknown payment'); return p; },
  async ledger(){ return Object.values(ledger).sort((a,b)=>b.created-a.created); }
};

/* ---- config from .env, so secrets are not baked into the source ---- */
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split('\n')){
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && !process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
} catch(e){}

/* A public URL means anyone can try the moderator endpoints. Refuse to run
   with the development token once the server is reachable from outside. */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-moderator-token';
if (ADMIN_TOKEN === 'dev-moderator-token' && process.env.PUBLIC === '1'){
  console.error('\nRefusing to start: PUBLIC=1 but ADMIN_TOKEN is still the default.');
  console.error('Run  node tools/make-admin-token.js  first.\n');
  process.exit(1);
}

/* the shared backend: reviews, photos, corrections — everyone sees everyone */
const { createAPI } = require('./server/api.js');
const api = createAPI({
  file: path.join(__dirname, 'data', 'bathroomfinder.db'),
  adminToken: ADMIN_TOKEN
});

function serve(req, res){
  res.setHeader('Cache-Control', 'no-cache');

  if (req.url.startsWith('/api/v1/')){
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress || 'unknown';
    let body = '';
    req.on('data', d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch(e){}
      const handled = await api.handle(req, res, url, parsed, ip);
      if (!handled){
        res.writeHead(404, {'Content-Type':'application/json'});
        res.end('{"error":"no such endpoint"}');
      }
    });
    return;
  }

  if (req.url.startsWith('/api/')){
    const name = req.url.replace('/api/pay/','').split('?')[0];
    if (!API[name]){ res.writeHead(404, {'Content-Type':'application/json'}); return res.end('{"error":"no such endpoint"}'); }
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch(e){}
      try {
        const out = await API[name](parsed);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify(out));
      } catch(err){
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:String(err.message || err)}));
      }
    });
    return;
  }

  /* the CA certificate, so a phone can be told to trust this machine.
     iOS only offers to install it when the content type is exactly this. */
  if (req.url.split('?')[0] === '/ca.crt'){
    try {
      const ca = fs.readFileSync(path.join(CERT_DIR, 'ca.pem'));
      res.writeHead(200, {'Content-Type':'application/x-x509-ca-cert',
                          'Content-Disposition':'attachment; filename="BathroomFinderDevCA.crt"'});
      return res.end(ca);
    } catch(e){ res.writeHead(404); return res.end('no CA certificate'); }
  }

  /* Digital Asset Links must be served from the site root as JSON, or Android
     will not verify the app against the domain and the TWA shows a URL bar. */
  if (req.url.split('?')[0] === '/.well-known/assetlinks.json'){
    try {
      const f = fs.readFileSync(path.join(ROOT, '.well-known', 'assetlinks.json'));
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(f);
    } catch(e){
      res.writeHead(404, {'Content-Type':'application/json'});
      return res.end('{"error":"assetlinks not generated yet — run node tools/make-assetlinks.js"}');
    }
  }

  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('not found'); }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
}

/* Only addresses on a real subnet — 169.254.x.x means that adapter has no
   network, and printing it just sends people chasing an address that
   cannot work. */
const ips = Object.values(os.networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
  .map(i => i.address);

let tls = null;
if (!HOSTED) try {
  tls = {key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')),
         cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem'))};
  /* send the issuing CA alongside the leaf so a phone that trusts the CA
     validates the chain without needing anything else */
  try { tls.ca = fs.readFileSync(path.join(CERT_DIR, 'ca.pem')); } catch(e){}
} catch(e){}

/* Listen on the default ports as well as the high ones. A URL with no port
   is far more likely to survive a phone camera's QR handling, and some
   scanners quietly refuse anything unusual. Binding is best-effort: if a
   port is taken we carry on with the others instead of crashing. */
const httpPorts  = HOSTED ? [HTTP_PORT] : [...new Set([80, HTTP_PORT])];
const httpsPorts = HOSTED ? []          : [...new Set([443, HTTPS_PORT])];
const live = {http:[], https:[]};

function listen(server, port, kind, done){
  server.on('error', err => {
    console.log(`  (port ${port} unavailable: ${err.code})`);
    done();
  });
  server.listen(port, '0.0.0.0', () => { live[kind].push(port); done(); });
}

let pending = httpPorts.length + (tls ? httpsPorts.length : 0);
const report = () => { if (--pending === 0) banner(); };
httpPorts.forEach(p => listen(http.createServer(serve), p, 'http', report));
if (tls) httpsPorts.forEach(p => listen(https.createServer(tls, serve), p, 'https', report));
else banner();

function banner(){
  if (HOSTED){
    console.log(`\nBathroom Finder listening on ${HTTP_PORT} · payments: ${PROVIDER}`);
    console.log(`Moderator console at /moderate.html\n`);
    return;
  }
  const url = (scheme, ip, port) =>
    `${scheme}://${ip}` + ((scheme === 'http' && port === 80) || (scheme === 'https' && port === 443) ? '' : `:${port}`);
  console.log(`\nBathroom Finder  ·  payments: ${PROVIDER}\n`);
  if (live.http.length)
    console.log(`  on this computer     ${url('http', 'localhost', live.http[0])}`);
  for (const ip of ips){
    for (const p of live.http)  console.log(`  phone, no location    ${url('http', ip, p)}`);
    for (const p of live.https) console.log(`  phone, location ✓     ${url('https', ip, p)}`);
  }
  if (!ips.length) console.log('  No network address found — this machine is not on a LAN.');
  if (ips.length){
    console.log(`\n  START HERE ON A PHONE   http://${ips[0]}/check.html`);
    console.log(`  It reports what actually works on that phone before you go hunting.`);
  }
  if (live.https.length){
    console.log(`\n  For location and offline mode, the phone has to trust this machine:`);
    console.log(`    1. open  http://${ips[0] || 'this-machine'}/ca.crt  on the phone`);
    console.log(`    2. iPhone: Settings → Profile Downloaded → Install, then`);
    console.log(`       Settings → General → About → Certificate Trust Settings → switch it on`);
    console.log(`    3. then use the https address — no warning, location works`);
    console.log(`  Only do that on your own test devices. See IPHONE.md.`);
  }
  console.log('');
}
