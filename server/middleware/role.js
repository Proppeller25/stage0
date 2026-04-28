const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. Ensure user is authenticated (req.user is typically set by auth middleware)
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: "Authentication required" })
    }

    // 2. Check if user's role matches any of the allowed roles
    const hasRole = allowedRoles.includes(req.user.role)
    
    if (!hasRole) {
      return res.status(403).json({ status: 'error', message: "Access denied: insufficient permissions" })
    }

    // 3. Authorized, proceed to the next handler
    next()
  }
}

module.exports = checkRole
