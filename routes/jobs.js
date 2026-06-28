const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');

function auth(req, res, next) {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// GET /api/jobs - List jobs with filters
router.get('/', async (req, res) => {
    const pool = req.app.locals.pool;
    const { category_id, status, urgency, pay_min, pay_max, search, lat, lng, radius, limit, offset } = req.query;
    try {
        let where = ['1=1'];
        let params = [];
        let idx = 1;
        if (category_id) { where.push(`j.category_id=$${idx++}`); params.push(category_id); }
        if (status) { where.push(`j.status=$${idx++}`); params.push(status); }
        else { where.push(`j.status='open'`); }
        if (urgency) { where.push(`j.urgency=$${idx++}`); params.push(urgency); }
        if (pay_min) { where.push(`j.pay_rate>=$${idx++}`); params.push(pay_min); }
        if (pay_max) { where.push(`j.pay_rate<=$${idx++}`); params.push(pay_max); }
        if (search) { where.push(`(j.title ILIKE $${idx} OR j.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

        const q = `SELECT j.*, c.name as category_name, c.icon as category_icon, c.color as category_color, u.full_name as provider_name, pp.company_name, pp.verified as provider_verified
            FROM jobs j LEFT JOIN categories c ON j.category_id=c.id LEFT JOIN users u ON j.provider_id=u.id LEFT JOIN provider_profiles pp ON u.id=pp.user_id
            WHERE ${where.join(' AND ')} ORDER BY j.urgency='urgent' DESC, j.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(parseInt(limit)||50, parseInt(offset)||0);
        const result = await pool.query(q, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT j.*, c.name as category_name, c.icon as category_icon, c.color as category_color, u.full_name as provider_name, u.email as provider_email, pp.company_name, pp.verified as provider_verified, pp.rating as provider_rating, pp.total_reviews as provider_total_reviews
            FROM jobs j LEFT JOIN categories c ON j.category_id=c.id LEFT JOIN users u ON j.provider_id=u.id LEFT JOIN provider_profiles pp ON u.id=pp.user_id WHERE j.id=$1`, [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs - Create job (provider only)
router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Only providers can post jobs' });
    const pool = req.app.locals.pool;
    const { title, description, category_id, pay_rate, pay_type, location_name, latitude, longitude, start_date, end_date, start_time, end_time, slots, urgency, requirements, perks } = req.body;
    if (!title || !pay_rate || !latitude || !longitude) return res.status(400).json({ error: 'Missing required fields' });
    try {
        const r = await pool.query(`INSERT INTO jobs(provider_id,title,description,category_id,pay_rate,pay_type,location_name,latitude,longitude,start_date,end_date,start_time,end_time,slots,urgency,requirements,perks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
            [req.user.id, title, description, category_id, pay_rate, pay_type||'hourly', location_name, latitude, longitude, start_date, end_date, start_time, end_time, slots||1, urgency||'normal', requirements, perks||[]]);
        await pool.query('UPDATE provider_profiles SET total_jobs_posted=total_jobs_posted+1 WHERE user_id=$1', [req.user.id]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/jobs/:id
router.put('/:id', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    const { title, description, category_id, pay_rate, pay_type, location_name, latitude, longitude, start_date, end_date, start_time, end_time, slots, urgency, status, requirements, perks } = req.body;
    try {
        const r = await pool.query(`UPDATE jobs SET title=COALESCE($1,title),description=COALESCE($2,description),category_id=COALESCE($3,category_id),pay_rate=COALESCE($4,pay_rate),pay_type=COALESCE($5,pay_type),location_name=COALESCE($6,location_name),latitude=COALESCE($7,latitude),longitude=COALESCE($8,longitude),start_date=COALESCE($9,start_date),end_date=COALESCE($10,end_date),start_time=COALESCE($11,start_time),end_time=COALESCE($12,end_time),slots=COALESCE($13,slots),urgency=COALESCE($14,urgency),status=COALESCE($15,status),requirements=COALESCE($16,requirements) WHERE id=$17 AND provider_id=$18 RETURNING *`,
            [title, description, category_id, pay_rate, pay_type, location_name, latitude, longitude, start_date, end_date, start_time, end_time, slots, urgency, status, requirements, req.params.id, req.user.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Job not found or unauthorized' });
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/jobs/:id
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query('DELETE FROM jobs WHERE id=$1 AND provider_id=$2 RETURNING id', [req.params.id, req.user.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Job deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jobs/provider/mine - My posted jobs
router.get('/provider/mine', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT j.*, c.name as category_name, c.icon as category_icon, (SELECT COUNT(*) FROM applications WHERE job_id=j.id) as application_count FROM jobs j LEFT JOIN categories c ON j.category_id=c.id WHERE j.provider_id=$1 ORDER BY j.created_at DESC`, [req.user.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs/:id/save - Save/bookmark job
router.post('/:id/save', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        await pool.query('INSERT INTO saved_jobs(worker_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
        res.json({ message: 'Job saved' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/jobs/:id/save
router.delete('/:id/save', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        await pool.query('DELETE FROM saved_jobs WHERE worker_id=$1 AND job_id=$2', [req.user.id, req.params.id]);
        res.json({ message: 'Removed' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jobs/saved/list
router.get('/saved/list', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT j.*, c.name as category_name, c.icon as category_icon FROM saved_jobs s JOIN jobs j ON s.job_id=j.id LEFT JOIN categories c ON j.category_id=c.id WHERE s.worker_id=$1 ORDER BY s.saved_at DESC`, [req.user.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
