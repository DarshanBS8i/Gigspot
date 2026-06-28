// ============================================================
// GigSpot - Database Initialization Script
// Run: npm run db:init
// ============================================================

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'gigspot',
    user: process.env.DB_USER || 'gigspot_user',
    password: process.env.DB_PASSWORD || 'gigspot_pass_2024',
});

async function initDatabase() {
    const client = await pool.connect();
    try {
        console.log('🔌 Connected to PostgreSQL');

        // Read and execute schema
        const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await client.query(schemaSQL);
        console.log('✅ Schema created successfully');

        // Read and execute seed data
        const seedSQL = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
        await client.query(seedSQL);
        console.log('✅ Seed data inserted successfully');

        console.log('\n🚀 Database initialization complete!');
    } catch (err) {
        console.error('❌ Error initializing database:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

initDatabase();
