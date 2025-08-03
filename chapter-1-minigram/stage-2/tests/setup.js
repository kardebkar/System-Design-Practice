const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });

// Create test database before tests
module.exports = async () => {
  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME}`);
    console.log('✅ Test database created');
  } catch (error) {
    console.error('Test setup error:', error);
  } finally {
    await adminPool.end();
  }
};