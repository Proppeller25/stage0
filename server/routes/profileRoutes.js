const express = require('express')
const router = express.Router()
const {registerProfile, getProfiles, searchProfiles, getProfileById, deleteProfileById, exportProfiles} = require ('../controllers/profileController')
const auth = require('../middleware/auth')
const checkRole = require('../middleware/role')
const rateLimit = require('../middleware/ratelimit')
const { verifyCsrfToken } = require('../middleware/csrf')

const API_VERSION = '1'
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: 'Too many requests, please try again later.',
  keyPrefix: 'api',
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown'
})

const requireApiVersionHeader = (req, res, next) => {
  if (req.get('X-API-Version') !== API_VERSION) {
    return res.status(400).json({
      status: 'error',
      message: 'API version header required'
    })
  }

  next()
}

router.use('/profiles', requireApiVersionHeader)

router.use('/profiles', auth, apiRateLimit)

router.post('/profiles', verifyCsrfToken, checkRole('admin'), registerProfile)
router.get('/profiles', checkRole('admin', 'analyst'), getProfiles)
router.get('/profiles/search', checkRole('admin', 'analyst'), searchProfiles)
router.get('/profiles/export', checkRole('admin', 'analyst'), exportProfiles)
router.get('/profiles/:id', checkRole('admin', 'analyst'), getProfileById)
router.delete('/profiles/:id', verifyCsrfToken, checkRole('admin'), deleteProfileById)

module.exports = router
