/* =====================================================================
   Monetisation.

   Three revenue lines, in the order they actually pay:

     1. Sponsored listings — a café paying to be the bathroom people are
        sent to. Local intent, high value per impression, sold directly.
     2. Plus subscription — removes ads, adds offline city packs.
     3. Banner/native ads — filler for unsold inventory. Worth the least,
        so it gets the least screen.

   Placement rules, deliberately conservative:
     · Never an interstitial. Someone opens this app because they need a
       bathroom now; a full-screen ad in front of that is how you get
       uninstalled, and it burns the audience the other two lines need.
     · Never on the map itself, and never over the "is it open" answer.
     · Every paid placement is labelled. Undisclosed advertising is illegal
       (FTC) and breaks both stores' policies.
     · Unsold slots show house ads, never a blank box.
   ===================================================================== */
'use strict';

const Ads = (() => {

  const CONSENT_KEY = 'bf.ads.consent.v1';
  const FREQ_KEY    = 'bf.ads.freq.v1';

  /* How often a slot may appear.

     Density is the real control for native rows: one every LIST_EVERY
     results, never two on screen together, never above the first few real
     bathrooms. The hourly cap is a backstop against a pathological loop,
     not the thing shaping the experience — at 12 it was, because a single
     scroll through a long list would have exhausted it and shown nothing
     for the rest of the hour. */
  const LIST_EVERY   = 8;     // one native slot per 8 results
  const LIST_MAX     = 6;     // never more than this many in one rendered list
  const LIST_SKIP    = 3;     // the first 3 results are always real places
  const MAX_PER_HOUR = 60;    // backstop only

  let consent = null;
  try { consent = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); } catch(e){}

  const freq = () => { try { return JSON.parse(localStorage.getItem(FREQ_KEY) || '{"h":0,"n":0}'); } catch(e){ return {h:0,n:0}; } };
  const bumpFreq = () => {
    const hour = Math.floor(Date.now()/3600000), f = freq();
    const next = f.h === hour ? {h:hour, n:f.n+1} : {h:hour, n:1};
    try { localStorage.setItem(FREQ_KEY, JSON.stringify(next)); } catch(e){}
    return next.n;
  };
  const underCap = () => {
    const hour = Math.floor(Date.now()/3600000), f = freq();
    return f.h !== hour || f.n < MAX_PER_HOUR;
  };

  /* Plus removes ads entirely */
  const isPlus = () => { try { return localStorage.getItem('bf.plus') === '1'; } catch(e){ return false; } };

  /* ---- consent ----------------------------------------------------------
     Personalised ads need permission in the EU and, on iOS, an App Tracking
     Transparency prompt. Until someone says yes, only contextual ads run —
     no identifiers, no profile, nothing to leak.                          */
  const hasConsent = () => consent && consent.personalised === true;
  function setConsent(personalised){
    consent = {personalised: !!personalised, at: Date.now()};
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch(e){}
    return consent;
  }
  const consentAsked = () => !!consent;

  /* ---- house ads: what fills unsold inventory --------------------------- */
  const HOUSE = [
    {id:'house-sponsor', kind:'house',
     title:'Own a café, gym or shop?',
     body:'Get your bathroom in front of people already looking for one nearby.',
     cta:'List your business', action:'sponsor'},
    {id:'house-plus', kind:'house',
     title:'Bathroom Finder Plus',
     body:'No ads, offline city packs, and filters that remember what you need.',
     cta:'See what you get', action:'plus'},
    {id:'house-contribute', kind:'house',
     title:'Know a bathroom the map is missing?',
     body:'Adding it takes about a minute and helps the next person.',
     cta:'Add a bathroom', action:'add'}
  ];

  /* ---- the ad network seam ---------------------------------------------
     Deliberately empty. AdMob only exists inside a native build, and web
     networks want a live domain and traffic before they approve anything.
     When there is a real network, implement fetchNetworkAd() and it slots
     straight in — nothing above needs to change.                         */
  async function fetchNetworkAd(){
    return null;                    // no network configured yet
  }

  /* ---- what to show in a slot ------------------------------------------ */
  let sponsors = [];
  const setSponsors = list => { sponsors = Array.isArray(list) ? list : []; };

  /* A sponsor is only shown near where it actually is — a coffee shop four
     miles away is spam, not advertising. */
  function pickSponsor(origin, maxMetres = 1500){
    if (!sponsors.length || !origin) return null;
    const near = sponsors
      .map(s => ({s, d: haversine(origin, {lat:s.lat, lng:s.lng})}))
      .filter(x => x.d <= maxMetres)
      .sort((a,b) => a.d - b.d);
    return near.length ? {...near[0].s, distance: near[0].d} : null;
  }

  async function slot(context = {}){
    if (isPlus()) return null;
    if (!underCap()) return null;

    const sponsor = pickSponsor(context.origin);
    if (sponsor){ bumpFreq(); return {...sponsor, kind:'sponsored'}; }

    const network = hasConsent() ? await fetchNetworkAd() : null;
    if (network){ bumpFreq(); return {...network, kind:'network'}; }

    /* rotate house ads so it is not the same one every time */
    /* Do not advertise a door that is bolted. Filtering here rather than
       editing HOUSE keeps the entry ready for when Plus actually ships. */
    const f = window.BF_FEATURES || {};
    const pool = HOUSE.filter(x => x.action !== 'plus' || f.plus);
    const h = pool[Math.floor(Date.now()/60000) % pool.length];
    bumpFreq();
    return {...h};
  }

  /* Several distinct fills at once, for a list that is long enough to hold
     more than one. Never repeats a card within the batch: the same house ad
     six times reads as a broken app, not as advertising. That also means a
     short bench honestly yields fewer ads rather than the same one padded
     out — with no sponsors sold, a 120-row list carries three house cards,
     not six copies of one. */
  async function slots(n = 1, context = {}){
    if (isPlus() || !underCap() || n < 1) return [];
    const out = [], origin = context.origin;

    if (origin && sponsors.length){
      const near = sponsors
        .map(s => ({s, d: haversine(origin, {lat:s.lat, lng:s.lng})}))
        .filter(x => x.d <= (context.maxMetres || 1500))
        .sort((a, b) => a.d - b.d)
        .slice(0, n);
      for (const x of near) out.push({...x.s, distance: x.d, kind:'sponsored'});
    }

    if (out.length < n && hasConsent()){
      const net = await fetchNetworkAd();
      if (net) out.push({...net, kind:'network'});
    }

    /* House ads fill what is left, rotated by the clock so the same slot is
       not the same card every time, and each used at most once. */
    const f = window.BF_FEATURES || {};
    const pool = HOUSE.filter(x => x.action !== 'plus' || f.plus);
    const start = Math.floor(Date.now() / 60000);
    for (let i = 0; i < pool.length && out.length < n; i++){
      out.push({...pool[(start + i) % pool.length]});
    }

    for (let i = 0; i < out.length; i++) bumpFreq();
    return out;
  }

  return {slot, slots, setSponsors, pickSponsor, isPlus, hasConsent, setConsent, consentAsked,
          LIST_EVERY, LIST_MAX, LIST_SKIP, HOUSE, get consent(){ return consent; }};
})();
