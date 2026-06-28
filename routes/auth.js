const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gigspot-dev-secret';

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

router.post('/register', async (req, res) => {
    const pool = req.app.locals.pool;
    const { email, password, full_name, phone, role } = req.body;
    if (!email || !password || !full_name || !role) return res.status(400).json({ error: 'Missing required fields' });
    if (!['provider', 'worker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const client = await pool.connect();
    try {
        const existing = await client.query('SELECT id FROM users WHERE email=$1', [email]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
        const hash = await bcrypt.hash(password, 10);
        await client.query('BEGIN');
        const verifyToken = crypto.randomBytes(20).toString('hex');
        const u = await client.query('INSERT INTO users(email,password_hash,full_name,phone,role,verification_token) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,full_name,role', [email, hash, full_name, phone||null, role, verifyToken]);
        const user = u.rows[0];
        if (role === 'provider') await client.query('INSERT INTO provider_profiles(user_id,company_name) VALUES($1,$2)', [user.id, req.body.company_name||full_name]);
        else await client.query('INSERT INTO worker_profiles(user_id,skills) VALUES($1,$2)', [user.id, req.body.skills||[]]);
        await client.query('COMMIT');
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.headers.host}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your GigSpot Account',
            html: `<p>Welcome to GigSpot!</p><p>Please click this link to verify your account: <a href="${baseUrl}/?verify=${verifyToken}">Verify Account</a></p>`
        };
        try {
            await transporter.sendMail(mailOptions);
        } catch (mailErr) {
            console.error('Failed to send verification email:', mailErr);
        }
        await pool.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Welcome to GigSpot!','Please verify your email address.','info')", [user.id]);
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ user, token, message: 'Please check your email to verify your account.' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

router.post('/login', async (req, res) => {
    const pool = req.app.locals.pool;
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    try {
        const r = await pool.query('SELECT id,email,password_hash,full_name,phone,role,avatar_url,created_at FROM users WHERE email=$1 AND is_active=TRUE', [email]);
        if (r.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = r.rows[0];
        if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
        await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
        let profile = null;
        if (user.role === 'provider') { const p = await pool.query('SELECT * FROM provider_profiles WHERE user_id=$1', [user.id]); profile = p.rows[0]; }
        else { const w = await pool.query('SELECT * FROM worker_profiles WHERE user_id=$1', [user.id]); profile = w.rows[0]; }
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
        delete user.password_hash;
        res.json({ user, profile, token });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const r = await pool.query('SELECT id,email,full_name,phone,role,avatar_url,created_at FROM users WHERE id=$1', [req.user.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const user = r.rows[0];
        let profile = null;
        if (user.role === 'provider') { const p = await pool.query('SELECT * FROM provider_profiles WHERE user_id=$1', [user.id]); profile = p.rows[0]; }
        else { const w = await pool.query('SELECT * FROM worker_profiles WHERE user_id=$1', [user.id]); profile = w.rows[0]; }
        res.json({ user, profile });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', authMiddleware, async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const { full_name, phone } = req.body;
        if (full_name) await pool.query('UPDATE users SET full_name=$1 WHERE id=$2', [full_name, req.user.id]);
        if (phone) await pool.query('UPDATE users SET phone=$1 WHERE id=$2', [phone, req.user.id]);
        if (req.user.role === 'provider') {
            const { company_name, business_type, description, website, address, latitude, longitude } = req.body;
            await pool.query('UPDATE provider_profiles SET company_name=COALESCE($1,company_name),business_type=COALESCE($2,business_type),description=COALESCE($3,description),website=COALESCE($4,website),address=COALESCE($5,address),latitude=COALESCE($6,latitude),longitude=COALESCE($7,longitude) WHERE user_id=$8', [company_name, business_type, description, website, address, latitude, longitude, req.user.id]);
        } else {
            const { skills, experience_years, hourly_rate_min, hourly_rate_max, availability_status, latitude, longitude, bio, preferred_radius_km } = req.body;
            await pool.query('UPDATE worker_profiles SET skills=COALESCE($1,skills),experience_years=COALESCE($2,experience_years),hourly_rate_min=COALESCE($3,hourly_rate_min),hourly_rate_max=COALESCE($4,hourly_rate_max),availability_status=COALESCE($5,availability_status),latitude=COALESCE($6,latitude),longitude=COALESCE($7,longitude),bio=COALESCE($8,bio),preferred_radius_km=COALESCE($9,preferred_radius_km) WHERE user_id=$10', [skills, experience_years, hourly_rate_min, hourly_rate_max, availability_status, latitude, longitude, bio, preferred_radius_km, req.user.id]);
        }
        res.json({ message: 'Profile updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify-email', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token required' });
        const r = await pool.query('UPDATE users SET email_verified=1, verification_token=NULL WHERE verification_token=$1 RETURNING id', [token]);
        if (r.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });
        res.json({ message: 'Email verified successfully!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forgot-password', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const { email } = req.body;
        const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
        if (existing.rows.length === 0) return res.json({ message: 'If that email is registered, a reset link was sent.' }); // Don't reveal if email exists
        
        const resetToken = crypto.randomBytes(20).toString('hex');
        const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
        await pool.query('UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE email=$3', [resetToken, expires, email]);
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.headers.host}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Reset your GigSpot Password',
            html: `<p>You requested a password reset.</p><p>Please click this link to reset your password: <a href="${baseUrl}/?reset=${resetToken}">Reset Password</a></p>`
        };
        try {
            await transporter.sendMail(mailOptions);
        } catch (mailErr) {
            console.error('Failed to send reset email:', mailErr);
        }
        res.json({ message: 'If that email is registered, a reset link was sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reset-password', async (req, res) => {
    const pool = req.app.locals.pool;
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Invalid input' });
        
        const r = await pool.query('SELECT id, reset_token_expires FROM users WHERE reset_token=$1', [token]);
        if (r.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });
        
        const expires = new Date(r.rows[0].reset_token_expires);
        if (expires < new Date()) return res.status(400).json({ error: 'Token has expired' });
        
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2', [hash, r.rows[0].id]);
        res.json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/google-login', async (req, res) => {
    const pool = req.app.locals.pool;
    const { email, full_name, avatar_url, role } = req.body;
    if (!email || !full_name) return res.status(400).json({ error: 'Invalid Google payload' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let r = await client.query('SELECT id,email,password_hash,full_name,phone,role,avatar_url,created_at FROM users WHERE email=$1', [email]);
        let user;
        
        if (r.rows.length === 0) {
            // Register new Google user
            const chosenRole = role || 'worker';
            const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10); // Random password
            const u = await client.query('INSERT INTO users(email,password_hash,full_name,avatar_url,role,email_verified) VALUES($1,$2,$3,$4,$5,1) RETURNING id,email,full_name,role', [email, hash, full_name, avatar_url||null, chosenRole]);
            user = u.rows[0];
            if (chosenRole === 'provider') await client.query('INSERT INTO provider_profiles(user_id,company_name) VALUES($1,$2)', [user.id, full_name]);
            else await client.query('INSERT INTO worker_profiles(user_id,skills) VALUES($1,$2)', [user.id, '[]']);
            await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Welcome to GigSpot!','Your Google account is connected.','info')", [user.id]);
        } else {
            user = r.rows[0];
            if (avatar_url && !user.avatar_url) await client.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatar_url, user.id]);
        }
        await client.query('COMMIT');
        
        let profile = null;
        if (user.role === 'provider') { const p = await client.query('SELECT * FROM provider_profiles WHERE user_id=$1', [user.id]); profile = p.rows[0]; }
        else { const w = await client.query('SELECT * FROM worker_profiles WHERE user_id=$1', [user.id]); profile = w.rows[0]; }
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user, profile, token });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

router.post('/send-otp', async (req, res) => {
    const pool = req.app.locals.pool;
    const { email, full_name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    try {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins
        
        let r = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
        if (r.rows.length === 0) {
            if (!full_name) return res.status(400).json({ error: 'New user: full name required' });
            const chosenRole = role || 'worker';
            const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            const u = await pool.query('INSERT INTO users(email,password_hash,full_name,role,otp_code,otp_expires) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, hash, full_name, chosenRole, otpCode, expires]);
            if (chosenRole === 'provider') await pool.query('INSERT INTO provider_profiles(user_id,company_name) VALUES($1,$2)', [u.rows[0].id, full_name]);
            else await pool.query('INSERT INTO worker_profiles(user_id,skills) VALUES($1,$2)', [u.rows[0].id, '[]']);
        } else {
            await pool.query('UPDATE users SET otp_code=$1, otp_expires=$2 WHERE email=$3', [otpCode, expires, email]);
        }
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your GigSpot Login Code',
            html: `<p>Your OTP code is: <strong>${otpCode}</strong></p><p>This code will expire in 15 minutes.</p>`
        };
        try {
            await transporter.sendMail(mailOptions);
        } catch (mailErr) {
            console.error('Failed to send OTP email:', mailErr);
            return res.status(500).json({ error: 'Failed to send email. Please try again later.' });
        }
        res.json({ message: 'OTP sent to your email.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify-otp', async (req, res) => {
    const pool = req.app.locals.pool;
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    
    try {
        const r = await pool.query('SELECT id,email,full_name,phone,role,avatar_url,otp_code,otp_expires FROM users WHERE email=$1', [email]);
        if (r.rows.length === 0) return res.status(400).json({ error: 'User not found' });
        
        const user = r.rows[0];
        if (user.otp_code !== otp) return res.status(400).json({ error: 'Invalid OTP' });
        
        if (new Date(user.otp_expires) < new Date()) return res.status(400).json({ error: 'OTP has expired' });
        
        await pool.query('UPDATE users SET otp_code=NULL, otp_expires=NULL, email_verified=1, last_login=NOW() WHERE id=$1', [user.id]);
        
        let profile = null;
        if (user.role === 'provider') { const p = await pool.query('SELECT * FROM provider_profiles WHERE user_id=$1', [user.id]); profile = p.rows[0]; }
        else { const w = await pool.query('SELECT * FROM worker_profiles WHERE user_id=$1', [user.id]); profile = w.rows[0]; }
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
        delete user.otp_code; delete user.otp_expires;
        res.json({ user, profile, token, message: 'Logged in successfully!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.authMiddleware = authMiddleware;
module.exports = router;
