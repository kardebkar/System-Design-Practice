const { Pool } = require('pg');
require('dotenv').config();

async function initDatabase() {
  // First connect to postgres database to create our database
  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  try {
    // Create database if it doesn't exist
    await adminPool.query(`
      SELECT 'CREATE DATABASE ${process.env.DB_NAME}'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${process.env.DB_NAME}')
    `);
    
    console.log(`✅ Database ${process.env.DB_NAME} ready`);
  } catch (err) {
    if (!err.message.includes('already exists')) {
      throw err;
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to our database and create tables
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  console.log('🔧 Creating database schema...');

  const schema = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Photos table
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      caption TEXT,
      like_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Likes table
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, photo_id)
    );

    -- Follows table
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, following_id)
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
    CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_likes_photo_id ON likes(photo_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

    -- Update like count trigger
    CREATE OR REPLACE FUNCTION update_like_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE photos SET like_count = like_count + 1 WHERE id = NEW.photo_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE photos SET like_count = like_count - 1 WHERE id = OLD.photo_id;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_photo_like_count ON likes;
    CREATE TRIGGER update_photo_like_count
    AFTER INSERT OR DELETE ON likes
    FOR EACH ROW EXECUTE FUNCTION update_like_count();
  `;

  try {
    await pool.query(schema);
    console.log('✅ Database schema created successfully!');
  } catch (error) {
    console.error('❌ Schema creation failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase().catch(console.error);