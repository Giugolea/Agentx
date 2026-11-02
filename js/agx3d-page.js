/* ============================================================
   AGENTX — SECTIUNEA 3D DE PE PAGINILE DE DOMENIU
   Se incarca cu ?k=clinica | dealer | piese si insereaza, imediat
   dupa hero, o sectiune in care obiectul domeniului se roteste la
   scroll. Paginile bundle-uite isi rescriu documentul dupa montare,
   asa ca verificam periodic si reinseram daca sectiunea a disparut.
   ============================================================ */
import { mountObjects, supportsWebGL } from './agx3d.js';

const kind = new URL(import.meta.url).searchParams.get('k') || 'clinica';

const COPY = {
  clinica: {
    title: 'Ascultă fiecare pacient. Și la 23:47.',
    steps: [
      ['Pacientul scrie', 'Un mesaj pe WhatsApp după program. Ariana răspunde în câteva secunde, pe tonul clinicii tale.'],
      ['Programarea se face', 'Verifică agenda, propune orele libere și confirmă programarea direct în calendar.'],
      ['Recepția află dimineața', 'Programarea e deja în calendar, iar pacientul primește reminder cu o zi înainte.']
    ]
  },
  dealer: {
    title: 'Cheile rămân la tine. Lead-urile nu se mai pierd.',
    steps: [
      ['Clientul întreabă', 'De o mașină din stoc, la 22:00. Ariana îi răspunde imediat cu detalii și poze.'],
      ['Ariana califică lead-ul', 'Află bugetul, dacă vrea finanțare sau buy-back și programează test drive-ul.'],
      ['Vânzătorul preia', 'Primește lead-ul cu toate detaliile și îl sună pe client când e pregătit să cumpere.']
    ]
  },
  piese: {
    title: 'Piesa potrivită, găsită și la miezul nopții.',
    steps: [
      ['Clientul cere piesa', 'Spune modelul, anul și motorizarea, sau trimite direct seria de șasiu.'],
      ['Ariana verifică', 'Compatibilitatea, stocul și prețul, fără să mai sune nimeni la depozit.'],
      ['Comanda pleacă', 'Clientul confirmă, primește termenul de livrare, iar tu primești comanda gata făcută.']
    ]
  }
}[kind];

const CSS = `
.agx3d{position:relative;height:330vh;background:#070c15;color:#eaf1fa;font-family:inherit}
.agx3d__stage{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden}
.agx3d__stage::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 55% at 70% 50%,rgba(56,189,248,.16),transparent 70%);pointer-events:none}
.agx3d__canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.agx3d__ui{position:relative;z-index:1;box-sizing:border-box;height:100%;max-width:1200px;margin:0 auto;padding:110px 24px 56px;display:flex;flex-direction:column;justify-content:center;gap:34px;pointer-events:none}
.agx3d__title{font-size:clamp(2.1rem,4.6vw,3.9rem);line-height:1.02;letter-spacing:-.035em;font-weight:800;max-width:12ch;margin:0;color:#fff}
.agx3d__steps{list-style:none;margin:0;padding:0;display:grid;gap:22px;max-width:400px;counter-reset:s}
.agx3d__steps li{counter-increment:s;border-left:2px solid rgba(56,189,248,.22);padding:2px 0 2px 20px;opacity:.38;transition:opacity .5s,border-color .5s,transform .5s cubic-bezier(.2,.8,.2,1)}
.agx3d__steps li.is-on{opacity:1;border-color:#38bdf8;transform:translateX(6px)}
.agx3d__steps b{display:block;font-size:1.25rem;font-weight:700;letter-spacing:-.01em;margin-bottom:6px;color:#fff}
.agx3d__steps b::before{content:"0" counter(s) "  ";color:#38bdf8;font-variant-numeric:tabular-nums}
.agx3d__steps p{margin:0;color:#b4c3d6;font-size:1.02rem;line-height:1.55}
.agx3d__bar{width:min(400px,100%);height:2px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
.agx3d__bar i{display:block;height:100%;width:100%;background:#38bdf8;transform-origin:left;transform:scaleX(0)}
@media (max-width:760px){
  .agx3d{height:300vh}
  .agx3d__ui{justify-content:flex-end;gap:18px;padding:90px 20px 36px}
  .agx3d__title{font-size:clamp(1.8rem,8vw,2.4rem)}
  .agx3d__steps li{display:none}
  .agx3d__steps li.is-on{display:block;transform:none}
}
@media (prefers-reduced-motion:reduce){.agx3d__steps li{transition:none}}
`;

function build() {
  const sec = document.createElement('section');
  sec.className = 'agx3d';
  sec.id = 'agx3d';
  sec.innerHTML =
    '<div class="agx3d__stage">' +
      '<canvas class="agx3d__canvas" aria-hidden="true"></canvas>' +
      '<div class="agx3d__ui">' +
        '<h2 class="agx3d__title">' + COPY.title + '</h2>' +
        '<ol class="agx3d__steps">' + COPY.steps.map((s, i) => '<li' + (i ? '' : ' class="is-on"') + '><b>' + s[0] + '</b><p>' + s[1] + '</p></li>').join('') + '</ol>' +
        '<div class="agx3d__bar" aria-hidden="true"><i></i></div>' +
      '</div>' +
    '</div>';
  return sec;
}

let current = null;

function ensure() {
  if (!document.getElementById('agx3d-css') && document.head) {
    const st = document.createElement('style');
    st.id = 'agx3d-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (document.getElementById('agx3d')) return;
  const hero = document.querySelector('section');
  if (!hero || !hero.parentNode) return;

  if (current) current.scene.dispose();
  const sec = build();
  hero.parentNode.insertBefore(sec, hero.nextSibling);
  const items = sec.querySelectorAll('.agx3d__steps li');
  const bar = sec.querySelector('.agx3d__bar i');
  const scene = mountObjects(sec, sec.querySelector('canvas'), [kind], {
    pulse: kind === 'clinica',
    onStep: (s) => items.forEach((li, i) => li.classList.toggle('is-on', i === s))
  });
  const onScroll = () => {
    const r = sec.getBoundingClientRect();
    const run = r.height - window.innerHeight;
    bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, -r.top / run)) + ')';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  current = { scene };
}

if (supportsWebGL()) {
  ensure();
  const t = setInterval(ensure, 250);
  setTimeout(() => clearInterval(t), 20000);
  window.addEventListener('load', ensure);
}