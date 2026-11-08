require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { startScheduler } = require('./scheduler');
const { rateLimit }      = require('./rateLimit');
const pushRoutes    = require('./routes/push');
const accountRoutes = require('./routes/account');

const app  = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits behind a proxy — needed for per-IP rate limiting

// ── CORS: only our frontend may call the API from a browser ─────────────────
const normalize = u => u.trim().replace(/\/+$/, '');
const allowedOrigins = [
  ...(process.env.FRONTEND_URL || '').split(',').filter(Boolean).map(normalize), // comma-separate to allow several (e.g. custom domain)
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '20kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 60, key: req => req.ip })); // global per-IP cap

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/push',    pushRoutes);
app.use('/api/account', accountRoutes);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.message?.startsWith('CORS') ? 403 : 500).json({ error: 'Request failed' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Daily Assistant backend running on port ${PORT}`);
  startScheduler();
});
