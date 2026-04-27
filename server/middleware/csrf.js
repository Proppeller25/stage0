const Tokens = require('csrf')
const tokens = new Tokens()

const isProduction = process.env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production'

function getCookieOptions() {
  return {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  }
}

// Names for our cookies
const SECRET_COOKIE_NAME = 'csrfSecret'     // httpOnly, signed
const TOKEN_COOKIE_NAME = 'XSRF-TOKEN'      // plain, readable by JS
const TOKEN_HEADER_NAME = 'x-xsrf-token'    // header name frontend will use

function isCookieBasedRequest(req) {
  return Boolean(
    req.cookies?.access_token ||
    req.cookies?.refresh_token ||
    req.signedCookies?.[SECRET_COOKIE_NAME]
  )
}

// Generate both cookies (call this after login)
function setCsrfCookies(res) {
  const secret = tokens.secretSync()               // generate a random secret
  const cookieOptions = getCookieOptions()
  // Store secret in a signed, httpOnly cookie
  res.cookie(SECRET_COOKIE_NAME, secret, {
    httpOnly: true,
    ...cookieOptions,
    signed: true           // cookie-parser will sign it
  })
  // Create a token from the secret and send it as a plain cookie
  const token = tokens.create(secret)
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: false,       // JavaScript can read it
    ...cookieOptions
  })
  return token
}

function getCsrfToken(req, res) {
  const signedCookies = req.signedCookies || {}
  const secret = signedCookies[SECRET_COOKIE_NAME]

  if (!secret) {
    return setCsrfCookies(res)
  }

  const token = tokens.create(secret)
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: false,
    ...getCookieOptions()
  })
  return token
}

// Remove both cookies (call this on logout)
function clearCsrfCookies(res) {
  const cookieOptions = getCookieOptions()
  res.clearCookie(SECRET_COOKIE_NAME, cookieOptions)
  res.clearCookie(TOKEN_COOKIE_NAME, cookieOptions)
}

// Make sure a secret exists (for new visitors before login)
function ensureCsrfSecret(req, res, next) {
  const signedCookies = req.signedCookies || {}

  if (!signedCookies[SECRET_COOKIE_NAME]) {
    setCsrfCookies(res)
  }
  next()
}

// Verify that the request includes a valid token (for POST, PUT, DELETE)
function verifyCsrfToken(req, res, next) {
  // Skip GET, HEAD, OPTIONS (they are safe)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next()
  }

  // Only enforce CSRF for browser-style cookie auth flows.
  if (!isCookieBasedRequest(req)) {
    return next()
  }

  const signedCookies = req.signedCookies || {}
  const secret = signedCookies[SECRET_COOKIE_NAME]
  const tokenFromHeader = req.headers[TOKEN_HEADER_NAME]

  if (!secret || !tokenFromHeader) {
    return res.status(403).json({ status: 'error', message: 'CSRF tokens missing' })
  }

  if (!tokens.verify(secret, tokenFromHeader)) {
    return res.status(403).json({ status: 'error', message: 'Invalid CSRF token' })
  }
  
  next()
}

module.exports = {
  getCookieOptions,
  getCsrfToken,
  setCsrfCookies,
  clearCsrfCookies,
  ensureCsrfSecret,
  verifyCsrfToken,
  isCookieBasedRequest
}
