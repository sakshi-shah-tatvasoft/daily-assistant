const supabase = require('./db');

/**
 * Express middleware: requires "Authorization: Bearer <supabase access token>".
 * Verifies the token with Supabase and puts the user on req.user.
 */
async function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Session expired — please sign in again' });
    req.user = data.user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireUser };
