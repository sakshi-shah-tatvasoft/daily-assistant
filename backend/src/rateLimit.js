/** Tiny in-memory fixed-window rate limiter (enough for a single small server). */
function rateLimit({ windowMs, max, key = req => req.user?.id || req.ip }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests — please wait a minute' });
    next();
  };
}

module.exports = { rateLimit };
