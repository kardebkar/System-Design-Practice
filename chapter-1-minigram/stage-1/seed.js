// seed.js - Fixed version that creates tables before seeding
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./minigram.db');

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

async function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create photos table
      db.run(`CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        caption TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`);

      // Create likes table
      db.run(`CREATE TABLE IF NOT EXISTS likes (
        user_id INTEGER NOT NULL,
        photo_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, photo_id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (photo_id) REFERENCES photos (id)
      )`);

      // Create follows table
      db.run(`CREATE TABLE IF NOT EXISTS follows (
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_id, following_id),
        FOREIGN KEY (follower_id) REFERENCES users (id),
        FOREIGN KEY (following_id) REFERENCES users (id)
      )`);
      
      // Create indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at)`);
      
      // Wait a bit for all operations to complete
      db.run("SELECT 1", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

async function seed() {
  console.log('🌱 Seeding database...');
  
  try {
    // First, create tables
    console.log('📦 Creating tables...');
    await createTables();
    console.log('✅ Tables created!');
    
    // Create test users
    const users = [
      { username: 'alice', email: 'alice@test.com', password: 'password123' },
      { username: 'bob', email: 'bob@test.com', password: 'password123' },
      { username: 'charlie', email: 'charlie@test.com', password: 'password123' },
      { username: 'testuser', email: 'test@test.com', password: 'test123' }
    ];
    
    console.log('👥 Creating users...');
    for (const user of users) {
      const hash = await bcrypt.hash(user.password, 10);
      db.run(
        'INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)',
        [user.username, user.email, hash],
        (err) => {
          if (!err) console.log(`✅ Created user: ${user.username}`);
        }
      );
    }
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
      console.log('📁 Created uploads directory');
    }
    
    // Create a simple test image
    const testImagePath = path.join('uploads', 'test-image.jpg');
    if (!fs.existsSync(testImagePath)) {
      // Create a 1x1 pixel image as placeholder
      const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testImagePath, buffer);
      console.log('🖼️  Created test image');
    }
    
    // Wait a moment for all inserts to complete
    setTimeout(() => {
      console.log('\n✅ Seeding complete!');
      console.log('📝 Test credentials:');
      console.log('   Username: testuser');
      console.log('   Password: test123');
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
          process.exit(1);
        }
        process.exit(0);
      });
    }, 1000);
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

// Run seeding
seed();
