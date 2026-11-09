// Local stand-in for Vercel's function runtime: serves frontend/api/**/*.js on PORT (default 3001).
// Usage: node scripts/dev-api.mjs   (with SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_*, CRON_SECRET in env)
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'api');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, url.pathname.replace(/^\/api\//, '') + '.js');
  if (!file.startsWith(root) || path.relative(root, file).split(path.sep).some(p => p.startsWith('_')) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  let raw = ''; for await (const c of req) raw += c;
  req.body = raw ? JSON.parse(raw) : undefined;
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
  try { (await import(pathToFileURL(file).href)).default(req, res); }
  catch (e) { console.error(e); res.statusCode = 500; res.end(); }
}).listen(process.env.PORT || 3001, () => console.log('dev api on', process.env.PORT || 3001));
