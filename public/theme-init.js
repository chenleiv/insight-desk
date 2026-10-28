// Sets the theme before the first paint so the page does not flash.
// Kept as a file, not an inline <script>, so the CSP can drop 'unsafe-inline'.
(function () {
  try {
    var theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { }
})();
