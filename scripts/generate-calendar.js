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
  const STROKE_COLOR = 'rgba(0,0,0,0.5)'; 
  const STROKE_WIDTH = '0.8';
  weeks.forEach((week, wIndex) => {
    week.contributionDays.forEach((day, dIndex) => {
      const tier = getTier(day.contributionCount, maxCount);
      const xOffset = wIndex - weeks.length / 2;
      const yOffset = dIndex - 3.5;
      
      const isoX = Math.round((xOffset - yOffset) * DX);
      const isoY = Math.round((xOffset + yOffset) * DY);
      
      let rawHeight = 2;
      if (day.contributionCount > 0) {
        const ratio = Math.log(day.contributionCount + 1) / Math.log(maxCount + 1);
        rawHeight = Math.round(2 + (ratio * MAX_HEIGHT_SCALE * 14));
      }

      const topPts = `${isoX},${isoY - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX - Math.round(DX)},${isoY + Math.round(DY) - rawHeight}`;
      const leftPts = `${isoX - Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX},${isoY + 2 * Math.round(DY)} ${isoX - Math.round(DX)},${isoY + Math.round(DY)}`;
      const rightPts = `${isoX},${isoY + 2 * Math.round(DY) - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY) - rawHeight} ${isoX + Math.round(DX)},${isoY + Math.round(DY)} ${isoX},${isoY + 2 * Math.round(DY)}`;

      svgElements.push(`<g id="d-${day.date}"><polygon points="${leftPts}" fill="${COLOR_LEFT[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}"/><polygon points="${rightPts}" fill="${COLOR_RIGHT[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}"/><polygon points="${topPts}" fill="${COLOR_LEVELS[tier]}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}"/></g>`);
    });
  });

  const calendarWidth = Math.ceil(DX * (weeks.length + 8));
  const statsWidth = 250;
  const totalW = calendarWidth + statsWidth;
  const totalH = Math.ceil(DY * (weeks.length + 8) + (MAX_HEIGHT_SCALE * 14) + 100);
  
  const vBoxX = Math.floor(-calendarWidth / 2);
  const vBoxY = Math.floor(-totalH / 2);

  // 📝 Stats Sidebar Logic
  const statsX = Math.floor(calendarWidth / 2) + 20;
  const statsY = -40;
  
  const textStyle = 'fill:#8b949e; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji; font-size:12px;';
  const labelStyle = 'fill:#58a6ff; font-weight:bold; font-family:inherit; font-size:14px;';
  const valueStyle = 'fill:#c9d1d9; font-family:inherit; font-weight:bold; font-size:14px;';

  const statsSection = `
    <g transform="translate(${statsX}, ${statsY})">
      <text y="0" style="${labelStyle}">Contributions stats</text>
      <text y="30" style="${textStyle}">Total:</text> <text x="50" y="30" style="${valueStyle}">${totalCount}</text>
      
      <text y="60" style="${labelStyle}">Commits streaks</text>
      <text y="90" style="${textStyle}">Best streak:</text> <text x="80" y="90" style="${valueStyle}">${bestStreak} days</text>
      
      <text y="120" style="${labelStyle}">Commits per day</text>
      <text y="150" style="${textStyle}">Highest day:</text> <text x="85" y="150" style="${valueStyle}">${maxCount}</text>
      <text y="175" style="${textStyle}">Average:</text> <text x="65" y="175" style="${valueStyle}">${avgPerDay}</text>
    </g>
  `;

  const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vBoxX} ${vBoxY} ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`;
  const bg = `<rect x="${vBoxX}" y="${vBoxY}" width="${totalW}" height="${totalH}" fill="none"/>`;
  const svgClose = '</svg>';
  
  return (svgOpen + bg + svgElements.join('') + statsSection + svgClose).replace(/>\s+</g, '><').trim();
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
