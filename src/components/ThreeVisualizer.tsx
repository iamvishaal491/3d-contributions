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

// Shared rand helper injected into all fragment shaders
const randFn = `
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN A – Dense Grid, Multi-Color (pink/blue/warm-white)
//  Each window cell is independently colored.
//  Soft inner glow makes light feel like it's coming from inside.
// ─────────────────────────────────────────────────────────────
const skinAFrag = `
  uniform float uTime;
  varying vec2 vUv;
  ${randFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    // Window shape — slightly thicker frame so fewer lit pixels
    float window = step(0.18, gv.x) * step(0.18, gv.y)
                 * step(gv.x, 0.82) * step(gv.y, 0.82);

    // Soft inner glow
    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window;

    // Per-cell random color: pink / blue / warm white
    // Reduce warm-white share to avoid blowout (only 15%)
    float r = rand(cell);
    vec3 neonPink  = vec3(1.0,  0.04, 0.56);
    vec3 neonBlue  = vec3(0.04, 0.4,  1.0);
    vec3 warmWhite = vec3(1.0,  0.92, 0.45);
    vec3 winColor = r < 0.42 ? neonPink
                  : r < 0.85 ? neonBlue
                  : warmWhite;

    vec3 base = vec3(0.015, 0.008, 0.02);
    vec3 col  = base
              + winColor * window    * 0.55   // dimmer flat emission
              + winColor * innerGlow * 0.28;  // subtle inner glow only
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN B – Sparse Grid, Neon Pink / Neon Violet
//  ~55% of windows randomly on. Each lit window picks pink or violet.
// ─────────────────────────────────────────────────────────────
const skinBFrag = `
  uniform float uTime;
  varying vec2 vUv;
  ${randFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    // ~40% of windows on (was 56%)
    float on_off = step(0.60, rand(cell));
    float window = step(0.18, gv.x) * step(0.18, gv.y)
                 * step(gv.x, 0.82) * step(gv.y, 0.82);

    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window * on_off;

    float r2 = rand(cell + vec2(5.1, 2.9));
    vec3 neonPink   = vec3(1.0,  0.04, 0.56);
    vec3 neonViolet = vec3(0.65, 0.0,  1.0);
    vec3 winColor = r2 < 0.5 ? neonPink : neonViolet;

    vec3 base = vec3(0.015, 0.008, 0.02);
    vec3 col  = base
              + winColor * window * on_off * 0.58
              + winColor * innerGlow       * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────
//  SKIN C – Pulsing Dense Grid (animated version of A)
//  Same multi-color windows but intensity breathes with sin(time).
// ─────────────────────────────────────────────────────────────
const skinCFrag = `
  uniform float uTime;
  varying vec2 vUv;
  ${randFn}
  void main() {
    vec2 cell = floor(vUv * vec2(4.0, 6.0));
    vec2 gv   = fract(vUv * vec2(4.0, 6.0));

    float window = step(0.18, gv.x) * step(0.18, gv.y)
                 * step(gv.x, 0.82) * step(gv.y, 0.82);

    vec2 centered = 1.0 - abs(gv * 2.0 - 1.0);
    float innerGlow = centered.x * centered.y * window;

    float r = rand(cell);
    vec3 neonPink  = vec3(1.0,  0.04, 0.56);
    vec3 neonBlue  = vec3(0.04, 0.4,  1.0);
    vec3 warmWhite = vec3(1.0,  0.92, 0.45);
    vec3 winColor = r < 0.42 ? neonPink
                  : r < 0.85 ? neonBlue
                  : warmWhite;

    // Gentle pulse — narrow range so it doesn't spike bright
    float phase = rand(cell + vec2(1.1, 3.7)) * 6.28318;
    float pulse = 0.75 + 0.25 * sin(uTime * 1.8 + phase);

    vec3 base = vec3(0.015, 0.008, 0.02);
    vec3 col  = base
              + winColor * window    * pulse * 0.55
              + winColor * innerGlow * pulse * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SKIN_FRAGS = [skinAFrag, skinBFrag, skinCFrag];

function makeSkinMaterial(skinIndex: number, towerHeight: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:   { value: 0 },
      uHeight: { value: Math.max(1, towerHeight) },
    },
    vertexShader,
    fragmentShader: SKIN_FRAGS[skinIndex],
  });
}

// Height-based selection:
// Short  → sparse pink/violet (B)  or dense multi-color (A)
// Medium → dense multi-color (A)
// Tall   → pulsing dense (C)
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

  const createDrone = (color: number) => {
    const droneGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: 5 });
    const body  = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.45), bodyMat);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 1.4),  bodyMat);
    const nose  = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6),   bodyMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.6;
    droneGroup.add(body, wings, nose);
    return droneGroup;
  };

  const spawnShips = () => {
    if (themeRef.current !== 'skyline') return;
    const palette = [0x00ffff, 0xff00ff, 0x00ff88];
    for (let i = 0; i < 3; i++) {
      const group = createDrone(palette[i]);
      const trailGeo = new THREE.BufferGeometry();
      const buf = new Float32Array(40 * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
      const trailMat = new THREE.LineBasicMaterial({ color: palette[i], transparent: true, opacity: 0.55 });
      const trail = new THREE.Line(trailGeo, trailMat);
      sceneRef.current.add(group);
      sceneRef.current.add(trail);
      shipsRef.current.push({
        group, trail,
        history: [] as THREE.Vector3[],
        angle: Math.random() * Math.PI * 2,
        radius: 36 + i * 14,
        speed: 0.25 + Math.random() * 0.22,
        baseY: 14 + i * 5,
        oscSpeed: 0.6 + Math.random() * 0.7,
        oscAmp: 2.5 + Math.random() * 2,
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
      if (themeRef.current === 'skyline') spawnShips();

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
          } else if (isZero) {
            mat = new THREE.MeshStandardMaterial({ color: (currentTheme as any).colorEmpty });
          } else {
            // ── CYBERPUNK SKIN SYSTEM ──────────────────────
            const skinIdx = selectSkin(ratio);
            mat = makeSkinMaterial(skinIdx, rawH);
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.25, 0.9);
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

      // Spaceships + trails
      shipsRef.current.forEach(ship => {
        ship.angle += ship.speed * dt;
        const x = Math.cos(ship.angle) * ship.radius;
        const z = Math.sin(ship.angle) * ship.radius;
        const y = ship.baseY + Math.sin(st * ship.oscSpeed) * ship.oscAmp;
        ship.group.position.set(x, y, z);
        ship.group.lookAt(new THREE.Vector3(
          Math.cos(ship.angle + 0.12) * ship.radius, y,
          Math.sin(ship.angle + 0.12) * ship.radius
        ));
        ship.history.push(new THREE.Vector3(x, y, z));
        if (ship.history.length > 40) ship.history.shift();
        const pa = ship.trail.geometry.attributes.position;
        ship.history.forEach((p: THREE.Vector3, i: number) => pa.setXYZ(i, p.x, p.y, p.z));
        (pa as any).needsUpdate = true;
      });

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
      mouseRef.current.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (tooltipRef.current) { tooltipRef.current.style.left = `${e.clientX + 15}px`; tooltipRef.current.style.top = `${e.clientY + 15}px`; }
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
