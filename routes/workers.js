const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// GET /api/workers - List available workers with location
router.get('/', async (req, res) => {
    const pool = req.app.locals.pool;
    const { skill, status, lat, lng, radius } = req.query;
    try {
        let where = ['wp.latitude IS NOT NULL', 'wp.longitude IS NOT NULL'];
        let params = [];
        let idx = 1;
        if (status) { where.push(`wp.availability_status=$${idx++}`); params.push(status); }
        else { where.push(`wp.availability_status='available'`); }
        if (skill) { where.push(`$${idx++}=ANY(wp.skills)`); params.push(skill); }

        const r = await pool.query(`SELECT u.id, u.full_name, u.avatar_url, wp.skills, wp.experience_years, wp.hourly_rate_min, wp.hourly_rate_max, wp.availability_status, wp.latitude, wp.longitude, wp.bio, wp.rating, wp.total_jobs_completed, wp.preferred_radius_km
            FROM worker_profiles wp JOIN users u ON wp.user_id=u.id WHERE ${where.join(' AND ')} ORDER BY wp.rating DESC`, params);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/workers/:id
router.get('/:id', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.created_at, wp.* FROM worker_profiles wp JOIN users u ON wp.user_id=u.id WHERE u.id=$1`, [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
        const reviews = await pool.query(`SELECT r.*, u.full_name as reviewer_name FROM reviews r JOIN users u ON r.reviewer_id=u.id WHERE r.reviewee_id=$1 ORDER BY r.created_at DESC LIMIT 10`, [req.params.id]);
        res.json({ ...r.rows[0], reviews: reviews.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/workers/location - Update worker location
router.put('/location', auth, async (req, res) => {
    if (req.user.role !== 'worker') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    const { latitude, longitude } = req.body;
    try {
        await pool.query('UPDATE worker_profiles SET latitude=$1, longitude=$2 WHERE user_id=$3', [latitude, longitude, req.user.id]);
        res.json({ message: 'Location updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/workers/status - Update availability
router.put('/status', auth, async (req, res) => {
    if (req.user.role !== 'worker') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    const { availability_status } = req.body;
    if (!['available', 'busy', 'offline'].includes(availability_status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        await pool.query('UPDATE worker_profiles SET availability_status=$1 WHERE user_id=$2', [availability_status, req.user.id]);
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
