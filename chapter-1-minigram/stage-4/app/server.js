const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const Redis = require('redis');
const prometheus = require('prom-client');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const instanceId = process.env.INSTANCE_ID || 'unknown';

// Environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'minigram',
  user: process.env.DB_USER || 'minigram_user',
  password: process.env.DB_PASS || 'minigram_pass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes default
const CDN_URL = process.env.CDN_URL || 'http://localhost:8081';

// Initialize Prometheus metrics
const register = new prometheus.Registry();

// Custom metrics for cache performance
const cacheHitsTotal = new prometheus.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'instance'],
  registers: [register],
});

const cacheMissesTotal = new prometheus.Counter({
  name: 'cache_misses_total', 
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'instance'],
  registers: [register],
});

const cacheOperationDuration = new prometheus.Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations',
  labelNames: ['operation', 'cache_type', 'instance'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const dbQueryDuration = new prometheus.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['query_type', 'cached', 'instance'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'instance'],
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'instance'],
  registers: [register],
});

const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['instance'],
  registers: [register],
});

// Add default metrics
prometheus.collectDefaultMetrics({ register });

// Database connection pool
let pool;
let redisClient;
let cacheHealthy = false;

// Cache Layer Implementation
class CacheManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = CACHE_TTL;
  }

  // Generate cache keys following consistent naming convention
  generateKey(prefix, identifier, params = '') {
    const key = `${prefix}:${identifier}${params ? ':' + params : ''}`;
    return key.replace(/[^a-zA-Z0-9:_-]/g, '_'); // Sanitize key
  }

  // Get from cache with metrics
  async get(key, type = 'general') {
    const timer = cacheOperationDuration.startTimer({ 
      operation: 'get', 
      cache_type: type,
      instance: instanceId 
    });
    
    try {
      const result = await this.redis.get(key);
      timer({ success: 'true' });
      
      if (result !== null) {
        cacheHitsTotal.inc({ cache_type: type, instance: instanceId });
        return JSON.parse(result);
      } else {
        cacheMissesTotal.inc({ cache_type: type, instance: instanceId });
        return null;
      }
    } catch (error) {
      timer({ success: 'false' });
      console.error(`Cache GET error for key ${key}:`, error);
      cacheMissesTotal.inc({ cache_type: type, instance: instanceId });
      return null; // Fail gracefully
    }
  }

  // Set in cache with metrics
  async set(key, value, ttl = this.defaultTTL, type = 'general') {
    const timer = cacheOperationDuration.startTimer({ 
      operation: 'set', 
      cache_type: type,
      instance: instanceId 
    });
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      timer({ success: 'true' });
      return true;
    } catch (error) {
      timer({ success: 'false' });
      console.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  // Delete from cache
  async del(key, type = 'general') {
    const timer = cacheOperationDuration.startTimer({ 
      operation: 'del', 
      cache_type: type,
      instance: instanceId 
    });
    
    try {
      await this.redis.del(key);
      timer({ success: 'true' });
      return true;
    } catch (error) {
      timer({ success: 'false' });
      console.error(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  // Pattern-based cache invalidation
  async invalidatePattern(pattern, type = 'general') {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
      }
      return keys.length;
    } catch (error) {
      console.error(`Cache pattern invalidation error for ${pattern}:`, error);
      return 0;
    }
  }

  // Cache warming for frequently accessed data
  async warmCache() {
    console.log('Starting cache warming...');
    
    try {
      // Warm up user cache
      const recentUsers = await pool.query(
        'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 100'
      );
      
      for (const user of recentUsers.rows) {
        const key = this.generateKey('user', user.id);
        await this.set(key, user, 900, 'user'); // 15 minutes TTL for users
      }

      // Warm up popular posts cache
      const popularPosts = await pool.query(`
        SELECT p.*, u.username 
        FROM posts p 
        JOIN users u ON p.user_id = u.id 
        ORDER BY p.created_at DESC 
        LIMIT 50
      `);
      
      for (const post of popularPosts.rows) {
        const key = this.generateKey('post', post.id);
        await this.set(key, post, 600, 'post'); // 10 minutes TTL for posts
      }

      // Cache system statistics
      const stats = await this.getSystemStats();
      await this.set('system:stats', stats, 60, 'system'); // 1 minute TTL for stats

      console.log(`Cache warming completed: ${recentUsers.rows.length} users, ${popularPosts.rows.length} posts`);
    } catch (error) {
      console.error('Cache warming failed:', error);
    }
  }

  // Get system statistics for caching
  async getSystemStats() {
    try {
      const userCount = await pool.query('SELECT COUNT(*) FROM users');
      const postCount = await pool.query('SELECT COUNT(*) FROM posts');
      const recentActivity = await pool.query(`
        SELECT COUNT(*) as recent_posts 
        FROM posts 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      return {
        total_users: parseInt(userCount.rows[0].count),
        total_posts: parseInt(postCount.rows[0].count),
        recent_posts: parseInt(recentActivity.rows[0].recent_posts),
        timestamp: new Date().toISOString(),
        instance: instanceId
      };
    } catch (error) {
      console.error('Error getting system stats:', error);
      return { error: 'Failed to get stats', timestamp: new Date().toISOString() };
    }
  }
}

let cacheManager;

// Database initialization
async function initializeDatabase() {
  try {
    pool = new Pool(dbConfig);
    
    // Test the connection
    const client = await pool.connect();
    console.log(`Connected to PostgreSQL database at ${dbConfig.host}:${dbConfig.port}`);
    
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    client.release();
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

// Redis initialization
async function initializeRedis() {
  try {
    redisClient = Redis.createClient(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      cacheHealthy = false;
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis cache server');
      cacheHealthy = true;
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
      cacheHealthy = true;
    });

    await redisClient.connect();
    cacheManager = new CacheManager(redisClient);
    
    // Warm the cache after connection
    setTimeout(() => {
      if (cacheHealthy) {
        cacheManager.warmCache();
      }
    }, 5000);
    
  } catch (error) {
    console.error('Redis initialization failed:', error);
    cacheHealthy = false;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging and metrics middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode, instance: instanceId },
      duration
    );
    
    httpRequestTotal.inc({ 
      method: req.method, 
      route, 
      status_code: res.statusCode, 
      instance: instanceId 
    });
  });
  
  next();
});

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    instance: instanceId,
    cache_healthy: cacheHealthy,
    memory_usage: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
  };

  try {
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.message = error;
    res.status(503).json(healthCheck);
  }
});

// Instance identification endpoint
app.get('/api/instance', (req, res) => {
  res.json({
    instance: instanceId,
    timestamp: new Date().toISOString(),
    cache_enabled: cacheHealthy,
    uptime: process.uptime()
  });
});

// User registration with caching
app.post('/api/register', async (req, res) => {
  const timer = dbQueryDuration.startTimer({ query_type: 'insert', cached: 'false', instance: instanceId });
  
  try {
    const { username, email } = req.body;
    
    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' });
    }

    // Check cache first for existing user
    if (cacheHealthy && cacheManager) {
      const cachedUser = await cacheManager.get(
        cacheManager.generateKey('user_email', email), 
        'user'
      );
      if (cachedUser) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    const result = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      [username, email]
    );
    
    const newUser = result.rows[0];
    timer({ success: 'true' });

    // Cache the new user
    if (cacheHealthy && cacheManager) {
      await cacheManager.set(
        cacheManager.generateKey('user', newUser.id),
        newUser,
        900, // 15 minutes
        'user'
      );
      await cacheManager.set(
        cacheManager.generateKey('user_email', newUser.email),
        newUser,
        900,
        'user'
      );
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
      cached: true
    });
  } catch (error) {
    timer({ success: 'false' });
    console.error('Registration error:', error);
    
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Create post with caching
app.post('/api/posts', upload.single('image'), async (req, res) => {
  const timer = dbQueryDuration.startTimer({ query_type: 'insert', cached: 'false', instance: instanceId });
  
  try {
    const { user_id, content } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!user_id || !content) {
      return res.status(400).json({ error: 'User ID and content are required' });
    }

    const result = await pool.query(
      'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
      [user_id, content, image_url]
    );
    
    const newPost = result.rows[0];
    timer({ success: 'true' });

    // Cache the new post
    if (cacheHealthy && cacheManager) {
      await cacheManager.set(
        cacheManager.generateKey('post', newPost.id),
        newPost,
        600, // 10 minutes
        'post'
      );
      
      // Invalidate user's posts cache
      await cacheManager.invalidatePattern(`user_posts:${user_id}*`, 'post');
      
      // Invalidate recent posts cache
      await cacheManager.del('posts:recent', 'post');
    }

    res.status(201).json({
      message: 'Post created successfully',
      post: newPost,
      cached: true
    });
  } catch (error) {
    timer({ success: 'false' });
    console.error('Post creation error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get posts with intelligent caching
app.get('/api/posts', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  const cacheKey = cacheManager?.generateKey('posts', 'recent', `page:${page}:limit:${limit}`);
  
  try {
    // Try cache first
    if (cacheHealthy && cacheManager) {
      const cachedPosts = await cacheManager.get(cacheKey, 'post');
      if (cachedPosts) {
        return res.json({
          posts: cachedPosts,
          page,
          limit,
          cached: true,
          cache_hit: true
        });
      }
    }

    // Cache miss - query database
    const timer = dbQueryDuration.startTimer({ query_type: 'select', cached: 'false', instance: instanceId });
    
    const result = await pool.query(`
      SELECT p.*, u.username 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    timer({ success: 'true' });

    const posts = result.rows;

    // Cache the results
    if (cacheHealthy && cacheManager) {
      await cacheManager.set(cacheKey, posts, 300, 'post'); // 5 minutes
    }

    res.json({
      posts,
      page,
      limit,
      cached: cacheHealthy,
      cache_hit: false
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get user with caching
app.get('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const cacheKey = cacheManager?.generateKey('user', userId);
  
  try {
    // Try cache first
    if (cacheHealthy && cacheManager) {
      const cachedUser = await cacheManager.get(cacheKey, 'user');
      if (cachedUser) {
        return res.json({
          user: cachedUser,
          cached: true,
          cache_hit: true
        });
      }
    }

    // Cache miss - query database
    const timer = dbQueryDuration.startTimer({ query_type: 'select', cached: 'false', instance: instanceId });
    
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    timer({ success: 'true' });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Cache the user
    if (cacheHealthy && cacheManager) {
      await cacheManager.set(cacheKey, user, 900, 'user'); // 15 minutes
    }

    res.json({
      user,
      cached: cacheHealthy,
      cache_hit: false
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Cache management endpoints
app.post('/api/cache/invalidate', async (req, res) => {
  if (!cacheHealthy || !cacheManager) {
    return res.status(503).json({ error: 'Cache not available' });
  }

  try {
    const { pattern } = req.body;
    const invalidatedCount = await cacheManager.invalidatePattern(pattern || '*');
    
    res.json({
      message: 'Cache invalidation completed',
      pattern: pattern || '*',
      invalidated_keys: invalidatedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    res.status(500).json({ error: 'Cache invalidation failed' });
  }
});

app.post('/api/cache/warm', async (req, res) => {
  if (!cacheHealthy || !cacheManager) {
    return res.status(503).json({ error: 'Cache not available' });
  }

  try {
    await cacheManager.warmCache();
    res.json({
      message: 'Cache warming completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache warming error:', error);
    res.status(500).json({ error: 'Cache warming failed' });
  }
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

// Cache statistics endpoint
app.get('/api/cache/stats', async (req, res) => {
  if (!cacheHealthy || !redisClient) {
    return res.status(503).json({ error: 'Cache not available' });
  }

  try {
    const info = await redisClient.info('memory');
    const stats = await redisClient.info('stats');
    
    res.json({
      cache_healthy: cacheHealthy,
      memory_info: info,
      stats_info: stats,
      instance: instanceId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// CDN integration for static assets
app.get('/static/*', (req, res) => {
  const assetPath = req.path.replace('/static/', '');
  const cdnUrl = `${CDN_URL}/${assetPath}`;
  
  res.redirect(302, cdnUrl);
});

// Serve uploaded files through CDN when possible
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const localPath = path.join(__dirname, 'uploads', filename);
  
  // Check if file exists locally
  if (fs.existsSync(localPath)) {
    // In production, this would redirect to CDN
    res.sendFile(localPath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Serve main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  if (redisClient) {
    await redisClient.quit();
  }
  
  if (pool) {
    await pool.end();
  }
  
  process.exit(0);
});

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    await initializeRedis();
    
    app.listen(port, () => {
      console.log(`Server running on port ${port} (Instance: ${instanceId})`);
      console.log(`Cache enabled: ${cacheHealthy}`);
      console.log(`CDN URL: ${CDN_URL}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Update active connections metric
      activeConnections.set({ instance: instanceId }, 1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();