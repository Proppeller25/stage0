const jwt = require('jsonwebtoken')
const User = require('../models/userModel')

const auth = async (req, res, next) => {
  const bearerToken = req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  const token = req.cookies?.Authorization || req.cookies?.access_token || bearerToken

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'No token, authorization denied' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userId = decoded?.user?.id || decoded?.id

    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Token is not valid' })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' })
    }

    if (!user.is_active) {
      return res.status(403).json({ status: 'error', message: 'User account is inactive' })
    }

    req.user = user
    return next()
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Token is not valid' })
  }
}

module.exports = auth
