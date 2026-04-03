export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  
  if (!token) {
    return res.status(200).json({ 
      status: 'ERROR',
      message: 'No token found',
      env_vars_checked: ['GITHUB_TOKEN', 'GH_TOKEN']
    });
  }

  // Test the token against GitHub
  const testResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': '3d-contributions-visualizer'
    }
  });

  const statusCode = testResponse.status;
  let githubUser = null;
  
  if (testResponse.ok) {
    const userData = await testResponse.json();
    githubUser = userData.login;
  }

  return res.status(200).json({
    status: statusCode === 200 ? 'OK' : 'FAIL',
    github_api_status: statusCode,
    token_found: true,
    token_prefix: token.substring(0, 8) + '...',
    token_length: token.length,
    authenticated_as: githubUser,
    message: statusCode === 200 
      ? `Token is valid! Authenticated as: ${githubUser}` 
      : `GitHub rejected token with status ${statusCode} - check token scopes/expiry`
  });
}
