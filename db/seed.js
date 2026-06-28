// Seed demo data using the adapter (works with PostgreSQL or SQLite)
require('dotenv').config();
const { initDatabase } = require('./adapter');
const bcrypt = require('bcryptjs');

async function seedDemo() {
    const pool = await initDatabase();
    const client = await pool.connect();
    try {
        console.log('🌱 Seeding demo data...');
        const hash = await bcrypt.hash('demo1234', 10);

        // Provider 1
        await client.query("INSERT INTO users(email,password_hash,full_name,phone,role) VALUES('provider@demo.com','" + hash + "','Rajesh Kumar','+91-9876543210','provider') ON CONFLICT(email) DO NOTHING");
        let r = await client.query("SELECT id FROM users WHERE email='provider@demo.com'");
        const p1 = r.rows[0].id;
        await client.query("INSERT INTO provider_profiles(user_id,company_name,business_type,description,latitude,longitude,verified) VALUES(" + p1 + ",'Kumar Enterprises','Services','Various part-time jobs in Bangalore',12.9716,77.5946,1) ON CONFLICT(user_id) DO NOTHING");

        // Provider 2
        await client.query("INSERT INTO users(email,password_hash,full_name,phone,role) VALUES('provider2@demo.com','" + hash + "','Priya Sharma','+91-9876543211','provider') ON CONFLICT(email) DO NOTHING");
        r = await client.query("SELECT id FROM users WHERE email='provider2@demo.com'");
        const p2 = r.rows[0].id;
        await client.query("INSERT INTO provider_profiles(user_id,company_name,business_type,description,latitude,longitude,verified) VALUES(" + p2 + ",'Sharma Catering','Food','Premium catering service',12.9352,77.6245,1) ON CONFLICT(user_id) DO NOTHING");

        // Workers
        const workers = [
            ['worker@demo.com','Arun Patel','+91-9123456780','["Delivery","Driving","Warehouse"]',12.96,77.59,150,300,'Reliable delivery pro'],
            ['worker2@demo.com','Meena Devi','+91-9123456781','["Cooking","Cleaning","Event Staff"]',12.98,77.61,200,400,'Hospitality expert'],
            ['worker3@demo.com','Suresh Gowda','+91-9123456782','["Gardening","Construction","Warehouse"]',12.95,77.57,250,500,'Outdoor & manual labor'],
        ];
        for (const w of workers) {
            await client.query("INSERT INTO users(email,password_hash,full_name,phone,role) VALUES('" + w[0] + "','" + hash + "','" + w[1] + "','" + w[2] + "','worker') ON CONFLICT(email) DO NOTHING");
            r = await client.query("SELECT id FROM users WHERE email='" + w[0] + "'");
            const wid = r.rows[0].id;
            await client.query("INSERT INTO worker_profiles(user_id,skills,experience_years,hourly_rate_min,hourly_rate_max,availability_status,latitude,longitude,bio,preferred_radius_km) VALUES(" + wid + ",'" + w[3] + "',3," + w[4] + "," + w[5] + ",'available'," + w[4] + "," + w[5] + ",'" + w[6] + "',15) ON CONFLICT(user_id) DO NOTHING");
        }

        // Jobs
        const jobs = [
            [p1,'Food Delivery Partner','Deliver food in Koramangala. Own two-wheeler needed.',1,250,'hourly','Koramangala',12.9352,77.6245,'09:00','14:00',3,'urgent'],
            [p1,'Office Cleaning Staff','Daily office cleaning for tech company.',2,8000,'fixed','Indiranagar',12.9784,77.6408,'07:00','10:00',2,'normal'],
            [p1,'Weekend Cook Helper','Assist head chef at catering event.',3,500,'daily','Jayanagar',12.9299,77.5838,'08:00','16:00',1,'normal'],
            [p1,'Math Tutor Class 10','Teach CBSE Math, 3 days/week.',4,400,'hourly','HSR Layout',12.9116,77.6389,'16:00','18:00',1,'low'],
            [p2,'Garden Maintenance','Weekly garden work for residential complex.',5,350,'hourly','Whitefield',12.9698,77.75,'06:00','10:00',2,'normal'],
            [p2,'Wedding Event Staff','Setup, serve & cleanup for wedding.',6,1500,'daily','Rajajinagar',12.99,77.55,'10:00','22:00',5,'urgent'],
            [p2,'Warehouse Packing','Pack e-commerce orders. No exp needed.',9,200,'hourly','Electronic City',12.8456,77.6603,'09:00','17:00',4,'normal'],
            [p2,'Pet Walker Morning','Walk dogs. Comfortable with large breeds.',10,300,'hourly','MG Road',12.9757,77.6061,'06:00','08:00',2,'low'],
        ];
        for (const j of jobs) {
            await client.query("INSERT INTO jobs(provider_id,title,description,category_id,pay_rate,pay_type,location_name,latitude,longitude,start_time,end_time,slots,urgency) VALUES(" + j[0] + ",'" + j[1].replace(/'/g,"''") + "','" + j[2].replace(/'/g,"''") + "'," + j[3] + "," + j[4] + ",'" + j[5] + "','" + j[6] + "'," + j[7] + "," + j[8] + ",'" + j[9] + "','" + j[10] + "'," + j[11] + ",'" + j[12] + "')");
        }

        console.log('✅ Demo providers: provider@demo.com / demo1234');
        console.log('✅ Demo workers: worker@demo.com / demo1234');
        console.log('✅ 8 demo jobs created');
        console.log('🚀 Seed complete!');
    } catch (err) {
        console.error('❌ Seed error:', err.message);
    } finally {
        client.release();
    }
}

seedDemo();
