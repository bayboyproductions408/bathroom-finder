/* =====================================================================
   AdMob — native builds only.

   AdMob's SDK is iOS/Android native; there is no web version, so this file
   is a no-op in a browser and the app keeps using its own sponsored-listing
   slot. Ads only ever appear in the App Store / Play build.

   Placement rules are the same as everywhere else in this app:
     · An anchored bottom banner. Nothing else. No interstitial, no app-open.
     · The layout is padded by exactly the banner height, so it never covers
       the tab bar or a result — a banner that hides content is how you lose
       the user who opened this in a hurry.
     · Hidden entirely for Plus subscribers.
     · Personalised only after an explicit yes (and, on iOS, after ATT).
   ===================================================================== */
'use strict';

const AdMobNative = (() => {

  /* Public by design — these ship inside the binary and are visible to
     anyone who unzips the app. They are identifiers, not credentials. */
  const IDS = {
    ios: {
      appId:  'ca-app-pub-9072066961806430~1491102649',
      banner: 'ca-app-pub-9072066961806430/9430292092'
    },
    android: {
      /* filled in when the Play listing exists; until then Android falls
         back to the in-app sponsored slot rather than showing test ads */
      appId:  '',
      banner: ''
    }
  };

  /* Google's official test IDs. Using a live unit during development gets
     an account suspended for invalid traffic, so debug builds use these. */
  const TEST = {
    ios:     'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111'
  };

  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform &&
                            window.Capacitor.isNativePlatform());
  const platform = () => (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web';
  const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;

  let shown = false, initialised = false;

  function unitFor(){
    const p = platform();
    const isDebug = /localhost|127\.0\.0\.1/.test(location.hostname) ||
                    (window.BF_CONFIG && window.BF_CONFIG.build === 'debug');
    if (isDebug) return TEST[p] || TEST.ios;
    return (IDS[p] && IDS[p].banner) || '';
  }

  async function init(){
    if (initialised || !isNative()) return false;
    const AdMob = plugin();
    if (!AdMob) return false;
    try {
      await AdMob.initialize({initializeForTesting: false});
      initialised = true;
      return true;
    } catch(err){ console.warn('AdMob init failed', err); return false; }
  }

  /* iOS: ATT must be answered before anything personalised. A "no" here is
     not a failure — it means non-personalised ads, which still pay. */
  async function requestTracking(){
    const AdMob = plugin();
    if (!AdMob || platform() !== 'ios') return 'n/a';
    try {
      const {status} = await AdMob.trackingAuthorizationStatus();
      if (status === 'notDetermined'){
        const res = await AdMob.requestTrackingAuthorization();
        return res.status;
      }
      return status;
    } catch(err){ return 'error'; }
  }

  async function showBanner(){
    if (!isNative()) return false;
    if (typeof Ads !== 'undefined' && Ads.isPlus()) return false;
    const AdMob = plugin();
    const adId = unitFor();
    if (!AdMob || !adId) return false;
    if (!initialised && !(await init())) return false;

    const tracking = await requestTracking();
    const personalised = tracking === 'authorized' &&
      (typeof Ads === 'undefined' || Ads.hasConsent());

    try {
      await AdMob.showBanner({
        adId,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        npa: !personalised          // non-personalised unless we truly may
      });
      shown = true;
      document.documentElement.classList.add('has-banner');
      return true;
    } catch(err){ console.warn('banner failed', err); return false; }
  }

  async function hideBanner(){
    const AdMob = plugin();
    if (!AdMob || !shown) return;
    try { await AdMob.hideBanner(); } catch(err){}
    shown = false;
    document.documentElement.classList.remove('has-banner');
  }

  /* The banner's real height is reported by the plugin; pad by exactly that
     so nothing is covered and nothing is over-padded. */
  function listenForSize(){
    const AdMob = plugin();
    if (!AdMob || !AdMob.addListener) return;
    try {
      AdMob.addListener('bannerAdSizeChanged', info => {
        const h = (info && info.height) || 0;
        document.documentElement.style.setProperty('--banner-height', h ? h + 'px' : '0px');
      });
    } catch(err){}
  }

  async function start(){
    if (!isNative()) return;
    listenForSize();
    await showBanner();
  }

  return {start, showBanner, hideBanner, init, isNative, unitFor, IDS,
          get active(){ return shown; }};
})();
