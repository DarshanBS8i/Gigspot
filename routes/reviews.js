const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// POST /api/reviews
router.post('/', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    const { reviewee_id, job_id, rating, comment } = req.body;
    if (!reviewee_id || !job_id || !rating) return res.status(400).json({ error: 'Missing fields' });
    try {
        const r = await pool.query('INSERT INTO reviews(reviewer_id,reviewee_id,job_id,rating,comment) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.id, reviewee_id, job_id, rating, comment]);
        // Update average rating
        const avg = await pool.query('SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*) as total FROM reviews WHERE reviewee_id=$1', [reviewee_id]);
        const reviewee = await pool.query('SELECT role FROM users WHERE id=$1', [reviewee_id]);
        if (reviewee.rows[0]?.role === 'provider') {
            await pool.query('UPDATE provider_profiles SET rating=$1, total_reviews=$2 WHERE user_id=$3', [avg.rows[0].avg_rating, avg.rows[0].total, reviewee_id]);
        } else {
            await pool.query('UPDATE worker_profiles SET rating=$1, total_reviews=$2 WHERE user_id=$3', [avg.rows[0].avg_rating, avg.rows[0].total, reviewee_id]);
        }
        await pool.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'New Review',$2,'review')", [reviewee_id, `${req.user.name} left a ${rating}-star review`]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Already reviewed' });
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reviews/user/:userId
router.get('/user/:userId', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT r.*, u.full_name as reviewer_name FROM reviews r JOIN users u ON r.reviewer_id=u.id WHERE r.reviewee_id=$1 ORDER BY r.created_at DESC`, [req.params.userId]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
