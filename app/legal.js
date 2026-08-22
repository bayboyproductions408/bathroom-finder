/* Shared chrome for the legal and support pages. These are public documents
   the App Store requires a link to, so they need to look like part of the
   product rather than a text dump. */
(function(){
  const SUPPORT_EMAIL = window.BF_SUPPORT_EMAIL || 'bayboyproductions408@gmail.com';
  document.documentElement.setAttribute('data-theme',
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  const nav = document.createElement('nav');
  nav.className = 'legalnav';
  nav.innerHTML = `
    <a class="brand" href="./">
      <span class="glyph"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg></span>
      Bathroom Finder</a>
    <span class="links">
      <a href="./privacy.html">Privacy</a>
      <a href="./terms.html">Terms</a>
      <a href="./support.html">Support</a>
    </span>`;
  document.body.prepend(nav);

  for (const el of document.querySelectorAll('[data-support-email]'))
    el.innerHTML = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;

  const foot = document.createElement('footer');
  foot.className = 'legalfoot';
  foot.innerHTML = `Bathroom Finder · <a href="./">Open the app</a> ·
    Place data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`;
  document.body.append(foot);
})();
