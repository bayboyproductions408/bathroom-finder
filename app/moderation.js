/* =====================================================================
   Photo & text moderation.

   Every photo goes through this before it is visible to anyone else:

     1. re-encode      strips EXIF, and with it GPS coordinates and device id
     2. quality gate   blank, near-black or tiny images are rejected outright
     3. nudity check   nsfwjs (MobileNetV2) classifies on-device
     4. people check   blazeface — any detected face holds the photo, because
                       a bathroom photo with a person in it is a privacy
                       problem even when it is not explicit
     5. verdict        approved | pending | rejected

   The pipeline FAILS CLOSED: if a model will not load, or anything throws,
   the photo becomes `pending` and stays invisible until a human clears it.
   Nothing is ever published on the strength of "the check didn't run".

   Models are fetched from a CDN on first use (~4 MB, cached afterwards) and
   run entirely in the browser — photos are never uploaded for scanning.
   ===================================================================== */
'use strict';

const Moderation = (() => {

  const CDN = {
    tf:    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    nsfw:  'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js',
    model: 'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/models/mobilenet_v2/model.min.js',
    shard: 'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/models/mobilenet_v2/group1-shard1of1.min.js',
    face:  'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.1.0/dist/blazeface.min.umd.js'
  };

  /* Deliberately strict. A wrongly-held bathroom photo costs one person a
     short wait; a wrongly-published explicit photo costs a lot more.       */
  const T = {
    rejectExplicit: 0.12,   // Porn + Hentai over this → rejected outright
    holdExplicit:   0.06,   // …over this → held for a human regardless
    /* Real photos of tiled rooms and fixtures carry a 2–5% explicit noise
       floor on this model. Judging that in isolation held obviously-benign
       photos, so a weak explicit score only counts when the benign signal
       (neutral + drawing) is also weak. */
    softExplicit:   0.03,
    benignFloor:    0.60,
    holdSuggestive: 0.22,   // Sexy over this → held for a human
    minPixels:      120*120,
    minVariance:    45,     // flat/blank images
    minMeanLuma:    14,     // effectively black
    /* blazeface reports ~0.85 on high-contrast rectangles (mirrors, cubicle
       doors, signage) and ~0.97+ on real faces. Anything under this is noise;
       letting it through would put every ordinary bathroom photo in the queue
       and a queue nobody can get through is not moderation. */
    faceConfidence: 0.92,
    minFaceFrac:    0.02    // a "face" smaller than this is almost always noise
  };

  let nsfwModel = null, faceModel = null, loadPromise = null, loadFailed = false;

  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });

  async function ensureModels(onProgress){
    if (nsfwModel && faceModel) return true;
    if (loadFailed) return false;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        onProgress && onProgress('Downloading the safety checker…');
        await loadScript(CDN.tf);
        await loadScript(CDN.nsfw);
        await loadScript(CDN.model);
        await loadScript(CDN.shard);
        onProgress && onProgress('Starting the safety checker…');
        nsfwModel = await nsfwjs.load();
        try {
          await loadScript(CDN.face);
          faceModel = await blazeface.load();
        } catch(e){
          console.warn('face model unavailable', e);
          faceModel = null;               // handled as "cannot verify" below
        }
        return true;
      } catch(err){
        console.warn('moderation models failed to load', err);
        loadFailed = true;
        return false;
      } finally { loadPromise = null; }
    })();
    return loadPromise;
  }

  /* ---------- step 1: re-encode, stripping every embedded tag ---------- */
  function sanitize(file, max = 1200, quality = 0.72){
    return new Promise((resolve, reject) => {
      /* A modern iPhone hands over a 12-megapixel HEIC. Safari decodes HEIC
         itself, but createImageBitmap keeps the decode off the main thread
         and avoids the memory spike that kills the tab on older phones. */
      const finish = (source, w, h) => {
        const scale = Math.min(1, max / Math.max(w, h));
        const cv = document.createElement('canvas');
        cv.width  = Math.max(1, Math.round(w * scale));
        cv.height = Math.max(1, Math.round(h * scale));
        cv.getContext('2d', {willReadFrequently:true}).drawImage(source, 0, 0, cv.width, cv.height);
        if (source.close) source.close();
        resolve({canvas:cv, dataUrl:cv.toDataURL('image/jpeg', quality), w:cv.width, h:cv.height});
      };
      const viaImg = () => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => { finish(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(/heic|heif/i.test(file.type || file.name || '')
            ? 'This phone could not read that HEIC photo. In Settings → Camera → Formats, choose "Most Compatible", or pick a different photo.'
            : 'That file is not an image we can read'));
        };
        img.src = url;
      };
      if (typeof createImageBitmap === 'function'){
        createImageBitmap(file).then(bmp => finish(bmp, bmp.width, bmp.height)).catch(viaImg);
      } else viaImg();
    });
  }

  /* ---------- step 2: is it even a usable photo? ---------- */
  function quality(canvas){
    const w = Math.min(canvas.width, 160), h = Math.min(canvas.height, 160);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const px = tmp.getContext('2d').getImageData(0, 0, w, h).data;
    let sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i < px.length; i += 4){
      const l = 0.2126*px[i] + 0.7152*px[i+1] + 0.0722*px[i+2];
      sum += l; sumSq += l*l; n++;
    }
    const mean = sum/n, variance = sumSq/n - mean*mean;
    return {mean, variance,
            pixels: canvas.width * canvas.height,
            tooSmall: canvas.width * canvas.height < T.minPixels,
            tooFlat: variance < T.minVariance,
            tooDark: mean < T.minMeanLuma};
  }

  /* ---------- the decision, kept pure so the policy can be tested ----------
     faces: count of confident detections, or -1 meaning "could not check"  */
  function decide(scores, faces){
    const explicit = (scores.porn || 0) + (scores.hentai || 0);
    const sexy     = scores.sexy || 0;
    const benign   = (scores.neutral || 0) + (scores.drawing || 0);
    const reasons  = [];

    if (explicit >= T.rejectExplicit)
      return {verdict:'rejected',
              reasons:['This looks like explicit content. Bathroom Finder only accepts photos of the room itself.']};

    if (explicit >= T.holdExplicit)
      reasons.push('The automatic check was not confident this is safe');
    else if (explicit >= T.softExplicit && benign < T.benignFloor)
      reasons.push('The automatic check could not tell what this is');

    if (sexy >= T.holdSuggestive) reasons.push('The automatic check flagged this as possibly suggestive');
    if (faces > 0)  reasons.push(`${faces} ${faces === 1 ? 'person was' : 'people were'} detected — photos with people in them need a human to check`);
    if (faces === -1) reasons.push('We could not check this photo for people in it');

    return {verdict: reasons.length ? 'pending' : 'approved',
            reasons: reasons.length ? reasons : ['Passed the automatic checks']};
  }

  /* ---------- the pipeline ---------- */
  async function screenPhoto(file, onProgress){
    let clean;
    try { clean = await sanitize(file); }
    catch(err){ return {verdict:'rejected', reasons:['That file could not be read as an image'], dataUrl:null}; }

    const q = quality(clean.canvas);
    if (q.tooSmall)
      return {verdict:'rejected', dataUrl:clean.dataUrl, reasons:['That image is too small to show anything useful']};
    if (q.tooDark)
      return {verdict:'rejected', dataUrl:clean.dataUrl, reasons:['That photo is too dark to make anything out']};
    if (q.tooFlat)
      return {verdict:'rejected', dataUrl:clean.dataUrl, reasons:['That photo is blank or out of focus']};

    /* called through the public object so a test can stub it and prove the
       fail-closed path actually holds photos back */
    const ready = await api.ensureModels(onProgress);
    if (!ready){
      /* fail closed */
      return {verdict:'pending', dataUrl:clean.dataUrl, scores:null,
              reasons:['The automatic safety check could not run on this device, so this photo is waiting for a person to look at it']};
    }

    onProgress && onProgress('Checking the photo…');
    let scores = null, faces = 0, reasons = [];
    try {
      const preds = await nsfwModel.classify(clean.canvas);
      scores = {};
      for (const p of preds) scores[p.className.toLowerCase()] = p.probability;
    } catch(err){
      console.warn('classify failed', err);
      return {verdict:'pending', dataUrl:clean.dataUrl, scores:null,
              reasons:['The automatic safety check did not finish, so this photo is waiting for a person to look at it']};
    }

    if (faceModel){
      try {
        const found = await faceModel.estimateFaces(clean.canvas, false) || [];
        const area = clean.canvas.width * clean.canvas.height;
        faces = found.filter(f => {
          const p = Array.isArray(f.probability) || ArrayBuffer.isView(f.probability)
            ? f.probability[0] : (f.probability != null ? f.probability : 1);
          const w = f.bottomRight[0] - f.topLeft[0], h = f.bottomRight[1] - f.topLeft[1];
          return p >= T.faceConfidence && (w*h)/area >= T.minFaceFrac;
        }).length;
      }
      catch(err){ console.warn('face detect failed', err); faces = -1; }
    } else faces = -1;

    const d = decide(scores, faces);
    return {verdict:d.verdict, dataUrl:clean.dataUrl, scores, faces, reasons:d.reasons};
  }

  /* ---------- review text ---------- */
  const PATTERNS = [
    {re:/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/i,                 why:'an email address'},
    {re:/(?:\+?\d[\s().-]{0,2}){9,}/,                       why:'what looks like a phone number'},
    {re:/\b(?:https?:\/\/|www\.)\S+/i,                      why:'a link'},
    {re:/\b\d{1,5}\s+\w+\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr)\b/i, why:'a street address'}
  ];
  function screenText(text){
    const t = String(text || '');
    const reasons = [];
    for (const p of PATTERNS) if (p.re.test(t)) reasons.push(`It contains ${p.why} — please take that out`);
    if (t.length > 40 && t.replace(/[^A-Z]/g,'').length / t.replace(/[^A-Za-z]/g,'').length > 0.7)
      reasons.push('It is almost entirely capitals');
    return {ok: reasons.length === 0, reasons};
  }

  const api = {screenPhoto, screenText, ensureModels, decide, thresholds:T,
               get status(){ return {loaded: !!nsfwModel, faces: !!faceModel, failed: loadFailed}; }};
  return api;
})();
