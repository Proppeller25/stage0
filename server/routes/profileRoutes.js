const express = require('express')
const router = express.Router()
const {registerProfile, getProfiles, searchProfiles, getProfileById, deleteProfileById, exportProfiles} = require ('../controllers/profileController')
const auth = require('../middleware/auth')
const checkRole = require('../middleware/role')

const API_VERSION = '1'

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

router.post('/profiles', auth, checkRole('admin'), registerProfile)
router.get('/profiles', auth, checkRole('admin', 'analyst'), getProfiles)
router.get('/profiles/search', auth, checkRole('admin', 'analyst'), searchProfiles)
router.get('/profiles/export', auth, checkRole('admin', 'analyst'), exportProfiles)
router.get('/profiles/:id', auth, checkRole('admin', 'analyst'), getProfileById)
router.delete('/profiles/:id', auth, checkRole('admin'), deleteProfileById)

module.exports = router
