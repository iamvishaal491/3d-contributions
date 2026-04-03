import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchGitHubContributions } from './github.js';

/**
 * 3D GitHub Contribution Visualizer - Main Engine
 * Senior Engineer Debugging: Final Checklist Verification
 */

// ✔ 1. Global declarations (Fix for Scope/Clock Issue)
let scene, camera, renderer, controls, clock;
let raycaster, mouse;
let cubes = [];
let targetHeights = [];
let hoveredCube = null;

// UI Elements
const form = document.getElementById('search-form');
const input = document.getElementById('username-input');
const btn = document.getElementById('search-btn');
const statusMsg = document.getElementById('status-message');
const tooltip = document.getElementById('tooltip');
const tooltipDate = document.getElementById('tooltip-date');
const tooltipCount = document.getElementById('tooltip-count');

// Constants & Theme
const CUBE_SIZE = 1;
const GAP = 0.3;
const BASE_HEIGHT = 0.2;
const MAX_HEIGHT_SCALE = 3;

const COLOR_BG = 0x0b0f19;
const COLOR_LOW = new THREE.Color('#102e1c');
const COLOR_HIGH = new THREE.Color('#4ade80');
const COLOR_ACTIVE = new THREE.Color('#ffffff');

// ✔ 2. Execution Order: init() first, then animate()
init();
animate();

function init() {
  // ✔ 1. Clock initialized inside init
  clock = new THREE.Clock();

  // ✔ 11. DOM Issue check: Ensure container exists
  const container = document.getElementById('canvas-container');
  if (!container) {
    console.error("Canvas container not found!");
    return;
  }

  // ✔ 3. Scene Initialization
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BG);
  scene.fog = new THREE.Fog(COLOR_BG, 20, 100);

  // ✔ 5. Camera Issue check: Initialize and position correctly
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(30, 40, 60);

  // ✔ 4, 10. Renderer Setup & Size
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // ✔ 4. Attach renderer to DOM
  container.appendChild(renderer.domElement);

  // Controls Setup
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  
  // ✔ 5. Point camera at scene (OrbitControls target manages lookAt)
  controls.target.set(0, 0, 0);
  controls.update();

  // ✔ 9. Lighting Issue check: Ensure ambient and directional lights exist
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
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

  // Interaction Helpers
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Fallback / Debug Cube (To verify scene renders without data)
  const debugGeometry = new THREE.BoxGeometry(1, 1, 1);
  const debugMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
  const debugCube = new THREE.Mesh(debugGeometry, debugMaterial);
  debugCube.name = 'debug-cube';
  scene.add(debugCube); // ✔ 7. Cube added to scene

  // Event Listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  if (form) form.addEventListener('submit', handleSearch);
  
  console.log('[3D Engine] Initialization complete. Scene ready.');
}

// ✔ 8. Loop Issue check: animate() handles loop securely
function animate() {
  requestAnimationFrame(animate);

  // Defensive check
  if (!renderer || !scene || !camera || !clock) return;

  // ✔ 1. Get Delta correctly
  const dt = clock.getDelta();

  if (controls) controls.update();

  // Grid Animation Logic
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

  // ✔ Execute final render call
  renderer.render(scene, camera);
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
    
    const debugCube = scene.getObjectByName('debug-cube');
    if (debugCube) scene.remove(debugCube);

    buildGrid(data);
    showStatus(`Visualizing @${username}`);
  } catch (err) {
    console.error('[3D Engine] Fetch failed:', err);
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = 'Visualize';
      btn.disabled = false;
    }
  }
}

function buildGrid(data) {
  // ✔ 6. Data Issue check: prevent crashes on undefined data
  if (!data || !data.weeks) {
    console.log("No data returned or invalid format.");
    showStatus("No contribution data found.", "error");
    return;
  }

  clearGrid();

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

      const material = new THREE.MeshStandardMaterial({
        color: day.contributionCount === 0 ? 0x1e293b : COLOR_LOW.clone().lerp(COLOR_HIGH, ratio),
        roughness: 0.3,
        metalness: 0.1,
      });

      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(getPositionX(wIndex), 0, getPositionZ(dIndex));
      cube.scale.y = 0.01; 
      
      cube.castShadow = true;
      cube.receiveShadow = true;

      cube.userData = {
        date: day.date,
        count: day.contributionCount,
      };

      // ✔ 7. Scene Issue Check: Actually add cubes to the scene
      scene.add(cube);
      cubes.push(cube);
      targetHeights.push(rawHeight);
    });
  });

  if (controls) {
    const gridWidth = numWeeks * (CUBE_SIZE + GAP);
    camera.position.set(0, gridWidth * 0.35, gridWidth * 0.6);
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
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
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
  if (!raycaster || !mouse || !camera || cubes.length === 0) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cubes);

  if (intersects.length > 0) {
    const object = intersects[0].object;

    if (hoveredCube !== object) {
      if (hoveredCube) hoveredCube.material.emissive.setHex(0x000000);
      
      hoveredCube = object;
      hoveredCube.material.emissive.copy(COLOR_ACTIVE).multiplyScalar(0.25);

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
      hoveredCube.material.emissive.setHex(0x000000);
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
