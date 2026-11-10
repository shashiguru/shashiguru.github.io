import { initAnimations } from './animations.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile =
  window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

document.body.classList.add('is-loading');
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// --- Scene (dynamic import so a CDN failure never breaks the page) ----------
let scene = null;
const sceneReady = import('./scene.js')
  .then((mod) => {
    scene = mod.initScene($('#bg-canvas'), { reduced, mobile });
  })
  .catch((err) => console.warn('3D scene disabled:', err));

// --- Animations --------------------------------------------------------------
const anim = initAnimations({ reduced });

// --- Navigation ---------------------------------------------------------------
const nav = $('#nav');
const toggle = $('#navToggle');
const links = $('#navLinks');
const progress = $('#progress');

toggle.addEventListener('click', () => {
  const open = links.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});
$$('a', links).forEach((a) =>
  a.addEventListener('click', () => {
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  })
);

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Active link + 3D palette follow the section in view
const sections = $$('main section[id]');
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      $$('[data-link]').forEach((a) => a.classList.toggle('is-active', a.dataset.link === id));
      if (scene) scene.setPalette(Number(entry.target.dataset.palette || 0));
    });
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
sections.forEach((s) => io.observe(s));

// --- Cursor halo ---------------------------------------------------------------
const cursor = $('#cursor');
if (cursor && !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let cx = 0, cy = 0, tx = 0, ty = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      cursor.classList.add('is-visible');
    },
    { passive: true }
  );
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));
  const follow = () => {
    cx += (tx - cx) * 0.18;
    cy += (ty - cy) * 0.18;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(follow);
  };
  follow();
  document.addEventListener('pointerover', (e) => {
    cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .tilt'));
  });
}

// --- Loader --------------------------------------------------------------------
const loader = $('#loader');
const minDelay = new Promise((r) => setTimeout(r, reduced ? 100 : 700));
const fontsReady = Promise.race([
  document.fonts ? document.fonts.ready : Promise.resolve(),
  new Promise((r) => setTimeout(r, 2500)),
]);

const sceneOrTimeout = Promise.race([sceneReady, new Promise((r) => setTimeout(r, 5000))]);

Promise.all([minDelay, fontsReady, sceneOrTimeout]).then(() => {
  loader.style.transition = 'opacity 0.6s ease, visibility 0.6s';
  loader.style.opacity = '0';
  loader.style.visibility = 'hidden';
  document.body.classList.remove('is-loading');
  anim.intro();
  if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  setTimeout(() => loader.remove(), 700);
});
