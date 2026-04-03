import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchGitHubContributions } from './github.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * 3D GitHub Contribution Visualizer - Main Engine
 * Multi-Theme Integration (Classic, Isometric, Skyline)
 */

let scene, renderer, controls, clock;
let perspectiveCamera, orthographicCamera, currentCamera;
let raycaster, mouse;
let cubes = [];
let targetHeights = [];
let hoveredCube = null;

// Post Processing
let composer, renderPass, bloomPass;
let gridHelper = null;

// UI Elements
const form = document.getElementById('search-form');
const input = document.getElementById('username-input');
const btn = document.getElementById('search-btn');
const statusMsg = document.getElementById('status-message');
const tooltip = document.getElementById('tooltip');
const tooltipDate = document.getElementById('tooltip-date');
const tooltipCount = document.getElementById('tooltip-count');
const themeButtons = document.querySelectorAll('.theme-btn');

// Constants
const CUBE_SIZE = 1;
const GAP = 0.3;
const BASE_HEIGHT = 0.2;
const MAX_HEIGHT_SCALE = 3;

// State Variables
let currentData = null;
let currentTheme = 'classic'; // 'classic', 'isometric', 'skyline'

// Themes Map
const THEMES = {
  classic: {
    bg: 0x0b0f19,
    fog: 20,
    fogFar: 100,
    floor: false,
    useBloom: false,
    colorLow: new THREE.Color('#102e1c'),
    colorHigh: new THREE.Color('#4ade80'),
    colorEmpty: 0x1e293b,
  },
  isometric: {
    bg: 0xf3f4f6, // Light minimal background
    fog: 100,
    fogFar: 300,
    floor: true,
    gridColor: 0xcccccc,
    useBloom: false,
    colorLow: new THREE.Color('#9be9a8'),
    colorHigh: new THREE.Color('#216e39'),
    colorEmpty: 0xebedf0,
  },
  skyline: {
    bg: 0x0a0310, // Deep synthwave purple
    fog: 20,
    fogFar: 90,
    floor: true,
    gridColor: 0xff00ff, // Neon pink wireframe
    useBloom: true,
    colorLow: new THREE.Color('#002244'),
    colorHigh: new THREE.Color('#00ffff'), // Neon Cyan
    colorEmpty: 0x110022,
  }
};

init();
animate();

function init() {
  clock = new THREE.Clock();

  const container = document.getElementById('canvas-container');
  if (!container) return;

  // Scene
  scene = new THREE.Scene();

  // Cameras (Dual Setup)
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 40;
  
  perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  perspectiveCamera.position.set(30, 40, 60);

  orthographicCamera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2, (frustumSize * aspect) / 2, 
    frustumSize / 2, frustumSize / -2, 
    -100, 1000
  );
  orthographicCamera.position.set(50, 50, 50); // Isometric lock position

  currentCamera = perspectiveCamera;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(currentCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;

  // Post-Processing (Bloom for Skyline)
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, currentCamera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  bloomPass.strength = 1.2;
  bloomPass.radius = 0.5;
  bloomPass.threshold = 0.1;
  composer.addPass(bloomPass);

  // Lighting
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

  const debugGeometry = new THREE.BoxGeometry(1, 1, 1);
  const debugMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
  const debugCube = new THREE.Mesh(debugGeometry, debugMaterial);
  debugCube.name = 'debug-cube';
  scene.add(debugCube);

  // Apply Default Theme Details
  applyThemeModifiers();

  // Events
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  if (form) form.addEventListener('submit', handleSearch);
  
  themeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      themeButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTheme = e.target.getAttribute('data-theme');
      applyThemeModifiers();
    });
  });
}

function applyThemeModifiers() {
  const t = THEMES[currentTheme];
  
  // Scene Global
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.bg, t.fog, t.fogFar);

  // Grid Helper Management
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.dispose();
    gridHelper = null;
  }
  
  if (t.floor) {
    gridHelper = new THREE.GridHelper(100, 50, t.gridColor, t.gridColor);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);
  }

  // Camera Management
  if (currentTheme === 'isometric') {
    currentCamera = orthographicCamera;
    controls.object = currentCamera;
    // Lock controls for true isometric
    controls.enableRotate = false;
    currentCamera.position.set(50, 50, 50);
  } else {
    currentCamera = perspectiveCamera;
    controls.object = currentCamera;
    controls.enableRotate = true;
  }
  renderPass.camera = currentCamera;
  controls.update();

  // Re-build grid if data exists so completely new materials apply
  if (currentData) {
    buildGrid(currentData);
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !currentCamera || !clock) return;

  const dt = clock.getDelta();
  if (controls) controls.update();

  if (cubes.length > 0) {
    for (let i = 0; i < cubes.length; i++) {
      const cube = cubes[i];
      const target = targetHeights[i] || BASE_HEIGHT;
      if (cube.scale.y < target) {
        cube.scale.y += (target - cube.scale.y) * 8 * dt;
        if (target - cube.scale.y < 0.001) cube.scale.y = target;
      }
    }
  }

  checkIntersections();

  if (THEMES[currentTheme].useBloom) {
    composer.render();
  } else {
    renderer.render(scene, currentCamera);
  }
}

async function handleSearch(e) {
  e.preventDefault();
  const username = input?.value.trim();
  if (!username) return;

  if (btn) {
    btn.innerHTML = '<div class="spinner"></div>';
    btn.disabled = true;
  }
  showStatus(`Fetching @${username}'s contributions...`);

  try {
    const data = await fetchGitHubContributions(username);
    currentData = data;
    
    const debugCube = scene.getObjectByName('debug-cube');
    if (debugCube) scene.remove(debugCube);

    buildGrid(currentData);
    showStatus(`Visualizing @${username} in ${currentTheme.toUpperCase()} mode`);
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

      // Skyline Neon Theme applies emissive glow instead of standard color
      const isNeon = currentTheme === 'skyline';
      const activeColor = t.colorLow.clone().lerp(t.colorHigh, ratio);
      const isZero = day.contributionCount === 0;

      const material = new THREE.MeshStandardMaterial({
        color: isZero ? t.colorEmpty : (isNeon ? 0x000000 : activeColor), // Neon uses black base, heavily emissive
        emissive: isZero ? 0x000000 : (isNeon ? activeColor : 0x000000), // Glow if neon
        emissiveIntensity: isNeon && !isZero ? (0.5 + ratio * 1.5) : 0,
        roughness: isNeon ? 0.1 : 0.3,
        metalness: isNeon ? 0.8 : 0.1,
      });

      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(getPositionX(wIndex), 0, getPositionZ(dIndex));
      
      // Animate from zero only if initial build, skip if just changing themes
      cube.scale.y = 0.01; 
      
      cube.castShadow = true;
      cube.receiveShadow = true;

      cube.userData = {
        date: day.date,
        count: day.contributionCount,
        originalEmissive: material.emissive.clone()
      };

      scene.add(cube);
      cubes.push(cube);
      targetHeights.push(rawHeight);
    });
  });

  if (controls) {
    const gridWidth = numWeeks * (CUBE_SIZE + GAP);
    if (currentTheme === 'isometric') {
      currentCamera.position.set(20, 20, 20); // Ortho distance
      currentCamera.zoom = 5;
      currentCamera.updateProjectionMatrix();
    } else {
      currentCamera.position.set(0, gridWidth * 0.35, gridWidth * 0.6);
    }
    controls.target.set(0, 0, 0);
  }
}

function clearGrid() {
  cubes.forEach(cube => {
    cube.geometry.dispose();
    cube.material.dispose();
    scene.remove(cube);
  });
  cubes = [];
  targetHeights = [];
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
  if (mouse) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  if (hoveredCube && tooltip) {
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
  }
}

function checkIntersections() {
  if (!raycaster || !mouse || !currentCamera || cubes.length === 0) return;

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

      const { date, count } = hoveredCube.userData;
      if (tooltipDate && tooltipCount) {
        tooltipDate.textContent = new Date(date).toLocaleDateString(undefined, {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        tooltipCount.textContent = `${count} contribution${count === 1 ? '' : 's'}`;
        tooltip.classList.remove('hidden');
      }
    }
  } else {
    if (hoveredCube) {
      hoveredCube.material.emissive.copy(hoveredCube.userData.originalEmissive);
      hoveredCube = null;
      tooltip?.classList.add('hidden');
    }
  }
}

function showStatus(text, type = 'info') {
  if (!statusMsg) return;
  statusMsg.textContent = text;
  statusMsg.className = 'status visible';
  statusMsg.style.color = (type === 'error') ? '#ef4444' : 'var(--text-muted)';
}
