const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

async function seedDatabase() {
  console.log('🌱 Seeding PostgreSQL database...');
  
  try {
    // Clear existing data
    await pool.query('TRUNCATE users, photos, likes, follows RESTART IDENTITY CASCADE');
    
    // Create test users
    const users = [];
    for (let i = 1; i <= 10; i++) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const result = await pool.query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username',
        [`user${i}`, `user${i}@test.com`, hashedPassword]
      );
      users.push(result.rows[0]);
      console.log(`✅ Created user: ${result.rows[0].username}`);
    }
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    
    // Create test photos
    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    for (const user of users.slice(0, 5)) {
      for (let i = 1; i <= 3; i++) {
        const filename = `photo_${user.id}_${i}_${Date.now()}.png`;
        const filepath = path.join('uploads', filename);
        fs.writeFileSync(filepath, imageBuffer);
        
        await pool.query(
          'INSERT INTO photos (user_id, filename, caption) VALUES ($1, $2, $3)',
          [user.id, filename, `Photo ${i} by ${user.username}`]
        );
        console.log(`📸 Created photo for ${user.username}`);
      }
    }
    
    // Create some likes
    const photos = await pool.query('SELECT id FROM photos LIMIT 10');
    for (const user of users.slice(0, 5)) {
      for (const photo of photos.rows.slice(0, 5)) {
        await pool.query(
          'INSERT INTO likes (user_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, photo.id]
        );
      }
    }
    console.log('👍 Created likes');
    
    // Create some follows
    for (let i = 0; i < users.length; i++) {
      for (let j = 1; j <= 3; j++) {
        const targetIndex = (i + j) % users.length;
        if (i !== targetIndex) {
          await pool.query(
            'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [users[i].id, users[targetIndex].id]
          );
        }
      }
    }
    console.log('👥 Created follows');
    
    // Show final stats
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const photoCount = await pool.query('SELECT COUNT(*) FROM photos');
    const likeCount = await pool.query('SELECT COUNT(*) FROM likes');
    
    console.log(`
✅ Database seeded successfully!
├─ Users: ${userCount.rows[0].count}
├─ Photos: ${photoCount.rows[0].count}
└─ Likes: ${likeCount.rows[0].count}

📝 Test credentials:
   Username: user1
   Password: password123
    `);
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();