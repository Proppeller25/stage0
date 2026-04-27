const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const User = require('../models/userModel')
const { setCsrfCookies, clearCsrfCookies } = require('../middleware/csrf')

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI
const JWT_SECRET = process.env.JWT_SECRET
const WEB_SUCCESS_REDIRECT = process.env.WEB_SUCCESS_REDIRECT || '/'

const ACCESS_TOKEN_EXPIRES_IN = '3m'
const REFRESH_TOKEN_EXPIRES_IN = '5m'
const ACCESS_TOKEN_COOKIE_MAX_AGE = 3 * 60 * 1000
const REFRESH_TOKEN_COOKIE_MAX_AGE = 5 * 60 * 1000
const OAUTH_STATE_COOKIE_NAME = 'oauth_state'
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60 * 1000

const ensureAuthConfig = () => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_REDIRECT_URI) {
    throw new Error('GitHub OAuth environment variables are not fully configured')
  }

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not set')
  }
}

const buildAccessToken = (user) => {
  return jwt.sign(
    {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  )
}

const buildRefreshToken = (user) => {
  return jwt.sign(
    {
      user: {
        id: user._id
      },
      token_type: 'refresh',
      token_id: crypto.randomUUID()
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  )
}

const getRefreshTokenExpiryDate = () => {
  return new Date(Date.now() + REFRESH_TOKEN_COOKIE_MAX_AGE)
}

const saveLoginSession = async (user) => {
  const accessToken = buildAccessToken(user)
  const refreshToken = buildRefreshToken(user)

  user.refresh_token = refreshToken
  user.refresh_token_expires_at = getRefreshTokenExpiryDate()
  user.last_login_at = new Date()
  await user.save()

  return {
    accessToken,
    refreshToken
  }
}

const getCookieOptions = () => {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}

const setAuthCookies = (res, accessToken, refreshToken) => {
  const cookieOptions = getCookieOptions()

  res.cookie('access_token', accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE
  })

  res.cookie('refresh_token', refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE
  })
}

const clearAuthCookies = (res) => {
  const cookieOptions = getCookieOptions()
  res.clearCookie('access_token', cookieOptions)
  res.clearCookie('refresh_token', cookieOptions)
}

const setOauthStateCookie = (res, stateValue) => {
  res.cookie(OAUTH_STATE_COOKIE_NAME, stateValue, {
    ...getCookieOptions(),
    httpOnly: true,
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE
  })
}

const clearOauthStateCookie = (res) => {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
    ...getCookieOptions(),
    httpOnly: true
  })
}

const createStateValue = (mode) => {
  const stateObject = {
    nonce: crypto.randomUUID(),
    mode: mode === 'cli' ? 'cli' : 'web'
  }

  return Buffer.from(JSON.stringify(stateObject)).toString('base64url')
}

const readStateValue = (stateValue) => {
  if (!stateValue) return null

  try {
    const decoded = Buffer.from(stateValue, 'base64url').toString('utf8')
    return JSON.parse(decoded)
  } catch (error) {
    return null
  }
}

const buildGithubAuthorizeUrl = (state, codeChallenge) => {
  const url = new URL('https://github.com/login/oauth/authorize')

  url.searchParams.set('client_id', GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', GITHUB_REDIRECT_URI)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', state)

  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }

  return url.toString()
}

const exchangeGithubCodeForToken = async (code, codeVerifier) => {
  const requestBody = {
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: GITHUB_REDIRECT_URI
  }

  if (codeVerifier) {
    requestBody.code_verifier = codeVerifier
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    throw new Error('Failed to exchange GitHub authorization code')
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error(data.error_description || 'GitHub did not return an access token')
  }

  return data.access_token
}

const fetchGithubUserProfile = async (githubAccessToken) => {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${githubAccessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Insighta-Labs'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user profile')
  }

  const userData = await response.json()

  if (userData.email) {
    return userData
  }

  const emailResponse = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${githubAccessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Insighta-Labs'
    }
  })

  if (!emailResponse.ok) {
    return userData
  }

  const emails = await emailResponse.json()
  const bestEmail =
    emails.find((item) => item.primary) ||
    emails.find((item) => item.verified) ||
    emails[0]

  return {
    ...userData,
    email: bestEmail?.email || userData.email
  }
}

const findOrCreateUserFromGithub = async (githubUser) => {
  const githubId = String(githubUser.id)
  const username = githubUser.login
  const email = githubUser.email || `${username}@users.noreply.github.com`

  let user = await User.findOne({ github_id: githubId })

  if (!user) {
    user = new User({
      github_id: githubId,
      username,
      email,
      avatar_url: githubUser.avatar_url,
      is_active: true
    })
  } else {
    user.username = username
    user.email = email
    user.avatar_url = githubUser.avatar_url
    user.is_active = true
  }

  return user
}

const sendCliLoginResponse = (res, user, accessToken, refreshToken) => {
  return res.status(200).json({
    status: 'success',
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    }
  })
}

const redirectToGithub = async (req, res) => {
  try {
    ensureAuthConfig()

    const mode = req.query.mode === 'cli' ? 'cli' : 'web'
    const codeChallenge =
      typeof req.query.code_challenge === 'string' ? req.query.code_challenge : ''

    const state = createStateValue(mode)
    const githubAuthorizeUrl = buildGithubAuthorizeUrl(state, codeChallenge)

    setOauthStateCookie(res, state)
    return res.redirect(githubAuthorizeUrl)
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error'
    })
  }
}

const githubCallback = async (req, res) => {
  try {
    ensureAuthConfig()

    const code = req.query.code
    const state = req.query.state
    const codeVerifier = req.query.code_verifier

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'Authorization code is missing'
      })
    }

    const stateData = readStateValue(state)
    const storedState = req.cookies?.[OAUTH_STATE_COOKIE_NAME]

    if (!stateData || !stateData.nonce) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing OAuth state'
      })
    }

    if (!storedState || storedState !== state) {
      return res.status(400).json({
        status: 'error',
        message: 'OAuth state validation failed'
      })
    }

    const githubAccessToken = await exchangeGithubCodeForToken(code, codeVerifier)
    const githubUser = await fetchGithubUserProfile(githubAccessToken)
    const user = await findOrCreateUserFromGithub(githubUser)
    const { accessToken, refreshToken } = await saveLoginSession(user)
    clearOauthStateCookie(res)

    if (stateData.mode === 'cli') {
      return sendCliLoginResponse(res, user, accessToken, refreshToken)
    }

    setAuthCookies(res, accessToken, refreshToken)
    setCsrfCookies(res)
    return res.redirect(WEB_SUCCESS_REDIRECT)
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error'
    })
  }
}

const refreshToken = async (req, res) => {
  try {
    ensureAuthConfig()

    const incomingRefreshToken =
      req.body?.refresh_token || req.cookies?.refresh_token

    if (!incomingRefreshToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Refresh token is required'
      })
    }

    const decoded = jwt.verify(incomingRefreshToken, JWT_SECRET)

    if (decoded.token_type !== 'refresh') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid refresh token'
      })
    }

    const userId = decoded?.user?.id
    const user = await User.findById(userId)

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      })
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: 'error',
        message: 'User account is inactive'
      })
    }

    const tokenDoesNotMatch = user.refresh_token !== incomingRefreshToken
    const tokenMissing = !user.refresh_token
    const tokenHasExpired =
      !user.refresh_token_expires_at ||
      user.refresh_token_expires_at.getTime() <= Date.now()

    if (tokenMissing || tokenDoesNotMatch || tokenHasExpired) {
      return res.status(401).json({
        status: 'error',
        message: 'Refresh token is invalid or expired'
      })
    }

    const newSession = await saveLoginSession(user)

    if (req.cookies?.refresh_token) {
      setAuthCookies(res, newSession.accessToken, newSession.refreshToken)
    }

    return res.status(200).json({
      status: 'success',
      access_token: newSession.accessToken,
      refresh_token: newSession.refreshToken
    })
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: error.message || 'Invalid refresh token'
    })
  }
}

const logout = async (req, res) => {
  try {
    const incomingRefreshToken =
      req.body?.refresh_token || req.cookies?.refresh_token

    if (incomingRefreshToken) {
      const decoded = jwt.decode(incomingRefreshToken)
      const userId = decoded?.user?.id

      if (userId) {
        const user = await User.findById(userId)

        if (user && user.refresh_token === incomingRefreshToken) {
          user.refresh_token = undefined
          user.refresh_token_expires_at = undefined
          await user.save()
        }
      }
    }

    clearAuthCookies(res)
    clearCsrfCookies(res)
    clearOauthStateCookie(res)

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    })
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error'
    })
  }
}

module.exports = {
  redirectToGithub,
  githubCallback,
  refreshToken,
  logout
}
