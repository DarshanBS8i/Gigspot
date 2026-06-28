require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/adapter');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        app.locals.pool = await initDatabase();
        dbInitialized = true;
    }
    next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/reviews', require('./routes/reviews'));

app.get('/api/health', async (req, res) => {
    try { const r = await app.locals.pool.query('SELECT 1 as ok'); res.json({ status: 'ok' }); }
    catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

app.get('/api/categories', async (req, res) => {
    try { const r = await app.locals.pool.query('SELECT * FROM categories ORDER BY name'); res.json(r.rows); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
    try {
        const j = await app.locals.pool.query("SELECT COUNT(*) as count FROM jobs WHERE status='open'");
        const w = await app.locals.pool.query("SELECT COUNT(*) as count FROM worker_profiles WHERE availability_status='available'");
        const p = await app.locals.pool.query("SELECT COUNT(*) as count FROM provider_profiles");
        const a = await app.locals.pool.query("SELECT COUNT(*) as count FROM applications");
        res.json({ open_jobs: parseInt(j.rows[0].count), available_workers: parseInt(w.rows[0].count), total_providers: parseInt(p.rows[0].count), total_applications: parseInt(a.rows[0].count) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    (async () => {
        if (!dbInitialized) {
            const pool = await initDatabase();
            app.locals.pool = pool;
            dbInitialized = true;
        }
        app.listen(PORT, () => {
            console.log(`\n  📍 GigSpot running at http://localhost:${PORT}\n`);
        });
    })();
}

module.exports = app;
