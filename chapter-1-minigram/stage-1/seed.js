const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./minigram.db');

async function seed() {
  console.log('🌱 Seeding database...');
  
  // Create test users
  const users = [
    { username: 'alice', email: 'alice@test.com', password: 'password123' },
    { username: 'bob', email: 'bob@test.com', password: 'password123' },
    { username: 'charlie', email: 'charlie@test.com', password: 'password123' },
    { username: 'testuser', email: 'test@test.com', password: 'test123' }
  ];
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    db.run(
      'INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)',
      [user.username, user.email, hash]
    );
  }
  
  // Create dummy image file if uploads directory exists
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  
  // Create a simple test image
  const testImagePath = path.join('uploads', 'test-image.jpg');
  if (!fs.existsSync(testImagePath)) {
    // Create a 1x1 pixel image as placeholder
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(testImagePath, buffer);
  }
  
  console.log('✅ Seeding complete!');
  console.log('📝 Test credentials:');
  console.log('   Username: testuser');
  console.log('   Password: test123');
  
  db.close();
}

seed().catch(console.error);