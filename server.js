// ============================================================
// Encom Weekly Performance Tracker — server.js
// Zero external dependencies — uses only Node.js built-ins
// ============================================================

// ── Global error handlers (prevent silent crashes on Render) ─
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // Don't exit — keep the server alive
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  // Don't exit — keep the server alive
});

const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');

const PORT       = parseInt(process.env.PORT, 10) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'encom-tracker-2024-secret';

console.log(`[BOOT] Node ${process.version} | PORT=${PORT} | NODE_ENV=${process.env.NODE_ENV || 'development'}`);

// ── Database (JSON files) ────────────────────────────────────
// DATA_DIR can be overridden via env var (useful for Render persistent disk)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn('[WARN] No se pudo crear el directorio de datos:', e.message);
}

function readDB(col) {
  const f = path.join(DATA_DIR, `${col}.json`);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; }
}
function writeDB(col, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${col}.json`), JSON.stringify(data, null, 2));
}
function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ── Crypto helpers ───────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

function makeJWT(payload) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 604800 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (expected !== parts[2]) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ── Helpers ──────────────────────────────────────────────────
function getWeekStart(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetWeeks * 7);
  const day  = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function calcComposite(plan, review) {
  if (!review) return null;
  const perf    = (review.performance_score / 5) * 10;
  const comp    = review.tasks_completed_pct / 10;
  const mood    = (review.mood_next_week / 5) * 10;
  const blkPen  = (review.blockers || '').trim().length > 10 ? -1 : 0;
  const planPen = !plan ? -1.5 : 0;
  return Math.max(0, Math.min(10, Math.round((perf * 0.4 + comp * 0.4 + mood * 0.2 + blkPen + planPen) * 10) / 10));
}

function calcStatus(userId) {
  const weekStart = getWeekStart();
  const plans     = readDB('monday_plans');
  const reviews   = readDB('friday_reviews');
  const cp = plans.find(p => p.user_id === userId && p.week_start === weekStart) || null;
  const cr = reviews.find(r => r.user_id === userId && r.week_start === weekStart) || null;
  const score = calcComposite(cp, cr);

  const pastScores = [];
  for (let i = 1; i <= 3; i++) {
    const ws = getWeekStart(i);
    const r  = reviews.find(x => x.user_id === userId && x.week_start === ws);
    const p  = plans.find(x => x.user_id === userId && x.week_start === ws);
    if (r) pastScores.push(calcComposite(p, r));
  }

  let color = 'gray', trend = 'stable';
  if (score !== null) {
    color = score >= 6.5 ? 'green' : score >= 3.5 ? 'yellow' : 'red';
  }
  // Trend: compare current (or last week if no current) vs prior weeks avg
  const trendScore = score !== null ? score : (pastScores.length > 0 ? pastScores[0] : null);
  const trendBase  = score !== null ? pastScores : pastScores.slice(1);
  if (trendScore !== null && trendBase.length >= 1) {
    const avg = trendBase.reduce((a, b) => a + b, 0) / trendBase.length;
    if (trendScore > avg + 1.0) trend = 'up';
    else if (trendScore < avg - 1.0) trend = 'down';
  }

  const patterns = [];
  const allScores = score !== null ? [score, ...pastScores] : pastScores;
  if (allScores.length >= 3) {
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    if (avg < 4)  patterns.push({ type: 'low',           label: 'Rendimiento bajo sostenido' });
    if (avg > 7)  patterns.push({ type: 'high',          label: 'Alto rendimiento consistente' });
    const v = allScores.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / allScores.length;
    if (v > 5) patterns.push({ type: 'inconsistent', label: 'Rendimiento inconsistente' });
  }
  if (trend === 'down' && pastScores.length >= 2) patterns.push({ type: 'declining', label: 'Tendencia a la baja' });
  if (trend === 'up'   && pastScores.length >= 2) patterns.push({ type: 'improving', label: 'Mejora continua' });

  let blockerCount = 0;
  for (let i = 0; i <= 3; i++) {
    const ws = getWeekStart(i);
    const r  = reviews.find(x => x.user_id === userId && x.week_start === ws);
    const p  = plans.find(x => x.user_id === userId && x.week_start === ws);
    if ((r?.blockers || '').trim().length > 10 || (p?.known_blockers || '').trim().length > 10) blockerCount++;
  }
  if (blockerCount >= 3) patterns.push({ type: 'blockers', label: 'Bloqueos recurrentes (3+ semanas)' });

  return {
    color, score, trend, patterns,
    hasPlan: !!cp, hasReview: !!cr, weekStart,
    currentPlanData: cp, currentReviewData: cr
  };
}

// ── HTTP Router ──────────────────────────────────────────────
const routes = {};
function route(method, path, handler) {
  routes[`${method}:${path}`] = handler;
}

function readBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { res(JSON.parse(data || '{}')); } catch { res({}); }
    });
    req.on('error', rej);
  });
}

function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return verifyJWT(token);
}

// ── Routes ───────────────────────────────────────────────────

// POST /api/auth/login
route('POST', '/api/auth/login', async (req, res) => {
  const { email, password } = await readBody(req);
  if (!email || !password) return respond(res, 400, { error: 'Faltan campos' });
  const users = readDB('users');
  const user  = users.find(u => u.email === email.toLowerCase().trim());
  if (!user) return respond(res, 401, { error: 'Credenciales incorrectas' });
  let ok = false;
  try { ok = verifyPassword(password, user.password_hash); } catch { ok = false; }
  if (!ok) return respond(res, 401, { error: 'Credenciales incorrectas' });
  const token = makeJWT({ id: user.id, email: user.email, name: user.name, role: user.role });
  respond(res, 200, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// GET /api/me/status
route('GET', '/api/me/status', async (req, res) => {
  const user = getUser(req);
  if (!user) return respond(res, 401, { error: 'No autenticado' });
  const weekStart = getWeekStart();
  const plans   = readDB('monday_plans');
  const reviews = readDB('friday_reviews');
  respond(res, 200, {
    weekStart,
    hasPlan:   plans.some(p => p.user_id === user.id && p.week_start === weekStart),
    hasReview: reviews.some(r => r.user_id === user.id && r.week_start === weekStart),
    dayOfWeek: new Date().getDay(),
  });
});

// POST /api/forms/monday
route('POST', '/api/forms/monday', async (req, res) => {
  const user = getUser(req);
  if (!user) return respond(res, 401, { error: 'No autenticado' });
  const body = await readBody(req);
  if (!body.tasks?.trim()) return respond(res, 400, { error: 'Debes describir tus tareas' });
  const weekStart = getWeekStart();
  const plans = readDB('monday_plans');
  if (plans.some(p => p.user_id === user.id && p.week_start === weekStart))
    return respond(res, 400, { error: 'Ya enviaste el plan de esta semana' });
  const plan = {
    id: genId(), user_id: user.id, week_start: weekStart,
    tasks: body.tasks, clarity_level: +body.clarity_level || 3,
    known_blockers: body.has_blockers ? (body.known_blockers || '') : '',
    task_importance: +body.task_importance || 3,
    needs_from_encom: body.needs_from_encom || '',
    created_at: new Date().toISOString()
  };
  plans.push(plan);
  writeDB('monday_plans', plans);
  respond(res, 200, { success: true });
});

// POST /api/forms/friday
route('POST', '/api/forms/friday', async (req, res) => {
  const user = getUser(req);
  if (!user) return respond(res, 401, { error: 'No autenticado' });
  const body = await readBody(req);
  const weekStart = getWeekStart();
  const reviews = readDB('friday_reviews');
  if (reviews.some(r => r.user_id === user.id && r.week_start === weekStart))
    return respond(res, 400, { error: 'Ya enviaste la revisión de esta semana' });
  const review = {
    id: genId(), user_id: user.id, week_start: weekStart,
    tasks_completed_pct: +body.tasks_completed_pct || 0,
    performance_score:   +body.performance_score || 3,
    blockers:      body.blockers || '',
    uncertainties: body.uncertainties || '',
    achievements:  body.achievements || '',
    mood_next_week: +body.mood_next_week || 3,
    created_at: new Date().toISOString()
  };
  reviews.push(review);
  writeDB('friday_reviews', reviews);
  respond(res, 200, { success: true });
});

// GET /api/admin/employees
route('GET', '/api/admin/employees', async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  const employees = readDB('users').filter(u => u.role === 'employee');
  const result = employees.map(u => {
    const s = calcStatus(u.id);
    return { id: u.id, name: u.name, email: u.email, ...s };
  });
  const ord = { red: 0, yellow: 1, green: 2, gray: 3 };
  result.sort((a, b) => (ord[a.color] ?? 4) - (ord[b.color] ?? 4));
  respond(res, 200, result);
});

// GET /api/admin/employee/:id
route('GET', '/api/admin/employee/', async (req, res, id) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  const users = readDB('users');
  const emp   = users.find(u => u.id === id);
  if (!emp) return respond(res, 404, { error: 'No encontrado' });
  const plans   = readDB('monday_plans').filter(p => p.user_id === id);
  const reviews = readDB('friday_reviews').filter(r => r.user_id === id);
  const allWeeks = [...new Set([...plans.map(p => p.week_start), ...reviews.map(r => r.week_start)])].sort().reverse();
  const history = allWeeks.map(week => {
    const plan   = plans.find(p => p.week_start === week) || null;
    const review = reviews.find(r => r.week_start === week) || null;
    return { week, plan, review, score: calcComposite(plan, review) };
  });
  respond(res, 200, { user: { id: emp.id, name: emp.name, email: emp.email }, status: calcStatus(id), history });
});

// GET /api/admin/alerts
route('GET', '/api/admin/alerts', async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  const employees = readDB('users').filter(u => u.role === 'employee');
  const weekStart = getWeekStart();
  const today     = new Date().getDay();
  const alerts    = [];
  employees.forEach(u => {
    const s = calcStatus(u.id);
    if (!s.hasPlan && today > 1)
      alerts.push({ type: 'missing_plan', severity: 'medium', user: { id: u.id, name: u.name }, message: 'No ha enviado el plan semanal' });
    if (today >= 5 && !s.hasReview)
      alerts.push({ type: 'missing_review', severity: 'medium', user: { id: u.id, name: u.name }, message: 'No ha enviado la revisión del viernes' });
    const pb = (s.currentPlanData?.known_blockers || '').trim();
    if (pb.length > 5)
      alerts.push({ type: 'blocker', severity: 'high', user: { id: u.id, name: u.name }, message: `Bloqueo anticipado: ${pb.slice(0, 120)}` });
    const rb = (s.currentReviewData?.blockers || '').trim();
    if (rb.length > 5)
      alerts.push({ type: 'blocker', severity: 'high', user: { id: u.id, name: u.name }, message: `Bloqueo reportado: ${rb.slice(0, 120)}` });
    if (s.color === 'red')
      alerts.push({ type: 'low_performance', severity: 'critical', user: { id: u.id, name: u.name },
        message: `Rendimiento crítico${s.score !== null ? ` (${s.score}/10)` : ''}` });
    (s.patterns || []).filter(p => p.type === 'declining' || p.type === 'blockers').forEach(p =>
      alerts.push({ type: 'pattern', severity: 'high', user: { id: u.id, name: u.name }, message: p.label }));
  });
  const sev = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4));
  respond(res, 200, alerts);
});

// GET /api/admin/export — CSV export with optional date filters
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?weeks=4  (default: all)
route('GET', '/api/admin/export', async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });

  const parsed  = url.parse(req.url, true);
  const { from, to, weeks } = parsed.query;

  const employees = readDB('users').filter(u => u.role === 'employee');
  const plans     = readDB('monday_plans');
  const reviews   = readDB('friday_reviews');

  // Collect all unique week starts
  let allWeeks = [...new Set([
    ...plans.map(p => p.week_start),
    ...reviews.map(r => r.week_start),
  ])].sort();

  // Apply filters
  if (from) allWeeks = allWeeks.filter(w => w >= from);
  if (to)   allWeeks = allWeeks.filter(w => w <= to);
  if (weeks && !from && !to) {
    const n = parseInt(weeks, 10);
    allWeeks = allWeeks.slice(-n);
  }

  // CSV header
  const cols = [
    'Semana','Empleado','Email',
    'Tareas_Lunes','Claridad_Objetivos','Bloqueo_Anticipado','Importancia_Estrategica','Necesidades_Encom',
    'Pct_Tareas_Completadas','Autopuntuacion_1_5','Bloqueos_Viernes','Incertidumbres','Logro_Principal','Animo_Proxima_Semana',
    'Score_Composite_0_10','Plan_Enviado','Revision_Enviada'
  ];

  function esc(v) {
    if (v == null || v === '') return '';
    const s = String(v).replace(/\r?\n/g, ' | ').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes(';') ? `"${s}"` : s;
  }

  const rows = [cols.join(',')];

  for (const week of allWeeks) {
    for (const emp of employees) {
      const plan   = plans.find(p => p.user_id === emp.id && p.week_start === week)   || null;
      const review = reviews.find(r => r.user_id === emp.id && r.week_start === week) || null;
      const score  = calcComposite(plan, review);
      rows.push([
        esc(week), esc(emp.name), esc(emp.email),
        esc(plan?.tasks),
        esc(plan?.clarity_level),
        esc(plan?.known_blockers),
        esc(plan?.task_importance),
        esc(plan?.needs_from_encom),
        esc(review?.tasks_completed_pct),
        esc(review?.performance_score),
        esc(review?.blockers),
        esc(review?.uncertainties),
        esc(review?.achievements),
        esc(review?.mood_next_week),
        esc(score),
        esc(plan ? 'Sí' : 'No'),
        esc(review ? 'Sí' : 'No'),
      ].join(','));
    }
  }

  const csv = rows.join('\r\n');
  const filename = `encom_tracker_${from || ''}${from && to ? '_' : ''}${to || ''}${weeks ? `ultimas${weeks}semanas` : ''}_${new Date().toISOString().split('T')[0]}.csv`;

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  });
  res.end('\uFEFF' + csv); // BOM for Excel UTF-8
});

// GET /api/health — Render health check
route('GET', '/api/health', async (req, res) => {
  respond(res, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
});

// POST /api/admin/create-user
route('POST', '/api/admin/create-user', async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  const { email, name, password } = await readBody(req);
  if (!email || !name || !password) return respond(res, 400, { error: 'Faltan campos' });
  const users = readDB('users');
  if (users.find(u => u.email === email.toLowerCase())) return respond(res, 400, { error: 'Email ya registrado' });
  const newUser = { id: genId(), email: email.toLowerCase(), name, password_hash: hashPassword(password), role: 'employee', created_at: new Date().toISOString() };
  users.push(newUser);
  writeDB('users', users);
  respond(res, 200, { success: true, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
});

// PUT /api/admin/user/:id — edit user (name, email, password)
route('PUT', '/api/admin/user/', async (req, res, id) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  const { name, email, password } = await readBody(req);
  const users = readDB('users');
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return respond(res, 404, { error: 'Usuario no encontrado' });
  if (name?.trim()) users[idx].name = name.trim();
  if (email?.trim()) {
    const emailLow = email.toLowerCase().trim();
    if (emailLow !== users[idx].email && users.find(u => u.email === emailLow)) {
      return respond(res, 400, { error: 'Ese email ya está registrado' });
    }
    users[idx].email = emailLow;
  }
  if (password && password.length >= 6) {
    users[idx].password_hash = hashPassword(password);
  }
  writeDB('users', users);
  respond(res, 200, { success: true, user: { id: users[idx].id, email: users[idx].email, name: users[idx].name } });
});

// DELETE /api/admin/user/:id — delete user and all their form data
route('DELETE', '/api/admin/user/', async (req, res, id) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return respond(res, 403, { error: 'Solo administradores' });
  if (id === user.id) return respond(res, 400, { error: 'No puedes eliminar tu propio usuario' });
  const users = readDB('users');
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return respond(res, 404, { error: 'Usuario no encontrado' });
  users.splice(idx, 1);
  writeDB('users', users);
  // Remove all form data for this user
  writeDB('monday_plans',   readDB('monday_plans').filter(p => p.user_id !== id));
  writeDB('friday_reviews', readDB('friday_reviews').filter(r => r.user_id !== id));
  respond(res, 200, { success: true });
});

// ── Static file server ───────────────────────────────────────
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon' };

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Main HTTP server ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      return res.end();
    }

    const parsed   = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // API routing
    if (pathname.startsWith('/api/')) {
      const method = req.method;

      // Exact match
      const exactKey = `${method}:${pathname}`;
      if (routes[exactKey]) return await routes[exactKey](req, res);

      // Prefix match (for :id routes)
      for (const [key, handler] of Object.entries(routes)) {
        const colonIdx = key.indexOf(':');
        const m = key.slice(0, colonIdx);
        const p = key.slice(colonIdx + 1);
        if (m === method && p.endsWith('/') && pathname.startsWith(p)) {
          const id = pathname.slice(p.length);
          return await handler(req, res, id);
        }
      }

      return respond(res, 404, { error: 'Not found' });
    }

    // Static files
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    // For SPA: serve index.html for unknown paths
    if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'public', 'index.html');
    serveStatic(req, res, filePath);
  } catch (err) {
    console.error('[ERROR]', req.method, req.url, err);
    if (!res.headersSent) {
      respond(res, 500, { error: 'Error interno del servidor' });
    }
  }
});

// ── Email (optional, logged to console if not configured) ────
let emailCfg = null;
const cfgPath = path.join(__dirname, 'email.config.json');
if (fs.existsSync(cfgPath)) {
  try { emailCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
}

function sendEmailLog(to, subject) {
  console.log(`[EMAIL] → ${to} | ${subject}`);
}

// Cron: check every minute for scheduled email tasks
let lastMondayReminder = '', lastFridayReminder = '', lastMondayAlert = '', lastFridayAlert = '';
setInterval(() => {
  const now  = new Date();
  const day  = now.getDay();
  const hour = now.getHours();
  const dateKey = now.toISOString().split('T')[0];

  // Monday 9am: remind employees
  if (day === 1 && hour === 9 && lastMondayReminder !== dateKey) {
    lastMondayReminder = dateKey;
    const emps = readDB('users').filter(u => u.role === 'employee');
    emps.forEach(u => sendEmailLog(u.email, '📋 Encom: Completa tu plan semanal'));
    console.log(`[CRON] Recordatorio del lunes enviado a ${emps.length} personas`);
  }
  // Friday 9am: remind employees
  if (day === 5 && hour === 9 && lastFridayReminder !== dateKey) {
    lastFridayReminder = dateKey;
    const emps = readDB('users').filter(u => u.role === 'employee');
    emps.forEach(u => sendEmailLog(u.email, '✅ Encom: Completa tu revisión semanal'));
    console.log(`[CRON] Recordatorio del viernes enviado a ${emps.length} personas`);
  }
  // Monday 5pm: alert admin of missing plans
  if (day === 1 && hour === 17 && lastMondayAlert !== dateKey) {
    lastMondayAlert = dateKey;
    const weekStart = getWeekStart();
    const emps      = readDB('users').filter(u => u.role === 'employee');
    const plans     = readDB('monday_plans');
    const missing   = emps.filter(u => !plans.some(p => p.user_id === u.id && p.week_start === weekStart));
    if (missing.length > 0) {
      console.log(`[CRON] ⚠️  ${missing.length} persona(s) sin plan semanal: ${missing.map(u => u.name).join(', ')}`);
      sendEmailLog('javier@encom.es', `⚠️ Encom: ${missing.length} persona(s) sin plan semanal`);
    }
  }
  // Friday 5pm: alert admin of missing reviews
  if (day === 5 && hour === 17 && lastFridayAlert !== dateKey) {
    lastFridayAlert = dateKey;
    const weekStart = getWeekStart();
    const emps      = readDB('users').filter(u => u.role === 'employee');
    const reviews   = readDB('friday_reviews');
    const missing   = emps.filter(u => !reviews.some(r => r.user_id === u.id && r.week_start === weekStart));
    if (missing.length > 0) {
      console.log(`[CRON] ⚠️  ${missing.length} persona(s) sin revisión: ${missing.map(u => u.name).join(', ')}`);
      sendEmailLog('javier@encom.es', `⚠️ Encom: ${missing.length} persona(s) sin revisión semanal`);
    }
  }
}, 60_000); // check every minute

// ── Start ────────────────────────────────────────────────────
server.on('error', (err) => {
  console.error('[SERVER ERROR]', err);
});

server.listen(PORT, '0.0.0.0', () => {
  const addr = server.address();
  console.log(`\n[OK] Servidor escuchando en 0.0.0.0:${addr.port}`);
  console.log(`[OK] Encom Tracker listo → puerto ${addr.port}`);
  console.log(`[OK] Email: ${emailCfg ? 'Configurado' : 'No configurado'}`);
});
