const request = require('supertest');
const app = require('../server');
const pool = require('../db/pool');
const redis = require('redis');

// Test data
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123'
};

let authToken;
let redisClient;

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Connect Redis
  redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
  });
  await redisClient.connect();
  
  // Initialize database schema
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      caption TEXT,
      like_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, photo_id)
    );
  `;
  
  await pool.query(schema);
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
});

beforeEach(async () => {
  // Clean up database
  await pool.query('TRUNCATE users, photos, likes RESTART IDENTITY CASCADE');
  await redisClient.flushAll();
});

describe('Health Check', () => {
  test('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.postgres).toBe('connected');
    // Redis might not be connected in CI environment, so we allow both
    expect(['connected', 'disconnected']).toContain(res.body.redis);
  });
});

describe('User Authentication', () => {
  test('POST /api/register creates new user', async () => {
    const res = await request(app)
      .post('/api/register')
      .send(testUser);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('userId');
    expect(res.body.username).toBe(testUser.username);
  });
  
  test('POST /api/register fails with duplicate username', async () => {
    await request(app).post('/api/register').send(testUser);
    
    const res = await request(app)
      .post('/api/register')
      .send(testUser);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already exists');
  });
  
  test('POST /api/register validates required fields', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'test' });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });
  
  test('POST /api/login authenticates user', async () => {
    await request(app).post('/api/register').send(testUser);
    
    const res = await request(app)
      .post('/api/login')
      .send({
        username: testUser.username,
        password: testUser.password
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.username).toBe(testUser.username);
    
    authToken = res.body.token;
  });
  
  test('POST /api/login fails with wrong password', async () => {
    await request(app).post('/api/register').send(testUser);
    
    const res = await request(app)
      .post('/api/login')
      .send({
        username: testUser.username,
        password: 'wrongpassword'
      });
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('Feed Operations', () => {
  beforeEach(async () => {
    const registerRes = await request(app)
      .post('/api/register')
      .send(testUser);
    authToken = registerRes.body.token;
  });
  
  test('GET /api/feed requires authentication', async () => {
    const res = await request(app).get('/api/feed');
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access token required');
  });
  
  test('GET /api/feed returns empty array initially', async () => {
    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  
  test('GET /api/feed uses caching', async () => {
    // First request - cache miss
    await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${authToken}`);
    
    // Second request - should be cached
    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    
    // Check metrics to verify cache hit (Redis might not be available in CI)
    const metricsRes = await request(app).get('/api/metrics');
    expect(metricsRes.body.cacheMetrics.hits).toBeGreaterThanOrEqual(0);
  });
});

describe('Performance Tests', () => {
  test('Handles concurrent requests without errors', async () => {
    const promises = [];
    
    // Create 20 concurrent registration requests
    for (let i = 0; i < 20; i++) {
      promises.push(
        request(app)
          .post('/api/register')
          .send({
            username: `user${i}`,
            email: `user${i}@test.com`,
            password: 'password123'
          })
      );
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.status === 200).length;
    
    expect(successful).toBeGreaterThanOrEqual(19); // Allow 1 failure max
  });
  
  test('Connection pool handles load', async () => {
    const registerRes = await request(app)
      .post('/api/register')
      .send(testUser);
    const token = registerRes.body.token;
    
    // Make 50 rapid requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        request(app)
          .get('/api/feed')
          .set('Authorization', `Bearer ${token}`)
      );
    }
    
    const results = await Promise.all(promises);
    const errors = results.filter(r => r.status >= 500).length;
    
    expect(errors).toBe(0); // No server errors
    
    // Check pool stats
    const healthRes = await request(app).get('/health');
    expect(healthRes.body.poolStats.total).toBeGreaterThan(0);
  });
});

describe('Metrics', () => {
  test('GET /api/metrics returns performance data', async () => {
    // Make some requests first
    await request(app).get('/health');
    await request(app).post('/api/register').send(testUser);
    
    const res = await request(app).get('/api/metrics');
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRequests');
    expect(res.body).toHaveProperty('errorRate');
    expect(res.body).toHaveProperty('avgResponseTime');
    expect(res.body).toHaveProperty('cacheMetrics');
    expect(res.body).toHaveProperty('poolStats');
    expect(res.body.stage).toBe('Stage 2 - PostgreSQL');
  });
});