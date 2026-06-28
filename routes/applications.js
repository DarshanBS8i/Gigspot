const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// POST /api/applications - Apply for a job
router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can apply' });
    const pool = req.app.locals.pool;
    const { job_id, message } = req.body;
    try {
        const job = await pool.query('SELECT * FROM jobs WHERE id=$1 AND status=$2', [job_id, 'open']);
        if (job.rows.length === 0) return res.status(404).json({ error: 'Job not found or closed' });
        const r = await pool.query('INSERT INTO applications(job_id,worker_id,message) VALUES($1,$2,$3) RETURNING *', [job_id, req.user.id, message]);
        // Notify provider
        await pool.query("INSERT INTO notifications(user_id,title,message,type,reference_id,reference_type) VALUES($1,$2,$3,'application',$4,'application')",
            [job.rows[0].provider_id, 'New Application', `${req.user.name} applied for "${job.rows[0].title}"`, r.rows[0].id]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Already applied' });
        res.status(500).json({ error: err.message });
    }
});

// GET /api/applications/my - My applications (worker)
router.get('/my', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT a.*, j.title as job_title, j.pay_rate, j.pay_type, j.location_name, j.status as job_status, c.name as category_name, c.icon as category_icon, u.full_name as provider_name
            FROM applications a JOIN jobs j ON a.job_id=j.id LEFT JOIN categories c ON j.category_id=c.id LEFT JOIN users u ON j.provider_id=u.id WHERE a.worker_id=$1 ORDER BY a.applied_at DESC`, [req.user.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/applications/job/:jobId - Applications for a job (provider)
router.get('/job/:jobId', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT a.*, u.full_name as worker_name, u.email as worker_email, u.phone as worker_phone, wp.skills, wp.experience_years, wp.rating as worker_rating, wp.total_jobs_completed, wp.bio
            FROM applications a JOIN users u ON a.worker_id=u.id LEFT JOIN worker_profiles wp ON u.id=wp.user_id WHERE a.job_id=$1 ORDER BY a.applied_at DESC`, [req.params.jobId]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/applications/:id/status - Accept/reject application (provider)
router.put('/:id/status', auth, async (req, res) => {
    if (req.user.role !== 'provider') return res.status(403).json({ error: 'Forbidden' });
    const pool = req.app.locals.pool;
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        const app = await pool.query(`SELECT a.*, j.title, j.provider_id FROM applications a JOIN jobs j ON a.job_id=j.id WHERE a.id=$1`, [req.params.id]);
        if (app.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        if (app.rows[0].provider_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        await pool.query('UPDATE applications SET status=$1 WHERE id=$2', [status, req.params.id]);
        if (status === 'accepted') {
            await pool.query('UPDATE jobs SET filled_slots=filled_slots+1 WHERE id=$1', [app.rows[0].job_id]);
        }
        await pool.query("INSERT INTO notifications(user_id,title,message,type,reference_id,reference_type) VALUES($1,$2,$3,'application',$4,'application')",
            [app.rows[0].worker_id, `Application ${status}`, `Your application for "${app.rows[0].title}" was ${status}`, req.params.id]);
        res.json({ message: `Application ${status}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/applications/:id - Withdraw application
router.delete('/:id', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        await pool.query('DELETE FROM applications WHERE id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
        res.json({ message: 'Withdrawn' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
