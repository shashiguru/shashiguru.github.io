/**
 * GSAP / ScrollTrigger animations.
 * GSAP is loaded as a classic global script in index.html. If it fails to load
 * (offline, blocked), the page simply stays fully visible and static.
 */

const ROLES = [
  'agentic AI systems',
  'MCP tool platforms',
  'RAG & vector search pipelines',
  'multi-agent orchestrators',
  'streaming full-stack AI products',
  'cloud-native Azure services',
];

const GRADIENT = [
  [34, 211, 238], // cyan
  [139, 92, 246], // violet
  [244, 114, 182], // pink
];

// Sample the 3-stop brand gradient at t in [0, 1] as an rgb() string.
function gradientAt(t) {
  const seg = t * (GRADIENT.length - 1);
  const i = Math.min(Math.floor(seg), GRADIENT.length - 2);
  const f = seg - i;
  const rgb = GRADIENT[i].map((c, k) => Math.round(c + (GRADIENT[i + 1][k] - c) * f));
  return `rgb(${rgb.join(',')})`;
}

// Split into per-character spans. Per-character colouring is used for the
// gradient line because background-clip:text does not survive transformed children.
function splitChars(el) {
  const text = el.textContent;
  const useGradient = el.hasAttribute('data-gradient');
  el.textContent = '';
  el.setAttribute('aria-hidden', 'true');
  const chars = [];
  const letters = Array.from(text);
  letters.forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    if (useGradient) span.style.color = gradientAt(letters.length > 1 ? i / (letters.length - 1) : 0);
    el.appendChild(span);
    chars.push(span);
  });
  return chars;
}

function startTyper(el, reduced) {
  if (!el) return;
  if (reduced) {
    el.textContent = ROLES[0];
    return;
  }
  let role = 0;
  let idx = 0;
  let deleting = false;
  const tick = () => {
    const word = ROLES[role];
    idx += deleting ? -1 : 1;
    el.textContent = word.slice(0, Math.max(idx, 0));
    let delay = deleting ? 28 : 55;
    if (!deleting && idx >= word.length) {
      deleting = true;
      delay = 1700;
    } else if (deleting && idx <= 0) {
      deleting = false;
      role = (role + 1) % ROLES.length;
      delay = 350;
    }
    setTimeout(tick, delay);
  };
  el.textContent = '';
  setTimeout(tick, 600);
}

export function initAnimations({ reduced = false } = {}) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const typedEl = document.getElementById('typed');

  // Without GSAP, or with reduced motion, keep everything visible and static.
  if (!gsap || !ScrollTrigger || reduced) {
    startTyper(typedEl, true);
    document.querySelectorAll('[data-count]').forEach((el) => {
      el.textContent = `${el.dataset.prefix || ''}${el.dataset.count}${el.dataset.suffix || ''}`;
    });
    return { intro() {} };
  }

  gsap.registerPlugin(ScrollTrigger);

  // Hero title characters ---------------------------------------------------
  const heroChars = [];
  document.querySelectorAll('[data-split]').forEach((el) => heroChars.push(...splitChars(el)));
  gsap.set(heroChars, { yPercent: 110, opacity: 0, rotateX: -60, transformOrigin: '50% 100%' });
  gsap.set('[data-hero="fade"]', { opacity: 0, y: 24 });

  // Scroll reveals ----------------------------------------------------------
  const reveals = gsap.utils.toArray('[data-reveal]');
  gsap.set(reveals, { opacity: 0, y: 44 });
  ScrollTrigger.batch(reveals, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.12,
        overwrite: true,
      }),
  });

  // Counters ----------------------------------------------------------------
  gsap.utils.toArray('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const state = { v: 0 };
    const paint = () => (el.textContent = `${prefix}${Math.round(state.v)}${suffix}`);
    paint();
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => gsap.to(state, { v: target, duration: 1.8, ease: 'power2.out', onUpdate: paint }),
    });
  });

  // Timeline progress -------------------------------------------------------
  gsap.to('#timelineFill', {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: { trigger: '#timeline', start: 'top 60%', end: 'bottom 70%', scrub: 0.4 },
  });

  // Hero content drifts away on scroll -------------------------------------
  gsap.to('.hero__inner', {
    y: -90,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 20%', scrub: true },
  });

  // Fine-pointer interactions ----------------------------------------------
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // 3D tilt + spotlight on cards
    document.querySelectorAll('.tilt').forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        ry((px - 0.5) * 8);
        rx((0.5 - py) * 8);
      });
      card.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    });

    // Magnetic buttons
    document.querySelectorAll('.magnetic').forEach((btn) => {
      const xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      btn.addEventListener('pointerleave', () => {
        xTo(0);
        yTo(0);
      });
    });
  }

  // Intro (called once the loader has gone) --------------------------------
  function intro() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.to(heroChars, { yPercent: 0, opacity: 1, rotateX: 0, duration: 1.1, stagger: 0.035 }, 0.05)
      .to('[data-hero="fade"]', { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0.45);
    startTyper(typedEl, false);
  }

  return { intro };
}
