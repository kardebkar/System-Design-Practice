const { Pool } = require('pg');
require('dotenv').config();

async function waitForDatabase(maxRetries = 30, retryInterval = 2000) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: 'minigram',
    user: 'minigram_user',
    password: 'minigram_pass',
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  console.log('⏳ Waiting for database connection...');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      console.log('✅ Database connected successfully!');
      await pool.end();
      return true;
      
    } catch (error) {
      console.log(`🔄 Database connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        console.error('❌ Failed to connect to database after maximum retries');
        await pool.end();
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
}

if (require.main === module) {
  waitForDatabase()
    .then(() => {
      console.log('Database is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database connection failed:', error);
      process.exit(1);
    });
}

module.exports = waitForDatabase;