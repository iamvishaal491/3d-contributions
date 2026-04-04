import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

const CUBE_SIZE = 1;
const GAP = 0.2;
const BASE_HEIGHT = 0.15;
const MAX_HEIGHT_SCALE = 4;

const THEMES = {
  isometric: {
    bg: 0x050505,
    fog: 100,
    fogFar: 400,
    useBloom: false,
    colorLow: new THREE.Color('#9be9a8'),
    colorHigh: new THREE.Color('#216e39'),
    colorEmpty: 0xffffff,
  },
  skyline: {
    bg: 0x010104,
    fog: 30,
    fogFar: 210,
    gridColor: 0x0c0c1e,
    useBloom: true,
    colorEmpty: 0x0a0a1a,
  }
};

// ─────────────────────────────────────────────────────────────
//  SHARED VERTEX SHADER  (all skins)
// ─────────────────────────────────────────────────────────────
const vertexShader = `
  varying vec2 vUv;
  uniform float uHeight;
  void main() {
    vUv = uv;
    vUv.y *= uHeight;  // tile vertically with tower height
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Shared rand helper
const randFn = `
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }
`;

// Shared palette helper: picks 2 colors from {pink, violet, cyan, orange} per building.
// uSeed is a unique float per building. Returns colorA or colorB based on cellRand.
const paletteFn = `
  vec3 getWinColor(float cellRand, float seed) {
    vec3 neonPink   = vec3(1.0,  0.04, 0.56);
    vec3 neonViolet = vec3(0.65, 0.0,  1.0);
    vec3 neonCyan   = vec3(0.0,  0.9,  1.0);
    vec3 neonOrange = vec3(1.0,  0.45, 0.04); // warm amber/orange

    // 5 pairs — orange features in 2 of them (~40% of buildings)
    float pairIdx = floor(rand(vec2(seed, seed * 0.73 + 1.3)) * 5.0);
    vec3 colorA = pairIdx < 1.0 ? neonPink      // 0: pink  + cyan
                : pairIdx < 2.0 ? neonPink      // 1: pink  + violet
                : pairIdx < 3.0 ? neonCyan      // 2: cyan  + violet
                : pairIdx < 4.0 ? neonOrange    // 3: orange + pink
                : neonOrange;                   // 4: orange + cyan
    vec3 colorB = pairIdx < 1.0 ? neonCyan
                : pairIdx < 2.0 ? neonViolet
                : pairIdx < 3.0 ? neonViolet
                : pairIdx < 4.0 ? neonPink
                : neonCyan;

    // ~42% dark (more unlit rooms than before), split rest 50/50
    if (cellRand < 0.42) return vec3(0.0);
    return cellRand < 0.71 ? colorA : colorB;
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN A – Dense Grid (neon pair, 30% dark cells)
// ─────────────────────────────────────────────────────────────
const skinAFrag = `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  ${randFn}
  ${paletteFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    float window = step(0.15, gv.x) * step(0.15, gv.y)
                 * step(gv.x, 0.85) * step(gv.y, 0.85);

    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window;

    float cellRand = rand(cell + vec2(uSeed));
    vec3 winColor  = getWinColor(cellRand, uSeed);

    vec3 base = vec3(0.01, 0.005, 0.015);
    vec3 col  = base
              + winColor * window    * 0.75
              + winColor * innerGlow * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN B – Sparse Grid (~45% lit, neon pair, dark cells)
// ─────────────────────────────────────────────────────────────
const skinBFrag = `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  ${randFn}
  ${paletteFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    // Extra sparseness: only ~55% of cells are candidates
    float sparse = step(0.45, rand(cell * 1.3 + vec2(uSeed * 0.5)));
    float window = step(0.15, gv.x) * step(0.15, gv.y)
                 * step(gv.x, 0.85) * step(gv.y, 0.85);
    window *= sparse;

    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window;

    float cellRand = rand(cell + vec2(uSeed + 2.7));
    vec3 winColor  = getWinColor(cellRand, uSeed);

    vec3 base = vec3(0.01, 0.005, 0.015);
    vec3 col  = base
              + winColor * window    * 0.75
              + winColor * innerGlow * 0.38;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN C – Pulsing Dense Grid (per-cell independent phase)
// ─────────────────────────────────────────────────────────────
const skinCFrag = `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  ${randFn}
  ${paletteFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    float window = step(0.15, gv.x) * step(0.15, gv.y)
                 * step(gv.x, 0.85) * step(gv.y, 0.85);

    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window;

    float cellRand = rand(cell + vec2(uSeed + 5.1));
    vec3 winColor  = getWinColor(cellRand, uSeed);

    float phase = rand(cell + vec2(uSeed + 1.1)) * 6.28318;
    float pulse = 0.72 + 0.28 * sin(uTime * 1.8 + phase);

    vec3 base = vec3(0.01, 0.005, 0.015);
    vec3 col  = base
              + winColor * window    * pulse * 0.78
              + winColor * innerGlow * pulse * 0.38;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SKIN_FRAGS = [skinAFrag, skinBFrag, skinCFrag];

function makeSkinMaterial(skinIndex: number, towerHeight: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:   { value: 0 },
      uHeight: { value: Math.max(1, towerHeight) },
      uSeed:   { value: seed },
    },
    vertexShader,
    fragmentShader: SKIN_FRAGS[skinIndex],
  });
}

// Height-based selection:
function selectSkin(ratio: number): number {
  if (ratio < 0.35) return Math.random() < 0.55 ? 1 : 0;  // B or A
  if (ratio < 0.72) return 0;                               // A
  return 2;                                                  // C (pulsing)
}

export interface ThreeVisualizerRef {
  buildGrid: (data: any) => void;
  setTheme: (mode: string) => Promise<void>;
}
interface ThreeVisualizerProps { theme: string; }

export const ThreeVisualizer = forwardRef<ThreeVisualizerRef, ThreeVisualizerProps>(({ theme }, ref) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const tooltipRef    = useRef<HTMLDivElement>(null);
  const sceneRef      = useRef<THREE.Scene>(new THREE.Scene());
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const renderPassRef = useRef<RenderPass | null>(null);
  const bloomPassRef  = useRef<UnrealBloomPass | null>(null);
  const controlsRef   = useRef<OrbitControls | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const perspCamRef   = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCamRef   = useRef<THREE.OrthographicCamera | null>(null);
  const cubesRef      = useRef<THREE.Mesh[]>([]);
  const extraRef      = useRef<THREE.Object3D[]>([]);
  const shipsRef      = useRef<any[]>([]);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const clockRef      = useRef(new THREE.Clock());
  const themeRef      = useRef<string>(theme);
  const mouseRef      = useRef(new THREE.Vector2());
  const raycasterRef  = useRef(new THREE.Raycaster());
  const hoveredRef    = useRef<THREE.Mesh | null>(null);

  // ── helpers ───────────────────────────────────────────────
  const clearGrid = () => {
    cubesRef.current.forEach(m => { m.geometry.dispose(); (m.material as any).dispose?.(); sceneRef.current.remove(m); });
    cubesRef.current = [];
    extraRef.current.forEach(o => { (o as any).geometry?.dispose(); (o as any).material?.dispose(); sceneRef.current.remove(o); });
    extraRef.current = [];
    shipsRef.current.forEach(s => {
      sceneRef.current.remove(s.group);
      sceneRef.current.remove(s.trail);
      s.trail.geometry.dispose();
      s.trail.material.dispose();
    });
    shipsRef.current = [];
  };

  // ── 4 ship builder functions ──────────────────────────────
  const buildInterceptor = () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x00ccee, roughness: 0.5, metalness: 0.8 });
    // Long body
    g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.42), mat)));
    // Nose tip
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 4), accent);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 1.73;
    g.add(nose);
    // Wings
    const makeWing = (zSign: number) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.65), mat);
      w.position.set(-0.2, -0.03, zSign * 0.52); w.rotation.z = zSign * 0.15;
      return w;
    };
    g.add(makeWing(1), makeWing(-1));
    // Tail fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.04), mat);
    fin.position.set(-1.2, 0.1, 0);
    g.add(fin);
    // Engine glow strip (very subtle)
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x002244, emissive: 0x004488, emissiveIntensity: 0.4 }));
    eng.position.set(-1.4, 0, 0);
    g.add(eng);
    return g;
  };

  const buildHoverDrone = () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.7, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x220033, emissive: 0x550088, emissiveIntensity: 0.3 });
    // Flat hex base
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 6), mat));
    // Central dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), accent);
    dome.position.y = 0.1;
    g.add(dome);
    // 4 radial arms
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.09), mat);
      const a = (i / 4) * Math.PI * 2;
      arm.position.set(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45);
      arm.rotation.y = a;
      g.add(arm);
    }
    // Rim ring detail (8-sided cylinder)
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.03, 8, 1, true), mat));
    return g;
  };

  const buildTriWingScout = () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0d0d1a, roughness: 0.6, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x001a00, emissive: 0x003300, emissiveIntensity: 0.35 });
    // Central node
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.3), accent));
    // 3 wings at 120°
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.15), mat);
      wing.rotation.y = a;
      wing.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
      // Wing tip
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), mat);
      tip.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2);
      g.add(wing, tip);
    }
    return g;
  };

  const buildCoreFrameShip = () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x151520, roughness: 0.75, metalness: 0.5 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x110011, emissive: 0x440022, emissiveIntensity: 0.3 }));
    g.add(core);
    // 4 corner strut posts
    [[0.58,0,0.58],[-0.58,0,0.58],[0.58,0,-0.58],[-0.58,0,-0.58]].forEach(([ox,,oz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), mat);
      post.position.set(ox, 0, oz);
      g.add(post);
    });
    // Horizontal crossbars at top / bottom
    const barH = new THREE.BoxGeometry(1.22, 0.04, 0.04);
    [0.36, -0.36].forEach(y => {
      [0.58, -0.58].forEach(z => {
        const b = new THREE.Mesh(barH, mat);
        b.position.set(0, y, z);
        g.add(b);
      });
    });
    return g;
  };

  // ── Trail factory with per-vertex alpha fade ───────────────
  const TRAIL_LEN = 40;
  const makeTrail = (color: number): THREE.Line => {
    const positions = new Float32Array(TRAIL_LEN * 3);
    const alphas    = new Float32Array(TRAIL_LEN);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(uColor, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Line(geo, mat);
  };

  // ── random path endpoints through/across city ────────────
  const randomPath = (spread: number): [THREE.Vector3, THREE.Vector3] => {
    const axis = Math.random() < 0.6 ? 'x' : 'z'; // mostly X (along weeks)
    const y1 = 8 + Math.random() * 14;
    const y2 = 8 + Math.random() * 14;
    if (axis === 'x') {
      const sign = Math.random() < 0.5 ? 1 : -1;
      const z = (Math.random() - 0.5) * spread * 0.4;
      return [
        new THREE.Vector3(-spread * sign, y1, z),
        new THREE.Vector3( spread * sign, y2, z + (Math.random() - 0.5) * spread * 0.3),
      ];
    } else {
      const x = (Math.random() - 0.5) * spread;
      return [
        new THREE.Vector3(x + (Math.random()-0.5)*8, y1, -spread * 0.25),
        new THREE.Vector3(x + (Math.random()-0.5)*8, y2,  spread * 0.25),
      ];
    }
  };

  // ── Create 4 spaceships ───────────────────────────────────
  const createSpaceships = () => {
    if (themeRef.current !== 'skyline') return;
    const builders = [buildInterceptor, buildHoverDrone, buildTriWingScout, buildCoreFrameShip];
    const trailColors = [0x00bbdd, 0x8800cc, 0x44dd88, 0xdd0055];
    const lightColors = [0x00ddff, 0xaa00ff, 0x00ff88, 0xff0066];
    const spread = 38;
    for (let i = 0; i < 4; i++) {
      const group = builders[i]();
      group.scale.setScalar(1.5);

      // ── Ship light: small point light attached to the ship
      const light = new THREE.PointLight(lightColors[i], 6, 20);
      light.position.set(0, 0.5, 0);
      group.add(light);

      const trail = makeTrail(trailColors[i]);
      const [startPos, endPos] = randomPath(spread);

      // Orbit params (used when mode = 'orbit')
      const orbitRadius = 18 + i * 6 + Math.random() * 8;
      const orbitAngle  = Math.random() * Math.PI * 2;
      const orbitHeight = 10 + Math.random() * 12;

      sceneRef.current.add(group);
      sceneRef.current.add(trail);
      shipsRef.current.push({
        group,
        trail,
        history: [] as THREE.Vector3[],
        // path mode state
        startPos,
        endPos,
        progress: i * 0.2,
        speed: 0.11 + Math.random() * 0.07,   // ~3x faster
        sineAmp: 2 + Math.random() * 2.5,
        sineFreq: 0.5 + Math.random() * 0.6,
        spread,
        // orbit mode state
        orbitAngle,
        orbitRadius,
        orbitRadiusZ: orbitRadius * (0.3 + Math.random() * 0.5), // ellipse Z radius
        orbitHeight,
        orbitSpeed: 0.55 + Math.random() * 0.65,  // radians/second
        orbitOscAmp: 2.5 + Math.random() * 2,
        orbitOscFreq: 0.4 + Math.random() * 0.5,
        // hybrid mode control
        mode: i % 2 === 0 ? 'orbit' : 'path' as 'orbit' | 'path',
        modeSwitchTimer: 4 + Math.random() * 6, // seconds until switch
        modeTimer: 0,
      });
    }
  };

  const applyTheme = (mode: string) => {
    const t = THEMES[mode as keyof typeof THEMES] || THEMES.isometric;
    themeRef.current = mode;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(t.bg);
    scene.fog = new THREE.Fog(t.bg, t.fog, t.fogFar);
    if (gridHelperRef.current) { scene.remove(gridHelperRef.current); gridHelperRef.current = null; }

    if (mode !== 'isometric') {
      createSpaceships();
    }

    if (mode === 'isometric') {
      cameraRef.current = orthoCamRef.current;
      orthoCamRef.current?.position.set(50, 50, 50);
      if (controlsRef.current) { controlsRef.current.maxPolarAngle = Math.PI; controlsRef.current.minPolarAngle = 0; }
    } else {
      cameraRef.current = perspCamRef.current;
      perspCamRef.current?.position.set(-80, 60, 150);
      const gColor = (t as any).gridColor ?? 0x111122;
      gridHelperRef.current = new THREE.GridHelper(500, 100, gColor, gColor);
      scene.add(gridHelperRef.current);
      if (controlsRef.current) { controlsRef.current.maxPolarAngle = Math.PI / 2 - 0.08; controlsRef.current.minPolarAngle = 0.1; }
    }
    if (cameraRef.current) {
      if (renderPassRef.current) renderPassRef.current.camera = cameraRef.current;
      if (controlsRef.current) { controlsRef.current.object = cameraRef.current; controlsRef.current.target.set(0,0,0); controlsRef.current.update(); }
    }
    if (bloomPassRef.current) bloomPassRef.current.enabled = t.useBloom;
  };

  // ── public API ────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    buildGrid(data: any) {
      if (!data?.weeks) return;
      clearGrid();
      if (themeRef.current === 'skyline') createSpaceships();

      const iso = themeRef.current === 'isometric';
      const currentTheme = THEMES[themeRef.current as keyof typeof THEMES] || THEMES.isometric;
      const weeks = data.weeks;
      const numWeeks = weeks.length;
      const numDays = 7;
      let maxCount = 0;
      weeks.forEach((w: any) => w.contributionDays?.forEach((d: any) => { if (d.contributionCount > maxCount) maxCount = d.contributionCount; }));

      const px = (w: number) => (w - numWeeks / 2) * (CUBE_SIZE + GAP);
      const pz = (d: number) => (d - numDays / 2) * (CUBE_SIZE + GAP);

      const baseGeo = new THREE.BoxGeometry(CUBE_SIZE, 1, CUBE_SIZE);
      baseGeo.translate(0, 0.5, 0);

      // iso shared materials
      const isoColorLow  = (currentTheme as any).colorLow  as THREE.Color | undefined;
      const isoColorHigh = (currentTheme as any).colorHigh as THREE.Color | undefined;

      weeks.forEach((week: any, wi: number) => {
        week.contributionDays?.forEach((day: any, di: number) => {
          const ratio = day.contributionCount > 0 ? Math.log(day.contributionCount + 1) / Math.log(maxCount + 1) : 0;
          const rawH  = day.contributionCount > 0 ? BASE_HEIGHT + ratio * MAX_HEIGHT_SCALE * 8 : BASE_HEIGHT;
          const isZero = day.contributionCount === 0;

          let mat: THREE.Material;
          if (iso) {
            const col = isZero ? new THREE.Color((currentTheme as any).colorEmpty) : isoColorLow!.clone().lerp(isoColorHigh!, ratio);
            mat = new THREE.MeshStandardMaterial({ color: col, emissive: isZero ? 0x000000 : col, emissiveIntensity: 0 });
          } else if (!iso && !isZero) {
            const skinIdx = selectSkin(ratio);
            const seed = wi * 7.3 + di * 13.17;
            mat = makeSkinMaterial(skinIdx, rawH, seed);
          } else {
            mat = new THREE.MeshStandardMaterial({ color: (currentTheme as any).colorEmpty });
          }

          const cube = new THREE.Mesh(baseGeo, mat);
          cube.scale.set(iso ? 1 : 0.88, 0.01, iso ? 1 : 0.88);
          cube.position.set(px(wi), 0, pz(di));
          cube.userData = { date: day.date, count: day.contributionCount, targetH: rawH };
          sceneRef.current.add(cube);
          cubesRef.current.push(cube);

          // Isometric edge lines
          if (iso) {
            const edgeGeo = new THREE.EdgesGeometry(baseGeo);
            const line = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 }));
            line.position.copy(cube.position);
            line.scale.copy(cube.scale);
            sceneRef.current.add(line);
            extraRef.current.push(line);
          }

          // Skyline antennas on tall towers
          if (!iso && ratio > 0.7) {
            const antMat = new THREE.MeshBasicMaterial({ color: ratio > 0.9 ? 0xff00ff : 0x00ffff });
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.5), antMat);
            ant.position.set(px(wi), rawH, pz(di));
            sceneRef.current.add(ant);
            extraRef.current.push(ant);
          }
        });
      });

      if (cameraRef.current) {
        controlsRef.current?.target.set(0, 0, 0);
        if (iso) {
          const cam = cameraRef.current as THREE.OrthographicCamera;
          cam.zoom = 0.1; cam.updateProjectionMatrix();
          gsap.to(cam, { zoom: 4.5, duration: 1.5, ease: 'power3.out', onUpdate: () => cam.updateProjectionMatrix() });
        } else {
          const cam = cameraRef.current;
          const tp = new THREE.Vector3(-80, 60, 150);
          cam.position.set(tp.x, tp.y + 100, tp.z + 100);
          gsap.to(cam.position, { x: tp.x, y: tp.y, z: tp.z, duration: 2, ease: 'expo.out' });
        }
      }
    },
    async setTheme(mode: string) { applyTheme(mode); }
  }));

  // ── scene init ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = sceneRef.current;
    const aspect = window.innerWidth / window.innerHeight;
    const perspCam  = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
    const orthoCam  = new THREE.OrthographicCamera(-35 * aspect, 35 * aspect, 35, -35, -100, 1000);
    perspCamRef.current  = perspCam;
    orthoCamRef.current  = orthoCam;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(orthoCam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const composer = new EffectComposer(renderer);
    const rPass = new RenderPass(scene, orthoCam);
    composer.addPass(rPass);
    renderPassRef.current = rPass;
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.35, 0.88);
    composer.addPass(bloom);
    bloomPassRef.current = bloom;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(20, 100, 30);
    scene.add(dir);

    applyTheme(theme);

    let id: number;
    const animate = () => {
      id = requestAnimationFrame(animate);
      const dt = clockRef.current.getDelta();
      const st = clockRef.current.getElapsedTime();
      controls.update();

      // Animate cubes (grow) + shader time
      cubesRef.current.forEach(cube => {
        const th = cube.userData.targetH || BASE_HEIGHT;
        if (Math.abs(cube.scale.y - th) > 0.01) cube.scale.y += (th - cube.scale.y) * 6 * dt;
        const m = cube.material as THREE.ShaderMaterial;
        if (m.uniforms?.uTime) m.uniforms.uTime.value = st;
      });

      // ── Spaceships: hybrid orbit + path-through-city flight ──
      shipsRef.current.forEach(ship => {
        ship.modeTimer += dt;

        let pos: THREE.Vector3;
        let lookTarget: THREE.Vector3;

        if (ship.mode === 'orbit') {
          // ─ Elliptic orbit weaving between buildings ─
          ship.orbitAngle += ship.orbitSpeed * dt;
          const ox = Math.cos(ship.orbitAngle) * ship.orbitRadius;
          const oz = Math.sin(ship.orbitAngle) * ship.orbitRadiusZ;
          const oy = ship.orbitHeight + Math.sin(st * ship.orbitOscFreq) * ship.orbitOscAmp;
          pos = new THREE.Vector3(ox, oy, oz);

          const nextAngle = ship.orbitAngle + 0.1;
          lookTarget = new THREE.Vector3(
            Math.cos(nextAngle) * ship.orbitRadius,
            oy,
            Math.sin(nextAngle) * ship.orbitRadiusZ,
          );

          // Switch to path mode after modeSwitchTimer
          if (ship.modeTimer >= ship.modeSwitchTimer) {
            ship.mode = 'path';
            ship.modeTimer = 0;
            ship.modeSwitchTimer = 5 + Math.random() * 8;
            const [s, e] = randomPath(ship.spread);
            ship.startPos = s; ship.endPos = e; ship.progress = 0;
          }
        } else {
          // ─ Path-based pass-through-city ─
          ship.progress += ship.speed * dt;

          if (ship.progress >= 1.0) {
            // Done with path — switch to orbit mode
            ship.mode = 'orbit';
            ship.modeTimer = 0;
            ship.modeSwitchTimer = 6 + Math.random() * 10;
            ship.orbitAngle = Math.random() * Math.PI * 2;
            ship.history = [];
            ship.progress = 0;
          }

          const t = ship.progress;
          pos = new THREE.Vector3().lerpVectors(ship.startPos, ship.endPos, t);
          const dir = new THREE.Vector3().subVectors(ship.endPos, ship.startPos).normalize();
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);
          const lateralOff = Math.sin(t * ship.sineFreq * Math.PI * 2) * ship.sineAmp;
          pos.addScaledVector(perp, lateralOff);
          pos.y += Math.sin(t * Math.PI * 3) * 1.8;

          const ahead = new THREE.Vector3().lerpVectors(ship.startPos, ship.endPos, Math.min(t + 0.06, 1.0));
          const aheadOff = lateralOff + Math.sin((t + 0.06) * ship.sineFreq * Math.PI * 2) * ship.sineAmp;
          ahead.addScaledVector(perp, aheadOff);
          lookTarget = ahead;
        }

        ship.group.position.copy(pos);
        if (!lookTarget.equals(pos)) ship.group.lookAt(lookTarget);

        // ─ Trail update ─
        ship.history.push(pos.clone());
        if (ship.history.length > TRAIL_LEN) ship.history.shift();

        const posAttr   = ship.trail.geometry.attributes.position as THREE.BufferAttribute;
        const alphaAttr = ship.trail.geometry.attributes.aAlpha as THREE.BufferAttribute;
        const n = ship.history.length;
        for (let k = 0; k < TRAIL_LEN; k++) {
          if (k < n) {
            const p = ship.history[k];
            posAttr.setXYZ(k, p.x, p.y, p.z);
            alphaAttr.setX(k, (k / n) * 0.65);
          } else {
            posAttr.setXYZ(k, 0, -9999, 0);
            alphaAttr.setX(k, 0);
          }
        }
        posAttr.needsUpdate   = true;
        alphaAttr.needsUpdate = true;
      });

      // ── Raycaster: hover tooltip ─────────────────────────
      if (cubesRef.current.length > 0) {
        const cam = cameraRef.current || orthoCam;
        raycasterRef.current.setFromCamera(mouseRef.current, cam);
        const hits = raycasterRef.current.intersectObjects(cubesRef.current, false);
        const tooltip = tooltipRef.current;
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          if (hit !== hoveredRef.current) {
            hoveredRef.current = hit;
          }
          if (tooltip && hit.userData.date !== undefined) {
            const date = hit.userData.date || 'Unknown';
            const count = hit.userData.count ?? 0;
            const color = count === 0 ? '#666' : count < 3 ? '#9be9a8' : count < 8 ? '#40c463' : count < 15 ? '#30a14e' : '#216e39';
            tooltip.innerHTML = `
              <div style="font-size:10px;color:#888;margin-bottom:4px;letter-spacing:1px">DATE</div>
              <div style="font-size:13px;color:#fff;font-weight:600;margin-bottom:8px">${date}</div>
              <div style="font-size:10px;color:#888;margin-bottom:4px;letter-spacing:1px">COMMITS</div>
              <div style="font-size:18px;font-weight:700;color:${color}">${count}</div>
            `;
            tooltip.style.opacity = '1';
          }
        } else {
          hoveredRef.current = null;
          if (tooltip) tooltip.style.opacity = '0';
        }
      }

      const cam = cameraRef.current || orthoCam;
      if (bloom.enabled) composer.render();
      else renderer.render(scene, cam);
    };

    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight, a = w / h;
      perspCam.aspect = a; perspCam.updateProjectionMatrix();
      orthoCam.left = -35 * a; orthoCam.right = 35 * a; orthoCam.updateProjectionMatrix();
      renderer.setSize(w, h); composer.setSize(w, h);
    };
    const onMove = (e: MouseEvent) => {
      mouseRef.current.set(
        (e.clientX / window.innerWidth)  * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${e.clientX + 18}px`;
        tooltipRef.current.style.top  = `${e.clientY + 18}px`;
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove);
    animate();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(id);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div id="canvas-container" ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'auto' }} />
      <div ref={tooltipRef} className="fixed pointer-events-none bg-black/80 backdrop-blur-md border border-white/20 p-3 z-[100] opacity-0 transition-opacity duration-200 min-w-[120px] rounded-lg shadow-2xl" style={{ fontFamily: 'var(--font-mono)' }} />
    </>
  );
});
