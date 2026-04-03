// generate-calendar.js
// Completely Isolated Isometric SVG Graphic Pipeline.
// Run natively with Node.js 18+

const fs = require('fs');
const path = require('path');

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
  
  let maxCount = 0;
  weeks.forEach(week => {
    week.contributionDays.forEach(day => {
      if (day.contributionCount > maxCount) maxCount = day.contributionCount;
    });
  });

  let svgElements = [];
  
  // Back-to-front rendering loop
  weeks.forEach((week, wIndex) => {
    week.contributionDays.forEach((day, dIndex) => {
      const tier = getTier(day.contributionCount, maxCount);
      
      // Calculate Isometric Roots
      // Offset by number of weeks to center the grid
      const xOffset = wIndex - weeks.length / 2;
      const yOffset = dIndex - 3.5;
      
      const isoX = (xOffset - yOffset) * DX;
      const isoY = (xOffset + yOffset) * DY;
      
      // Calculate Z height
      let rawHeight = 2; // Flat block height for 0 contributions
      if (day.contributionCount > 0) {
        const ratio = Math.log(day.contributionCount + 1) / Math.log(maxCount + 1);
        rawHeight = 2 + (ratio * MAX_HEIGHT_SCALE * 14); // Amplify Z scale
      }

      // Vertices for Top Polygon
      const topPts = [
        `${isoX},${isoY - rawHeight}`,
        `${isoX + DX},${isoY + DY - rawHeight}`,
        `${isoX},${isoY + 2 * DY - rawHeight}`,
        `${isoX - DX},${isoY + DY - rawHeight}`
      ].join(' ');

      // Vertices for Left Polygon
      const leftPts = [
        `${isoX - DX},${isoY + DY - rawHeight}`,
        `${isoX},${isoY + 2 * DY - rawHeight}`,
        `${isoX},${isoY + 2 * DY}`,
        `${isoX - DX},${isoY + DY}`
      ].join(' ');

      // Vertices for Right Polygon
      const rightPts = [
        `${isoX},${isoY + 2 * DY - rawHeight}`,
        `${isoX + DX},${isoY + DY - rawHeight}`,
        `${isoX + DX},${isoY + DY}`,
        `${isoX},${isoY + 2 * DY}`
      ].join(' ');

      // Paint block
      svgElements.push(`
        <g id="day-${day.date}">
          <polygon points="${leftPts}" fill="${COLOR_LEFT[tier]}" stroke="${COLOR_LEFT[tier]}" stroke-width="0.5"/>
          <polygon points="${rightPts}" fill="${COLOR_RIGHT[tier]}" stroke="${COLOR_RIGHT[tier]}" stroke-width="0.5"/>
          <polygon points="${topPts}" fill="${COLOR_LEVELS[tier]}" stroke="${COLOR_LEVELS[tier]}" stroke-width="0.5"/>
        </g>
      `);
    });
  });

  // Calculate generic bounding box
  const boundingW = DX * (weeks.length + 7) + 100;
  const boundingH = DY * (weeks.length + 7) + (MAX_HEIGHT_SCALE * 14) + 100;

  const svgHead = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-boundingW/2} ${-boundingH/4 - 100} ${boundingW} ${boundingH}" width="100%" height="auto">`;
  const svgTail = `</svg>`;
  
  return [svgHead, ...svgElements, svgTail].join('\n');
}

async function main() {
  console.log('[+] Starting 3D Isometric SVG Generation...');
  if (!GITHUB_TOKEN) {
    console.error('[-] Error: GITHUB_TOKEN environment variable not set.');
    // Fail gracefully with a dummy file if needed, but erroring lets Action know it failed.
    process.exit(1);
  }

  try {
    const calendar = await fetchContributions();
    console.log(`[+] Fetched data. Total contributions: ${calendar.totalContributions}`);
    
    const svgGrid = buildSVG(calendar);
    
    if (!fs.existsSync(OUTPUT_DIR)){
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, svgGrid);
    console.log(`[+] Successfully wrote SVG graphic to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('[-] Process failed:', err.message);
    process.exit(1);
  }
}

main();
