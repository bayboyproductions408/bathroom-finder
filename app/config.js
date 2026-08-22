/* Where the backend lives.

   On the web this is empty — the API is on the same origin as the page.

   Inside the iOS or Android app it cannot be empty: the app's own origin is
   capacitor://localhost, so a relative /api/... call would hit the bundled
   files and 404. tools/prepare-ios.js rewrites this at build time from
   API_BASE, and every network call in the app goes through apiURL().        */
window.BF_CONFIG = {
  apiBase: '',            // e.g. 'https://bathroom-finder.onrender.com'
  build: 'web'
};

window.apiURL = p => (window.BF_CONFIG.apiBase || '') + p;
