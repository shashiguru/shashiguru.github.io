import * as THREE from 'three';

/**
 * Interactive neural-network scene.
 * - Glowing nodes + connecting edges that gently drift
 * - Signal pulses travelling along edges
 * - Mouse parallax, scroll-driven rotation / camera, per-section colour palette
 *
 * Returns { setPalette, destroy } or null when WebGL is unavailable.
 */

const PALETTES = [
  ['#22d3ee', '#8b5cf6'], // hero
  ['#8b5cf6', '#f472b6'], // about
  ['#f472b6', '#fbbf24'], // projects
  ['#34d399', '#22d3ee'], // skills
  ['#60a5fa', '#a78bfa'], // experience
  ['#fbbf24', '#f472b6'], // credentials
  ['#22d3ee', '#f472b6'], // contact
];

const DRIFT_GLSL = /* glsl */ `
  vec3 drift(vec3 p, float t) {
    return p + 0.14 * vec3(
      sin(t * 0.6 + p.y * 1.7),
      cos(t * 0.5 + p.z * 1.3),
      sin(t * 0.7 + p.x * 1.5)
    );
  }
`;

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aMix;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uA;
  uniform vec3 uB;
  varying vec3 vColor;
  varying float vTwinkle;
  ${DRIFT_GLSL}
  void main() {
    vec4 mv = modelViewMatrix * vec4(drift(position, uTime), 1.0);
    gl_Position = projectionMatrix * mv;
    vTwinkle = 0.7 + 0.3 * sin(uTime * 1.6 + aPhase);
    gl_PointSize = aSize * uPixelRatio * vTwinkle * (300.0 / -mv.z);
    vColor = mix(uA, uB, aMix);
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float alpha = pow(core, 2.0) * vTwinkle;
    gl_FragColor = vec4(vColor * (0.7 + core * 0.8), alpha);
  }
`;

const LINE_VERT = /* glsl */ `
  attribute float aMix;
  uniform float uTime;
  uniform vec3 uA;
  uniform vec3 uB;
  varying vec3 vColor;
  varying float vDepth;
  ${DRIFT_GLSL}
  void main() {
    vec4 mv = modelViewMatrix * vec4(drift(position, uTime), 1.0);
    gl_Position = projectionMatrix * mv;
    vColor = mix(uA, uB, aMix);
    vDepth = clamp(1.0 - (-mv.z - 6.0) / 14.0, 0.15, 1.0);
  }
`;

const LINE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    gl_FragColor = vec4(vColor, uOpacity * vDepth);
  }
`;

export function initScene(canvas, { reduced = false, mobile = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.warn('WebGL unavailable, using CSS fallback.', err);
    return null;
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const group = new THREE.Group();
  scene.add(group);

  // Shared uniforms --------------------------------------------------------
  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uA: { value: new THREE.Color(PALETTES[0][0]) },
    uB: { value: new THREE.Color(PALETTES[0][1]) },
  };
  const targetA = new THREE.Color(PALETTES[0][0]);
  const targetB = new THREE.Color(PALETTES[0][1]);

  // Nodes ------------------------------------------------------------------
  const NODE_COUNT = mobile ? 70 : 140;
  const RADIUS = 4.2;
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const r = RADIUS * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    nodes.push(
      new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.85,
        r * Math.cos(phi)
      )
    );
  }

  const mixOf = (v) => THREE.MathUtils.clamp((v.y / RADIUS + 1) / 2, 0, 1);

  const nodePos = new Float32Array(NODE_COUNT * 3);
  const nodeSize = new Float32Array(NODE_COUNT);
  const nodeMix = new Float32Array(NODE_COUNT);
  const nodePhase = new Float32Array(NODE_COUNT);
  nodes.forEach((v, i) => {
    nodePos.set([v.x, v.y, v.z], i * 3);
    nodeSize[i] = 0.35 + Math.random() * 0.75;
    nodeMix[i] = mixOf(v);
    nodePhase[i] = Math.random() * Math.PI * 2;
  });

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(nodeSize, 1));
  nodeGeo.setAttribute('aMix', new THREE.BufferAttribute(nodeMix, 1));
  nodeGeo.setAttribute('aPhase', new THREE.BufferAttribute(nodePhase, 1));

  const nodeMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(nodeGeo, nodeMat));

  // Edges ------------------------------------------------------------------
  const MAX_DIST = mobile ? 2.3 : 1.9;
  const MAX_LINKS = 3;
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < NODE_COUNT; i++) {
    const near = [];
    for (let j = 0; j < NODE_COUNT; j++) {
      if (i === j) continue;
      const d = nodes[i].distanceTo(nodes[j]);
      if (d < MAX_DIST) near.push([j, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (const [j] of near.slice(0, MAX_LINKS)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }

  const linePos = new Float32Array(edges.length * 6);
  const lineMix = new Float32Array(edges.length * 2);
  edges.forEach(([i, j], k) => {
    linePos.set([nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z], k * 6);
    lineMix[k * 2] = nodeMix[i];
    lineMix[k * 2 + 1] = nodeMix[j];
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('aMix', new THREE.BufferAttribute(lineMix, 1));
  const lineMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uOpacity: { value: mobile ? 0.16 : 0.26 } },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  // Signals (pulses travelling along edges) --------------------------------
  const SIGNAL_COUNT = mobile ? 10 : 26;
  const signals = [];
  const sigPos = new Float32Array(SIGNAL_COUNT * 3);
  const sigSize = new Float32Array(SIGNAL_COUNT).fill(1.6);
  const sigMix = new Float32Array(SIGNAL_COUNT).fill(1);
  const sigPhase = new Float32Array(SIGNAL_COUNT);
  for (let s = 0; s < SIGNAL_COUNT; s++) {
    signals.push({
      edge: Math.floor(Math.random() * edges.length),
      t: Math.random(),
      speed: 0.25 + Math.random() * 0.45,
    });
    sigPhase[s] = Math.random() * 6.28;
  }
  const sigGeo = new THREE.BufferGeometry();
  sigGeo.setAttribute('position', new THREE.BufferAttribute(sigPos, 3));
  sigGeo.setAttribute('aSize', new THREE.BufferAttribute(sigSize, 1));
  sigGeo.setAttribute('aMix', new THREE.BufferAttribute(sigMix, 1));
  sigGeo.setAttribute('aPhase', new THREE.BufferAttribute(sigPhase, 1));
  group.add(new THREE.Points(sigGeo, nodeMat));

  const tmp = new THREE.Vector3();
  function updateSignals(dt) {
    for (let s = 0; s < SIGNAL_COUNT; s++) {
      const sig = signals[s];
      sig.t += dt * sig.speed;
      if (sig.t >= 1) {
        // hop to a connected edge for a more organic flow
        const [, end] = edges[sig.edge];
        const next = [];
        for (let k = 0; k < edges.length; k++) {
          if (edges[k][0] === end || edges[k][1] === end) next.push(k);
        }
        sig.edge = next.length ? next[Math.floor(Math.random() * next.length)] : Math.floor(Math.random() * edges.length);
        sig.t = 0;
        sig.dir = edges[sig.edge][0] === end ? 0 : 1;
      }
      const [a, b] = edges[sig.edge];
      const from = sig.dir === 1 ? nodes[b] : nodes[a];
      const to = sig.dir === 1 ? nodes[a] : nodes[b];
      tmp.lerpVectors(from, to, sig.t);
      sigPos[s * 3] = tmp.x;
      sigPos[s * 3 + 1] = tmp.y;
      sigPos[s * 3 + 2] = tmp.z;
    }
    sigGeo.attributes.position.needsUpdate = true;
  }

  // Orbit rings ------------------------------------------------------------
  const ringMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTES[0][0]),
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rings = [];
  [5.3, 6.2].forEach((radius, idx) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
    ring.rotation.x = idx === 0 ? 1.15 : -0.7;
    ring.rotation.z = idx === 0 ? 0.3 : 0.9;
    group.add(ring);
    rings.push(ring);
  });

  // Distant star dust ------------------------------------------------------
  const STAR_COUNT = mobile ? 250 : 700;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 18 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xaab4ff,
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  scene.add(stars);

  // Interaction state ------------------------------------------------------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!mobile) window.addEventListener('pointermove', onPointer, { passive: true });

  let scrollP = 0;
  const readScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    isNarrow = w < 900;
    if (reduced) renderFrame(0);
  }
  let isNarrow = false;
  window.addEventListener('resize', resize);

  // Render loop ------------------------------------------------------------
  const clock = new THREE.Clock();
  let raf = 0;
  let elapsed = 0;

  function renderFrame(dt) {
    elapsed += dt;
    uniforms.uTime.value = elapsed;

    // palette easing
    const k = 1 - Math.pow(0.001, dt || 1);
    uniforms.uA.value.lerp(targetA, k);
    uniforms.uB.value.lerp(targetB, k);
    ringMat.color.copy(uniforms.uA.value);

    // pointer easing
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    // scroll-driven transforms
    const side = isNarrow ? 0 : 3.3 * Math.cos(scrollP * Math.PI * 3);
    const lift = isNarrow ? 1.6 * Math.cos(scrollP * Math.PI * 3) : -0.1;
    group.position.x += (side - group.position.x) * 0.05;
    group.position.y += (lift - group.position.y) * 0.05;
    group.rotation.y = elapsed * 0.06 + scrollP * Math.PI * 2 + mouse.x * 0.35;
    group.rotation.x = mouse.y * 0.18 + Math.sin(scrollP * Math.PI * 2) * 0.2;
    rings.forEach((r, i) => (r.rotation.y = elapsed * (i ? -0.08 : 0.1)));

    camera.position.z = 10 + Math.sin(scrollP * Math.PI) * 1.8;
    stars.rotation.y = elapsed * 0.008 + scrollP * 0.6;
    stars.rotation.x = scrollP * 0.3;

    if (dt) updateSignals(dt);
    renderer.render(scene, camera);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    renderFrame(Math.min(clock.getDelta(), 0.05));
  }

  resize();
  updateSignals(0.3);
  if (reduced) {
    // Single static frame; palette changes re-render once.
    uniforms.uA.value.copy(targetA);
    uniforms.uB.value.copy(targetB);
    renderFrame(0);
  } else {
    loop();
  }

  return {
    setPalette(index) {
      const p = PALETTES[index] || PALETTES[0];
      targetA.set(p[0]);
      targetB.set(p[1]);
      if (reduced) {
        uniforms.uA.value.copy(targetA);
        uniforms.uB.value.copy(targetB);
        renderFrame(0);
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
    },
  };
}
