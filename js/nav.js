/* ============================================================
   AGENTX — NAVBAR PARTAJAT
   Injecteaza acelasi navbar pe toate paginile si marcheaza
   automat pagina curenta. Stilurile sunt in css/theme.css.
   ============================================================ */
(function () {
  // Pe server folosim URL-urile curate (/clinici), la deschiderea locala
  // a fisierelor folosim numele reale, ca previzualizarea sa functioneze.
  var live = /^https?:$/.test(window.location.protocol);

  function url(slug, hash) {
    if (live) return '/' + (slug || '') + (hash || '');
    return (slug ? slug + '.html' : 'index.html') + (hash || '');
  }

  var LINKS = [
    { href: url('clinici'),    label: 'Clinici',     match: ['/clinici', 'clinici.html'] },
    { href: url('dealer'),     label: 'Dealer Auto', match: ['/dealer', 'dealer.html'] },
    { href: url('piese-auto'), label: 'Piese Auto',  match: ['/piese-auto', 'piese-auto.html', 'dezmembrari.html'] },
    { href: url('', '#servicii'),   label: 'Pachete' },
    { href: url('', '#despre-noi'), label: 'Despre noi' }
  ];

  var needsOffset = null;

  function isCurrent(link) {
    if (!link.match) return false;
    var path = window.location.pathname.toLowerCase().replace(/\/$/, '');
    for (var i = 0; i < link.match.length; i++) {
      if (path.indexOf(link.match[i]) !== -1) return true;
    }
    return false;
  }

  function build() {
    var header = document.createElement('header');
    header.className = 'nav';
    header.id = 'agx-nav';

    var html = '<div class="nav__inner">' +
      '<a href="' + url('') + '" class="nav__logo" aria-label="Acasă">' +
        '<img src="' + (live ? '/' : '') + 'Indicatii/LOGO_FINAL.png" alt="AgentX" />' +
      '</a>' +
      '<div class="nav__menu" id="agx-nav-menu">' +
      '<nav class="nav__links" id="agx-nav-links">';

    for (var i = 0; i < LINKS.length; i++) {
      var l = LINKS[i];
      html += '<a href="' + l.href + '" class="nav__link"' +
              (isCurrent(l) ? ' aria-current="page"' : '') + '>' + l.label + '</a>';
    }

    html += '</nav>' +
      '<a href="' + url('', '#contact') + '" class="nav__cta" id="agx-nav-cta">Hai să vorbim</a>' +
      '</div>' +
      '<button class="nav__burger" id="agx-nav-burger" aria-label="Meniu" aria-expanded="false">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
    '</div>';

    header.innerHTML = html;
    return header;
  }

  function wire(header) {
    var burger = header.querySelector('#agx-nav-burger');
    if (!burger) return;
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('nav--open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Paginile bundle-uite inlocuiesc tot <html> dupa montare, deci pierd
  // <link>-urile din head-ul static. Le punem la loc la fiecare injectare.
  function ensureStyles() {
    if (!document.head) return;
    var sheets = [
      { id: 'agx-theme-css', href: (live ? '/' : '') + 'css/theme.css' },
      { id: 'agx-fonts-css', href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap' }
    ];
    for (var i = 0; i < sheets.length; i++) {
      if (document.getElementById(sheets[i].id)) continue;
      if (document.querySelector('link[href="' + sheets[i].href + '"]')) continue;
      var link = document.createElement('link');
      link.id = sheets[i].id;
      link.rel = 'stylesheet';
      link.href = sheets[i].href;
      document.head.appendChild(link);
    }
  }

  function inject() {
    if (!document.body) return false;
    ensureStyles();
    if (document.getElementById('agx-nav')) return true;

    var header = build();
    var mount = document.getElementById('agx-navbar');
    if (mount) {
      mount.parentNode.replaceChild(header, mount);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
    wire(header);

    // Paginile care nu rezerva singure spatiu sub navbar (ex. cele bundle-uite).
    // Flagul se citeste o singura data si se tine in closure: pe paginile
    // bundle-uite body-ul initial (cu atributul) e inlocuit dupa montare.
    if (needsOffset === null) needsOffset = document.body.hasAttribute('data-nav-offset');
    if (needsOffset) document.body.style.paddingTop = '78px';

    return true;
  }

  if (!inject()) {
    var t = setInterval(function () { if (inject()) clearInterval(t); }, 30);
    setTimeout(function () { clearInterval(t); }, 10000);
  }
  window.addEventListener('load', inject);

  // Paginile bundle-uite isi rescriu body-ul dupa montare — reinjecteaza atunci.
  if (window.MutationObserver) {
    var obs = new MutationObserver(function () {
      if (!document.getElementById('agx-nav')) inject();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 15000);
  }
})();
