const { getAuth, setAuth, clearAuth, getApiUrl } = require('../utils/storage')

async function handleAuthCommand(command, args) {
  if (command === 'login') {
    await handleLogin(args)
    return
  }

  if (command === 'logout') {
    await handleLogout()
    return
  }

  if (command === 'whoami') {
    handleWhoami()
    return
  }
}

async function handleLogin(args) {
  const [token] = args
  
  if (!token) {
    console.log('Usage: insighta login <github-token>')
    console.log('')
    console.log('Provide a GitHub Personal Access Token (PAT) to authenticate.')
    console.log('Example: insighta login ghp_xxxxxxxxxxxx')
    return
  }

  const apiUrl = getApiUrl()
  console.log('Authenticating with GitHub...')
  
  try {
    const response = await fetch(`${apiUrl}/auth/cli/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`Login failed: ${data.message || 'Unknown error'}`)
      process.exit(1)
    }

    setAuth({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
      loggedInAt: new Date().toISOString()
    })

    console.log(`Logged in as: ${data.user.email}`)
    console.log('Login successful!')
  } catch (error) {
    console.error(`Connection error: ${error.message}`)
    console.log(`Make sure your backend is running at ${apiUrl}`)
    process.exit(1)
  }
}

async function handleLogout() {
  const auth = getAuth()
  
  if (!auth) {
    console.log('You are not logged in.')
    return
  }

  const apiUrl = getApiUrl()
  
  try {
    await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: auth.refreshToken })
    })
  } catch (error) {
    // Continue with local logout even if API call fails
    console.log('Note: Could not reach server for remote logout.')
  }

  clearAuth()
  console.log('Logged out successfully.')
}

function handleWhoami() {
  const auth = getAuth()
  
  if (!auth) {
    console.log('You are not logged in.')
    return
  }

  console.log(`Logged in as: ${auth.user?.email || 'unknown'}`)
  console.log(`User ID: ${auth.user?.id}`)
  console.log(`Logged in at: ${auth.loggedInAt}`)
}

module.exports = { handleAuthCommand }
