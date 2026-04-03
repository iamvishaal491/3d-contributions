import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchGitHubContributions } from './github.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

/**
 * 3D GitHub Contribution Visualizer
 * Core Engine - Premium GSAP UI/UX Refactor
 */

// Global State
let scene, renderer, controls, clock;
let perspectiveCamera, orthographicCamera, currentCamera;
let raycaster, mouse;
let cubes = [];
let targetHeights = [];
let hoveredCube = null;

// Post-Processing
let composer, renderPass, bloomPass;
let gridHelper = null;

// UI DOM Elements
const form = document.getElementById('search-form');
const input = document.getElementById('username-input');
const btn = document.getElementById('search-btn');
const themeSelect = document.getElementById('theme-select');
const overlay = document.getElementById('scene-transition-overlay');
const statusMsg = document.getElementById('status-message');
const tooltip = document.getElementById('tooltip');
const tooltipDate = document.getElementById('tooltip-date');
const tooltipCount = document.getElementById('tooltip-count');

// Stats DOM Elements
const statTotal = document.getElementById('stat-total');
const statStreak = document.getElementById('stat-streak');
const statMax = document.getElementById('stat-max');
const statAvg = document.getElementById('stat-avg');

// Architecture Settings
const CUBE_SIZE = 1;
const GAP = 0.3;
const BASE_HEIGHT = 0.2;
const MAX_HEIGHT_SCALE = 3;

let currentData = null;
let currentTheme = 'classic';
let isTransitioning = false;
let idleTime = 0;

// Theme Definitions
const THEMES = {
  classic: {
    bg: 0x0b0f19,
    fog: 20,
    fogFar: 100,
    useBloom: false,
    colorLow: new THREE.Color('#102e1c'),
    colorHigh: new THREE.Color('#4ade80'),
    colorEmpty: 0x1e293b,
  },
  isometric: {
    bg: 0xf3f4f6,
    fog: 100,
    fogFar: 300,
    gridColor: 0xcccccc,
    useBloom: false,
    colorLow: new THREE.Color('#9be9a8'),
    colorHigh: new THREE.Color('#216e39'),
    colorEmpty: 0xebedf0,
  },
  skyline: {
    bg: 0x0a0310,
    fog: 20,
    fogFar: 90,
    gridColor: 0xff00ff,
    useBloom: true,
    colorLow: new THREE.Color('#002244'),
    colorHigh: new THREE.Color('#00ffff'), // Cyan Glow
    colorEmpty: 0x110022,
  }
};

init();

function init() {
  clock = new THREE.Clock();
  
  const container = document.getElementById('canvas-container');
  if (!container) return;

  // Global Engine Setup
  scene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;
  
  perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  orthographicCamera = new THREE.OrthographicCamera(-20*aspect, 20*aspect, 20, -20, -100, 1000);
  currentCamera = perspectiveCamera;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(currentCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 150;

  // Post-Processing Pipeline
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, currentCamera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  bloomPass.strength = 1.2;
  bloomPass.radius = 0.5;
  bloomPass.threshold = 0.1;
  composer.addPass(bloomPass);

  // Global Illuminations
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -60;
  dirLight.shadow.camera.right = 60;
  dirLight.shadow.camera.top = 60;
  dirLight.shadow.camera.bottom = -60;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // URL Parsing and Auto-load
  parseURLAndLoad();

  // Listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  if (form) form.addEventListener('submit', handleSearch);
  
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      if (isTransitioning) {
        e.preventDefault();
        return;
      }
      setTheme(e.target.value);
    });
  }

  animate();
}

function parseURLAndLoad() {
  const urlParams = new URLSearchParams(window.location.search);
  const user = urlParams.get('username') || 'iamvishaal491';
  const theme = urlParams.get('theme');

  if (theme && THEMES[theme]) {
    currentTheme = theme;
    if (themeSelect) themeSelect.value = theme;
  }
  
  setTheme(currentTheme, true); // initial load without fadeout

  if (input) {
    input.value = user;
    handleSearch();
  }
}

// -------------------------------------------------------------
// PREMIUM THEME SYSTEM & GSAP LEAK-FREE REFACTOR
// -------------------------------------------------------------

async function setTheme(mode, isInitial = false) {
  isTransitioning = true;
  currentTheme = mode;

  // 1. Fade OUT old scene entirely via UI DOM Overlay
  if (!isInitial) {
    await gsap.to(overlay, { opacity: 1, duration: 0.4, ease: "power2.inOut" });
  }

  // 2. Safely cleanup previous Theme Grid Helpers
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
    gridHelper = null;
  }

  const t = THEMES[currentTheme];
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.bg, t.fog, t.fogFar);

  // 3. Delegate to purely modular Setup Architecture
  if (currentTheme === 'classic') setupClassic();
  else if (currentTheme === 'isometric') setupIsometric(t);
  else setupSkyline(t);

  // Re-build data if exists to apply new textures securely
  if (currentData) {
    buildGrid(currentData);
  }

  // 4. Update the URL parameters implicitly
  const url = new URL(window.location);
  url.searchParams.set('theme', currentTheme);
  window.history.replaceState({}, '', url);

  // 5. Fade IN to the new fully rendered scene
  gsap.to(overlay, { opacity: 0, duration: 0.6, ease: "power2.inOut" });

  isTransitioning = false;
}

function setupClassic() {
  currentCamera = perspectiveCamera;
  
  // Cinematic Load Camera
  currentCamera.position.set(0, 100, 150); // Drop in from cloud

  controls.object = currentCamera;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent seeing below floor
  renderPass.camera = currentCamera;
}

function setupIsometric(t) {
  currentCamera = orthographicCamera;
  
  // Strict mathematical lock for SVG exactness
  currentCamera.position.set(50, 50, 50);
  
  controls.object = currentCamera;
  controls.enableRotate = false; // LOCK
  controls.enableZoom = true;
  renderPass.camera = currentCamera;

  // Add Flat Floor Grid
  gridHelper = new THREE.GridHelper(100, 50, t.gridColor, t.gridColor);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);
}

function setupSkyline(t) {
  currentCamera = perspectiveCamera;
  currentCamera.position.set(-60, 50, 120);

  controls.object = currentCamera;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  renderPass.camera = currentCamera;

  // Emissive Synthwave Grid
  gridHelper = new THREE.GridHelper(150, 60, t.gridColor, t.gridColor);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);
}

// -------------------------------------------------------------
// DATA INGESTION & CINEMATIC CAMERAS
// -------------------------------------------------------------

async function handleSearch(e) {
  if (e) e.preventDefault();
  const username = input?.value.trim();
  if (!username) return;

  if (btn) {
    btn.innerHTML = '<div class="spinner"></div>';
    btn.disabled = true;
  }
  showStatus(`Fetching @${username}...`);

  // Auto URL Update
  const url = new URL(window.location);
  url.searchParams.set('username', username);
  window.history.replaceState({}, '', url);

  try {
    const data = await fetchGitHubContributions(username);
    currentData = data;
    
    // Quick Fade transition to build grid dramatically
    await gsap.to(overlay, { opacity: 1, duration: 0.3 });
    buildGrid(currentData);
    showStatus(`Visualizing @${username}`);
    
    gsap.to(overlay, { opacity: 0, duration: 0.8, ease: "power2.out" });
    updateStatsUI(currentData);

  } catch (err) {
    console.error('Fetch failed:', err);
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = 'Visualize';
      btn.disabled = false;
    }
  }
}

function buildGrid(data) {
  if (!data || !data.weeks) return;
  clearGrid();

  const t = THEMES[currentTheme];
  const weeks = data.weeks;
  const numWeeks = weeks.length;
  const numDays = 7;
  
  let maxCount = 0;
  weeks.forEach(week => {
    week.contributionDays?.forEach(day => {
      if (day.contributionCount > maxCount) maxCount = day.contributionCount;
    });
  });

  const getPositionX = (w) => (w - numWeeks / 2) * (CUBE_SIZE + GAP);
  const getPositionZ = (d) => (d - numDays / 2) * (CUBE_SIZE + GAP);

  const geometry = new THREE.BoxGeometry(CUBE_SIZE, 1, CUBE_SIZE);
  geometry.translate(0, 0.5, 0);

  weeks.forEach((week, wIndex) => {
    week.contributionDays?.forEach((day, dIndex) => {
      let rawHeight = BASE_HEIGHT;
      let ratio = 0;
      
      if (day.contributionCount > 0) {
        ratio = Math.log(day.contributionCount + 1) / Math.log(maxCount + 1);
        rawHeight = BASE_HEIGHT + (ratio * MAX_HEIGHT_SCALE * 4);
      }

      const isNeon = currentTheme === 'skyline';
      const activeColor = t.colorLow.clone().lerp(t.colorHigh, ratio);
      const isZero = day.contributionCount === 0;

      const material = new THREE.MeshStandardMaterial({
        color: isZero ? t.colorEmpty : (isNeon ? 0x000000 : activeColor),
        emissive: isZero ? 0x000000 : (isNeon ? activeColor : 0x000000),
        emissiveIntensity: isNeon && !isZero ? (0.8 + ratio * 1.5) : 0,
        roughness: isNeon ? 0.1 : 0.3,
        metalness: isNeon ? 0.8 : 0.1,
      });

      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(getPositionX(wIndex), 0, getPositionZ(dIndex));
      
      // Starting Scale mathematically low for growth animation
      cube.scale.y = 0.01; 
      
      cube.castShadow = true;
      cube.receiveShadow = true;

      cube.userData = {
        date: day.date,
        count: day.contributionCount,
        originalEmissive: material.emissive.clone(),
        targetHeight: rawHeight
      };

      // Add Sharp Borders (EdgesGeometry)
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 }));
      cube.add(line);

      scene.add(cube);
      cubes.push(cube);
    });
  });

  // Cinematic Camera Fly-Ins using GSAP
  const gridWidth = numWeeks * (CUBE_SIZE + GAP);
  
  if (currentTheme === 'isometric') {
    currentCamera.zoom = 1;
    currentCamera.updateProjectionMatrix();
    gsap.to(currentCamera, { zoom: 4.5, duration: 1.5, ease: "power3.out", onUpdate: () => currentCamera.updateProjectionMatrix() });
    controls.target.set(0, 0, 0);
  } else if (currentTheme === 'skyline') {
    gsap.to(currentCamera.position, {
      x: gridWidth * -0.5,
      y: 20,
      z: 70,
      duration: 2.0,
      ease: "power3.out"
    });
    controls.target.set(0, 0, 0);
  } else {
    // Classic
    gsap.to(currentCamera.position, {
      x: 0,
      y: gridWidth * 0.35,
      z: gridWidth * 0.6,
      duration: 1.5,
      ease: "power3.out"
    });
    controls.target.set(0, 0, 0);
  }
}

function clearGrid() {
  cubes.forEach(cube => {
    // Memory Leak Prevention: Strict Disposal rules applied
    cube.geometry.dispose();
    if(Array.isArray(cube.material)) {
        cube.material.forEach(m => m.dispose());
    } else {
        cube.material.dispose();
    }
    scene.remove(cube);
  });
  cubes = [];
}

// -------------------------------------------------------------
// OPTIMIZED EVENT LOOP & INTERACTION
// -------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !currentCamera || !clock) return;

  const dt = clock.getDelta();
  if (controls) controls.update();

  // Subtle Idle Camera Drift (Very slight oscillation so scene 'breathes')
  idleTime += dt;
  if (!isTransitioning && currentTheme !== 'isometric') {
      controls.target.x = Math.sin(idleTime * 0.5) * 1.5;
  }

  // Smooth Grid Build Algorithm
  if (cubes.length > 0) {
    for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        const target = cube.userData.targetHeight || BASE_HEIGHT;
        if (cube.scale.y < target) {
            cube.scale.y += (target - cube.scale.y) * 8 * dt;
            if (target - cube.scale.y < 0.001) cube.scale.y = target;
        }
    }
  }

  checkIntersections();

  // Post-Processing Delegation
  if (THEMES[currentTheme].useBloom) {
    composer.render();
  } else {
    renderer.render(scene, currentCamera);
  }
}

function onWindowResize() {
  if (!currentCamera || !renderer) return;

  const aspect = window.innerWidth / window.innerHeight;
  
  if (currentCamera === perspectiveCamera) {
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();
  } else {
    const frustumSize = 40;
    orthographicCamera.left = -frustumSize * aspect / 2;
    orthographicCamera.right = frustumSize * aspect / 2;
    orthographicCamera.top = frustumSize / 2;
    orthographicCamera.bottom = -frustumSize / 2;
    orthographicCamera.updateProjectionMatrix();
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
  if (mouse && !isTransitioning) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  if (hoveredCube && tooltip) {
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
  }
}

function checkIntersections() {
  if (!raycaster || !mouse || !currentCamera || cubes.length === 0 || isTransitioning) return;

  raycaster.setFromCamera(mouse, currentCamera);
  const intersects = raycaster.intersectObjects(cubes);

  if (intersects.length > 0) {
    const object = intersects[0].object;

    if (hoveredCube !== object) {
      if (hoveredCube) {
        hoveredCube.material.emissive.copy(hoveredCube.userData.originalEmissive);
      }
      
      hoveredCube = object;
      hoveredCube.material.emissive.setHex(0xffffff);
      if (currentTheme !== 'skyline') hoveredCube.material.emissiveIntensity = 0.3; // Give classic ones a slight hover glow
      else hoveredCube.material.emissiveIntensity = 2.0;

      const { date, count } = hoveredCube.userData;
      if (tooltipDate && tooltipCount) {
        tooltipDate.textContent = new Date(date).toLocaleDateString(undefined, {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        tooltipCount.textContent = `${count} contribution${count === 1 ? '' : 's'}`;
        tooltip.classList.remove('hidden');
      }
    }
  } else {
    if (hoveredCube) {
      hoveredCube.material.emissive.copy(hoveredCube.userData.originalEmissive);
      if (currentTheme !== 'skyline') hoveredCube.material.emissiveIntensity = 0;
      hoveredCube = null;
      tooltip?.classList.add('hidden');
    }
  }
}

function showStatus(text, type = 'info') {
  if (!statusMsg) return;
  statusMsg.textContent = text;
  
  // Only reveal if there's text
  if (text === '') {
      statusMsg.classList.remove('visible');
  } else {
      statusMsg.className = 'glass-panel status visible';
      statusMsg.style.borderColor = (type === 'error') ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)';
  }
}

function updateStatsUI(data) {
  if (!data || !data.weeks) return;

  let totalCount = 0;
  let maxCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let dayCount = 0;

  data.weeks.forEach(week => {
    week.contributionDays?.forEach(day => {
      const count = day.contributionCount;
      totalCount += count;
      dayCount++;
      if (count > maxCount) maxCount = count;

      if (count > 0) {
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    });
  });

  const avg = (totalCount / dayCount).toFixed(2);

  if (statTotal) statTotal.textContent = totalCount.toLocaleString();
  if (statStreak) statStreak.textContent = `${bestStreak} days`;
  if (statMax) statMax.textContent = maxCount;
  if (statAvg) statAvg.textContent = `${avg}`;
}
