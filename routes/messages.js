const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'gigspot-dev-secret'); next(); }
    catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// POST /api/messages - Send message
router.post('/', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    const { receiver_id, job_id, content } = req.body;
    if (!receiver_id || !content) return res.status(400).json({ error: 'Missing fields' });
    try {
        const r = await pool.query('INSERT INTO messages(sender_id,receiver_id,job_id,content) VALUES($1,$2,$3,$4) RETURNING *', [req.user.id, receiver_id, job_id||null, content]);
        await pool.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'New Message',$2,'info')", [receiver_id, `${req.user.name} sent you a message`]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/conversations - List conversations
router.get('/conversations', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT DISTINCT ON (other_id) * FROM (
            SELECT m.*, CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END as other_id,
            u.full_name as other_name FROM messages m
            JOIN users u ON u.id = CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
            WHERE m.sender_id=$1 OR m.receiver_id=$1 ORDER BY other_id, m.created_at DESC
        ) sub`, [req.user.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/:userId - Get messages with user
router.get('/:userId', auth, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query(`SELECT m.*, u.full_name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE (m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1) ORDER BY m.created_at ASC`, [req.user.id, req.params.userId]);
        await pool.query('UPDATE messages SET read=TRUE WHERE sender_id=$1 AND receiver_id=$2 AND read=FALSE', [req.params.userId, req.user.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
