export default async function handler(req, res) {
  // Extract username from the query parameter
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Set up CORS headers (optional, but good if we ever decouple frontend and backend)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.VERCEL_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'GitHub token is missing on the server' });
  }

  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                color
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': '3d-contributions-visualizer'
      },
      body: JSON.stringify({
        query,
        variables: { login: username },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API returned ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: `GitHub API error: ${response.status}` });
    }

    const data = await response.json();

    if (data.errors) {
      return res.status(400).json({ error: data.errors[0].message });
    }

    return res.status(200).json(data.data.user.contributionsCollection.contributionCalendar);
  } catch (error) {
    console.error('Fetch operation error:', error.message);
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
}
