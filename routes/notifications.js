const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// GET /api/notifications
router.get('/', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
        const unread = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read=FALSE', [req.user.id]);
        res.json({ notifications: r.rows, unread_count: parseInt(unread.rows[0].count) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        await pool.query('UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
        res.json({ message: 'Marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/read-all
router.put('/read-all', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        await pool.query('UPDATE notifications SET read=TRUE WHERE user_id=$1', [req.user.id]);
        res.json({ message: 'All marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
