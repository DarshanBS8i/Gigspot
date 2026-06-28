// Database Adapter - Uses PostgreSQL if available, falls back to SQLite
const path = require('path');

let usePostgres = false;
let pool = null;
let sqliteDb = null;

async function initDatabase() {
    // Try PostgreSQL first
    try {
        const { Pool } = require('pg');
        const isLocal = (process.env.DB_HOST || 'localhost').includes('localhost') || (process.env.DB_HOST || 'localhost').includes('127.0.0.1');
        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'gigspot',
            user: process.env.DB_USER || 'gigspot_user',
            password: process.env.DB_PASSWORD || 'gigspot_pass_2024',
            connectionTimeoutMillis: 3000,
            ssl: isLocal ? false : { rejectUnauthorized: false }
        });
        await pool.query('SELECT 1');
        usePostgres = true;
        console.log('✅ Connected to PostgreSQL');
        return pool;
    } catch (e) {
        console.log('⚠️  PostgreSQL not available, using SQLite fallback');
    }

    // SQLite fallback
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'gigspot.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    initSqliteSchema();
    console.log('✅ SQLite database ready at', dbPath);

    // Return a pg-compatible wrapper
    return createSqlitePool();
}

function initSqliteSchema() {
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL, phone TEXT, role TEXT NOT NULL CHECK(role IN ('provider','worker')),
            avatar_url TEXT, is_active INTEGER DEFAULT 1, email_verified INTEGER DEFAULT 0,
            verification_token TEXT, reset_token TEXT, reset_token_expires TEXT,
            otp_code TEXT, otp_expires TEXT,
            last_login TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS provider_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            company_name TEXT, business_type TEXT, description TEXT, website TEXT, address TEXT,
            latitude REAL, longitude REAL, rating REAL DEFAULT 0, total_reviews INTEGER DEFAULT 0,
            total_jobs_posted INTEGER DEFAULT 0, verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS worker_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            skills TEXT DEFAULT '[]', experience_years INTEGER DEFAULT 0,
            hourly_rate_min REAL, hourly_rate_max REAL,
            availability_status TEXT DEFAULT 'available' CHECK(availability_status IN ('available','busy','offline')),
            latitude REAL, longitude REAL, bio TEXT, rating REAL DEFAULT 0,
            total_reviews INTEGER DEFAULT 0, total_jobs_completed INTEGER DEFAULT 0,
            preferred_radius_km INTEGER DEFAULT 10, available_from TEXT, available_to TEXT,
            created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, icon TEXT, color TEXT DEFAULT '#6C63FF'
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL, description TEXT, category_id INTEGER REFERENCES categories(id),
            pay_rate REAL NOT NULL, pay_type TEXT DEFAULT 'hourly' CHECK(pay_type IN ('hourly','fixed','daily')),
            currency TEXT DEFAULT 'INR', location_name TEXT, latitude REAL NOT NULL, longitude REAL NOT NULL,
            start_date TEXT, end_date TEXT, start_time TEXT, end_time TEXT,
            slots INTEGER DEFAULT 1, filled_slots INTEGER DEFAULT 0,
            status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
            urgency TEXT DEFAULT 'normal' CHECK(urgency IN ('low','normal','urgent')),
            requirements TEXT, perks TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
            worker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn','completed')),
            message TEXT, applied_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(job_id, worker_id)
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT, reviewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reviewee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
            rating INTEGER CHECK(rating >= 1 AND rating <= 5), comment TEXT,
            created_at TEXT DEFAULT (datetime('now')), UNIQUE(reviewer_id, job_id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title TEXT, message TEXT,
            type TEXT DEFAULT 'info' CHECK(type IN ('info','success','warning','application','review','job_update')),
            read INTEGER DEFAULT 0, reference_id INTEGER, reference_type TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS saved_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
            saved_at TEXT DEFAULT (datetime('now')), UNIQUE(worker_id, job_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
            content TEXT NOT NULL, read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // Add new columns if the table already existed before this update
    try { sqliteDb.exec("ALTER TABLE users ADD COLUMN verification_token TEXT"); } catch(e){}
    try { sqliteDb.exec("ALTER TABLE users ADD COLUMN reset_token TEXT"); } catch(e){}
    try { sqliteDb.exec("ALTER TABLE users ADD COLUMN reset_token_expires TEXT"); } catch(e){}
    try { sqliteDb.exec("ALTER TABLE users ADD COLUMN otp_code TEXT"); } catch(e){}
    try { sqliteDb.exec("ALTER TABLE users ADD COLUMN otp_expires TEXT"); } catch(e){}

    // Seed categories
    const count = sqliteDb.prepare('SELECT COUNT(*) as c FROM categories').get();
    if (count.c === 0) {
        const ins = sqliteDb.prepare('INSERT OR IGNORE INTO categories(name,icon,color) VALUES(?,?,?)');
        const cats = [['Delivery','🚚','#FF6B6B'],['Cleaning','🧹','#4ECDC4'],['Cooking','🍳','#FFE66D'],['Tutoring','📚','#6C63FF'],['Gardening','🌱','#2ECC71'],['Event Staff','🎪','#E91E63'],['Data Entry','💻','#00BCD4'],['Photography','📷','#FF9800'],['Warehouse','📦','#795548'],['Pet Care','🐕','#9C27B0'],['Driving','🚗','#607D8B'],['Construction','🔨','#FF5722'],['Retail','🛒','#3F51B5'],['Security','🛡️','#F44336'],['Other','💼','#9E9E9E']];
        const tx = sqliteDb.transaction(() => cats.forEach(c => ins.run(...c)));
        tx();
    }
}

function createSqlitePool() {
    // Wraps SQLite in a pg-compatible interface
    return {
        async query(text, params = []) {
            // Convert PostgreSQL $1,$2 placeholders to ? for SQLite
            let idx = 0;
            const sqliteText = text.replace(/\$\d+/g, () => '?');
            // Handle array params for skills (convert to JSON string)
            const processedParams = params.map(p => {
                if (Array.isArray(p)) return JSON.stringify(p);
                if (p === true) return 1;
                if (p === false) return 0;
                return p;
            });

            try {
                const trimmed = sqliteText.trim().toUpperCase();
                if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
                    const rows = sqliteDb.prepare(sqliteText).all(...processedParams);
                    // Parse skills JSON back to arrays
                    rows.forEach(r => {
                        if (r.skills && typeof r.skills === 'string') {
                            try { r.skills = JSON.parse(r.skills); } catch(e) {}
                        }
                        if (r.perks && typeof r.perks === 'string') {
                            try { r.perks = JSON.parse(r.perks); } catch(e) {}
                        }
                    });
                    return { rows };
                } else if (trimmed.startsWith('INSERT')) {
                    const info = sqliteDb.prepare(sqliteText).run(...processedParams);
                    // Handle RETURNING clause
                    if (text.toUpperCase().includes('RETURNING')) {
                        const tableName = text.match(/INTO\s+(\w+)/i)?.[1];
                        if (tableName && info.lastInsertRowid) {
                            const row = sqliteDb.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
                            if (row?.skills && typeof row.skills === 'string') try { row.skills = JSON.parse(row.skills); } catch(e) {}
                            return { rows: row ? [row] : [] };
                        }
                    }
                    return { rows: [], rowCount: info.changes };
                } else {
                    const info = sqliteDb.prepare(sqliteText).run(...processedParams);
                    if (text.toUpperCase().includes('RETURNING')) {
                        const tableName = text.match(/(?:UPDATE|DELETE\s+FROM)\s+(\w+)/i)?.[1];
                        if (tableName) {
                            // For updates/deletes with RETURNING, try to get the affected row
                            const rows = info.changes > 0 ? [{ id: 1 }] : [];
                            return { rows };
                        }
                    }
                    return { rows: [], rowCount: info.changes };
                }
            } catch (err) {
                // Handle ILIKE -> LIKE
                if (err.message.includes('ILIKE')) {
                    const fixedText = sqliteText.replace(/ILIKE/gi, 'LIKE');
                    return { rows: sqliteDb.prepare(fixedText).all(...processedParams) };
                }
                // Handle ON CONFLICT DO NOTHING
                if (err.message.includes('ON CONFLICT')) {
                    try {
                        const fixedText = sqliteText.replace(/ON CONFLICT\s*\([^)]*\)\s*/gi, 'OR IGNORE ').replace(/ON CONFLICT DO NOTHING/gi, '');
                        const info = sqliteDb.prepare(fixedText).run(...processedParams);
                        return { rows: [], rowCount: info.changes };
                    } catch(e2) { return { rows: [], rowCount: 0 }; }
                }
                throw err;
            }
        },
        async connect() {
            return {
                query: this.query.bind(this),
                release: () => {}
            };
        }
    };
}

module.exports = { initDatabase };
