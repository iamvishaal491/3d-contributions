// generate-calendar.js
// Completely Isolated Isometric SVG Graphic Pipeline.
// Run natively with Node.js 18+

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || 'iamvishaal491';

// Theme Constants
const COLOR_LEVELS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']; // Top faces
const COLOR_LEFT =   ['#d1d5da', '#7dd88f', '#2fb353', '#238a42', '#18592d']; // Shaded left faces
const COLOR_RIGHT =  ['#e1e4e8', '#8ce29d', '#3bc95c', '#299648', '#1c6333']; // Lightly shaded right faces

const CUBE_SIZE = 12;
const MAX_HEIGHT_SCALE = 4;
const DX = CUBE_SIZE * Math.cos(Math.PI / 6); // ~10.392
const DY = CUBE_SIZE * Math.sin(Math.PI / 6); // ~6.0

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'isometric-calendar.svg');

async function fetchContributions() {
  console.log(`[+] Fetching contributions for user: ${USERNAME}`);
  const query = `
    query {
      user(login: "${USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No body');
    throw new Error(`GitHub API HTTP error! status: ${response.status} (${response.statusText}). Body: ${errorBody}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GitHub API GraphQL Error: ${data.errors.map(err => err.message).join(', ')}`);
  }

  if (!data.data || !data.data.user) {
    throw new Error(`User "${USERNAME}" not found or data unreachable. Check your GITHUB_TOKEN permissions.`);
  }

  return data.data.user.contributionsCollection.contributionCalendar;
}

function getTier(count, maxCount) {
  if (count === 0) return 0;
  const ratio = Math.log(count + 1) / Math.log(maxCount + 1);
  if (ratio > 0.75) return 4;
  if (ratio > 0.50) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function buildSVG(calendar) {
  const weeks = calendar.weeks;
  
  // 📈 Calculation Logic
  let maxCount = 0;
  let totalCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let dayCount = 0;
  
  weeks.forEach(week => {
    week.contributionDays.forEach(day => {
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
  
  const avgPerDay = (totalCount / dayCount).toFixed(2);

  const svgElements = [];
  const STROKE_COLOR = 'rgba(27,31,35,0.1)'; 
  const STROKE_WIDTH = '0.5';
  const GRID_STROKE = '#57606a'; // Darker opaque grey for uniform contrast
  const GRID_STROKE_WIDTH = '1';
  weeks.forEach((week, wIndex) => {
    week.contributionDays.forEach((day, dIndex) => {
      const tier = getTier(day.contributionCount, maxCount);
      const xOffset = wIndex - weeks.length / 2;
      const yOffset = dIndex - 3.5;
      
      const isoX = Math.round((xOffset - yOffset) * DX);
      const isoY = Math.round((xOffset + yOffset) * DY);
      
      let rawHeight = 0;
      if (day.contributionCount > 0) {
        const ratio = Math.log(day.contributionCount + 1) / Math.log(maxCount + 1);
        rawHeight = Math.round(2 + (ratio * MAX_HEIGHT_SCALE * 14));
      }

      const topPts = `${isoX},${isoY - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX - Math.round(DX)},${isoY + Math.round(DY) - rawHeight}`;
      
      if (day.contributionCount === 0) {
        // Flat grid base for empty days
        svgElements.push(`<g id="d-${day.date}"><polygon points="${topPts}" fill="${COLOR_LEVELS[0]}" stroke="${GRID_STROKE}" stroke-width="${GRID_STROKE_WIDTH}" stroke-linejoin="round"/></g>`);
      } else {
        // 3D Cube for active days
        const leftPts = `${isoX - Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY)} ${isoX - Math.round(DX)},${isoY + Math.round(DY)}`;
        const rightPts = `${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY)} ${isoX},${isoY + 2 * Math.round(DY)}`;
        
        svgElements.push(`<g id="d-${day.date}"><polygon points="${leftPts}" fill="${COLOR_LEFT[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/><polygon points="${rightPts}" fill="${COLOR_RIGHT[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/><polygon points="${topPts}" fill="${COLOR_LEVELS[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/></g>`);
      }
    });
  });

  const calendarWidth = Math.ceil(DX * (weeks.length + 8));
  const statsWidth = 280;
  const totalW = calendarWidth + statsWidth;
  const totalH = Math.ceil(DY * (weeks.length + 8) + (MAX_HEIGHT_SCALE * 14) + 120);
  
  const vBoxX = Math.floor(-calendarWidth / 2);
  const vBoxY = Math.floor(-totalH / 2);

  // 📝 Helpers for Icons
  function drawIcon(path, x, y, color) {
    return `<g transform="translate(${x}, ${y - 12}) scale(0.65)"><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  const primaryIconColor = '#8b949e'; 
  const titleIconColor = '#58a6ff'; 

  const calendarIcon = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';
  const stacksIcon = '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>';
  const flameIcon = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.242.062-4.966.24-.606.012-.872-.25-.688A10.02 10.02 0 0 0 5 11c0 3.866 3.134 7 7 7s7-3.134 7-7a9.972 9.972 0 0 0-2.312-6.342c-.227-.272-.619-.244-.543.085.344 1.5.097 3.551-1.145 5.257"/>';
  const starIcon = '<circle cx="12" cy="12" r="3"/><path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M6.343 17.657l-1.414 1.414M19.07 4.93l-1.414 1.414M17.657 17.657l1.414 1.414M4.93 4.93l1.414 1.414"/>';
  const nodeIcon = '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>';
  const highestIcon = '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>';
  const avgIcon = '<polyline points="16 18 20 14 24 18"/><polyline points="8 6 4 10 0 6"/><line x1="20" y1="14" x2="20" y2="22"/><line x1="4" y1="10" x2="4" y2="2"/><line x1="12" y1="12" x2="12" y2="12"/>';

  const textStyle = 'fill:#8b949e; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji; font-size:14px;';
  const labelStyle = 'fill:#58a6ff; font-weight:400; font-family:inherit; font-size:16px;';
  
  // 📝 Title Layout
  const titleSection = `
    <g transform="translate(${vBoxX + 40}, ${vBoxY + 30})">
      ${drawIcon(calendarIcon, 0, 0, titleIconColor)}
      <text x="22" y="3" style="${labelStyle}">Contributions calendar</text>
    </g>
  `;

  // 📝 Stats Sidebar Logic
  const statsX = Math.floor(calendarWidth / 2) + 20;
  const statsY = -40;

  const statsSection = `
    <g transform="translate(${statsX}, ${statsY})">
      ${drawIcon(stacksIcon, 0, 0, titleIconColor)}
      <text x="22" y="3" style="${labelStyle}">Commits streaks</text>
      
      ${drawIcon(flameIcon, 0, 28, primaryIconColor)}
      <text x="22" y="31" style="${textStyle}">Current streak ${currentStreak} day${currentStreak !== 1 ? 's' : ''}</text>
      
      ${drawIcon(starIcon, 0, 56, primaryIconColor)}
      <text x="22" y="59" style="${textStyle}">Best streak ${bestStreak} days</text>
      
      <g transform="translate(0, 40)">
        ${drawIcon(nodeIcon, 0, 60, titleIconColor)}
        <text x="22" y="63" style="${labelStyle}">Commits per day</text>
        
        ${drawIcon(highestIcon, 0, 88, primaryIconColor)}
        <text x="22" y="91" style="${textStyle}">Highest in a day at ${maxCount}</text>
        
        ${drawIcon(avgIcon, 0, 116, primaryIconColor)}
        <text x="22" y="119" style="${textStyle}">Average per day at ~${avgPerDay}</text>
      </g>
    </g>
  `;

  const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vBoxX} ${vBoxY} ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`;
  const bg = `<rect x="${vBoxX}" y="${vBoxY}" width="${totalW}" height="${totalH}" fill="none"/>`;
  const svgClose = '</svg>';
  
  return (svgOpen + bg + titleSection + svgElements.join('') + statsSection + svgClose).replace(/>\s+</g, '><').trim();
}

async function main() {
  console.log('[+] Starting 3D Isometric SVG Generation...');
  
  if (!GITHUB_TOKEN || GITHUB_TOKEN.trim() === "") {
    console.error('[-] CRITICAL ERROR: GITHUB_TOKEN environment variable is MISSING or EMPTY.');
    console.error('[!] Ensure you added "GH_TOKEN" to your GitHub Repository Secrets.');
    process.exit(1);
  } else {
    console.log(`[+] Token found (Length: ${GITHUB_TOKEN.length} chars)`);
  }

  try {
    const calendar = await fetchContributions();
    console.log(`[+] Successfully fetched calendar. Total contributions: ${calendar.totalContributions}`);
    
    const svgGrid = buildSVG(calendar);
    
    if (!fs.existsSync(OUTPUT_DIR)){
        console.log(`[+] Creating output directory: ${OUTPUT_DIR}`);
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, svgGrid);
    console.log(`[+] Successfully wrote SVG graphic to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('[-] ❌ PROCESS FAILED ❌');
    console.error('[-] Error Message:', err.message);
    if (err.stack) {
        console.error('[-] Stack Trace:', err.stack);
    }
    process.exit(1);
  }
}

main();
