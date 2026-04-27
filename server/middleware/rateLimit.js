const buckets = new Map()

const rateLimit = ({
  windowMs = 60_000,
  max = 60,
  message = 'Too many requests, please try again later.',
  keyGenerator,
  keyPrefix
} = {}) => {
  return (req, res, next) => {
    const now = Date.now()
    const baseKey = keyGenerator ? keyGenerator(req) : (req.ip || 'unknown')
    const key = `${keyPrefix || req.path}:${baseKey}`

    let entry = buckets.get(key)
    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + windowMs }
    }

    entry.count += 1
    buckets.set(key, entry)

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetTime - now) / 1000))
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ status: "error", message })
    }

    next()
  }
}

module.exports = rateLimit
