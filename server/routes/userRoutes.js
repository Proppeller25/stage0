const express = require('express')
const router = express.Router()
const rateLimit = require('../middleware/ratelimit')
const { ensureCsrfSecret, verifyCsrfToken } = require('../middleware/csrf')
const {
  redirectToGithub,
  githubCallback,
  refreshToken,
  logout,
  cliLoginWithToken
} = require('../controllers/userController')

const authRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: 'Too many auth requests, please try again later.',
  keyPrefix: 'auth'
})

router.use('/auth', authRateLimit)

router.get('/auth/github', ensureCsrfSecret, redirectToGithub)
router.get('/auth/github/callback', githubCallback)
router.post('/auth/refresh', verifyCsrfToken, refreshToken)
router.post('/auth/logout', verifyCsrfToken, logout)
router.post('/auth/cli/login', cliLoginWithToken)

module.exports = router
