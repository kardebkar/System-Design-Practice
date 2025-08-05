const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: 5432,
  database: 'minigram',
  user: 'minigram_user',
  password: 'minigram_pass',
  max: 20,
});

async function seedDatabase() {
  console.log('🌱 Seeding database with test data...');
  
  try {
    // Create sample users
    const users = [
      { username: 'alice', email: 'alice@example.com', password: 'password123' },
      { username: 'bob', email: 'bob@example.com', password: 'password123' },
      { username: 'charlie', email: 'charlie@example.com', password: 'password123' },
      { username: 'diana', email: 'diana@example.com', password: 'password123' },
      { username: 'eve', email: 'eve@example.com', password: 'password123' }
    ];

    console.log('Creating users...');
    const userIds = [];
    
    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      try {
        const result = await pool.query(
          'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
          [user.username, user.email, hashedPassword]
        );
        userIds.push(result.rows[0].id);
        console.log(`  ✅ Created user: ${user.username}`);
      } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`  ⚠️  User ${user.username} already exists`);
          const result = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
          userIds.push(result.rows[0].id);
        } else {
          throw error;
        }
      }
    }

    // Create sample photos
    console.log('Creating sample photos...');
    const photos = [
      { caption: 'Beautiful sunset! 🌅', userId: userIds[0] },
      { caption: 'Coffee time ☕', userId: userIds[1] },
      { caption: 'Weekend vibes 🎉', userId: userIds[2] },
      { caption: 'Nature walk 🌲', userId: userIds[3] },
      { caption: 'City lights ✨', userId: userIds[4] },
      { caption: 'Lunch break 🍕', userId: userIds[0] },
      { caption: 'New haircut! 💁‍♀️', userId: userIds[1] },
      { caption: 'Beach day 🏖️', userId: userIds[2] }
    ];

    const photoIds = [];
    for (const photo of photos) {
      try {
        const result = await pool.query(
          'INSERT INTO photos (user_id, photo_url, caption) VALUES ($1, $2, $3) RETURNING id',
          [photo.userId, `/uploads/sample-${Date.now()}-${Math.random()}.jpg`, photo.caption]
        );
        photoIds.push(result.rows[0].id);
        console.log(`  ✅ Created photo: ${photo.caption}`);
      } catch (error) {
        console.log(`  ⚠️  Photo creation failed: ${error.message}`);
      }
    }

    // Create sample follows
    console.log('Creating follow relationships...');
    const follows = [
      [userIds[0], userIds[1]], // alice follows bob
      [userIds[0], userIds[2]], // alice follows charlie
      [userIds[1], userIds[0]], // bob follows alice
      [userIds[1], userIds[3]], // bob follows diana
      [userIds[2], userIds[4]], // charlie follows eve
      [userIds[3], userIds[0]], // diana follows alice
      [userIds[4], userIds[2]]  // eve follows charlie
    ];

    for (const [followerId, followingId] of follows) {
      try {
        await pool.query(
          'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
          [followerId, followingId]
        );
        console.log(`  ✅ Created follow relationship`);
      } catch (error) {
        if (error.code !== '23505') { // Ignore unique constraint violations
          console.log(`  ⚠️  Follow creation failed: ${error.message}`);
        }
      }
    }

    // Create sample likes
    console.log('Creating likes...');
    for (let i = 0; i < photoIds.length; i++) {
      const photoId = photoIds[i];
      const numLikes = Math.floor(Math.random() * userIds.length) + 1;
      
      for (let j = 0; j < numLikes; j++) {
        const userId = userIds[j % userIds.length];
        
        try {
          await pool.query(
            'INSERT INTO likes (user_id, photo_id) VALUES ($1, $2)',
            [userId, photoId]
          );
        } catch (error) {
          // Ignore duplicate likes
          if (error.code !== '23505') {
            console.log(`  ⚠️  Like creation failed: ${error.message}`);
          }
        }
      }
    }

    console.log('✅ Database seeded successfully!');
    
    // Print summary
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const photoCount = await pool.query('SELECT COUNT(*) FROM photos');
    const likeCount = await pool.query('SELECT COUNT(*) FROM likes');
    const followCount = await pool.query('SELECT COUNT(*) FROM follows');
    
    console.log('\n📊 Database Summary:');
    console.log(`  Users: ${userCount.rows[0].count}`);
    console.log(`  Photos: ${photoCount.rows[0].count}`);
    console.log(`  Likes: ${likeCount.rows[0].count}`);
    console.log(`  Follows: ${followCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;