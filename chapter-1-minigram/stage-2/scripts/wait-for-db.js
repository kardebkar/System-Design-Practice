const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: 'postgres', // Connect to default postgres db first
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

async function waitForDatabase(retries = 30) {
  console.log('⏳ Waiting for PostgreSQL to be ready...');
  
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL is ready!');
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.log(`Attempt ${i + 1}/${retries} - PostgreSQL not ready yet...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.error('❌ PostgreSQL connection timeout');
  process.exit(1);
}

waitForDatabase();