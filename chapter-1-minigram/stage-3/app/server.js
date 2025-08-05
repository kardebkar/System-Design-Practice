const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
const redis = require('redis');
const { Pool } = require('pg');
const prometheus = require('prom-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const METRICS_PORT = process.env.METRICS_PORT || 9090;
const INSTANCE_ID = process.env.INSTANCE_ID || 'unknown';

// Prometheus metrics setup
const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'instance'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'instance']
});

const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['instance']
});

const cacheHitRate = new prometheus.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate percentage',
  labelNames: ['cache_type', 'instance']
});

const dbConnectionsActive = new prometheus.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  labelNames: ['instance', 'db_type']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(cacheHitRate);
register.registerMetric(dbConnectionsActive);

// Database connection pools
const masterPool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'minigram',
  user: 'minigram_user',
  password: 'minigram_pass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const readPool = new Pool({
  host: process.env.DB_READ_HOST,
  port: 5432,
  database: 'minigram',
  user: 'minigram_user',
  password: 'minigram_pass',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis client
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:6379`
});

redisClient.on('error', err => console.log(`[${INSTANCE_ID}] Redis Error:`, err));
redisClient.on('connect', () => console.log(`[${INSTANCE_ID}] ✅ Redis connected`));

// Connect Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Redis connection failed:`, error);
  }
})();

// Create directories
['uploads', 'logs', 'public'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Metrics tracking middleware
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.labels(INSTANCE_ID).inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode, INSTANCE_ID)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode, INSTANCE_ID)
      .inc();
    
    activeConnections.labels(INSTANCE_ID).dec();
  });
  
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { 
  stream: fs.createWriteStream('./logs/access.log', { flags: 'a' }) 
}));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Cache utility functions
const cacheStats = { hits: 0, misses: 0 };

async function getFromCache(key) {
  try {
    const result = await redisClient.get(key);
    if (result) {
      cacheStats.hits++;
      updateCacheHitRate();
      return JSON.parse(result);
    } else {
      cacheStats.misses++;
      updateCacheHitRate();
      return null;
    }
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Cache get error:`, error);
    cacheStats.misses++;
    updateCacheHitRate();
    return null;
  }
}

async function setCache(key, value, ttl = 300) {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Cache set error:`, error);
  }
}

function updateCacheHitRate() {
  const total = cacheStats.hits + cacheStats.misses;
  const rate = total > 0 ? cacheStats.hits / total : 0;
  cacheHitRate.labels('redis', INSTANCE_ID).set(rate);
}

// Update DB connection metrics
setInterval(() => {
  dbConnectionsActive.labels(INSTANCE_ID, 'master').set(masterPool.totalCount);
  dbConnectionsActive.labels(INSTANCE_ID, 'read').set(readPool.totalCount);
}, 5000);

// File upload configuration
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: {
      master: masterPool.totalCount,
      read: readPool.totalCount
    }
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await masterPool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    
    // Cache user data
    await setCache(`user:${user.id}`, user, 3600);
    
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Registration error:`, error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Try cache first
    const cachedUser = await getFromCache(`user:login:${username}`);
    let user = cachedUser;
    
    if (!user) {
      const result = await readPool.query(
        'SELECT id, username, email, password_hash FROM users WHERE username = $1',
        [username]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      user = result.rows[0];
      await setCache(`user:login:${username}`, user, 1800);
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Login error:`, error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user feed (cached)
app.get('/api/feed', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cacheKey = `feed:${req.user.userId}:${limit}`;
    
    // Try cache first
    const cachedFeed = await getFromCache(cacheKey);
    if (cachedFeed) {
      return res.json(cachedFeed);
    }
    
    const result = await readPool.query(`
      SELECT p.id, p.photo_url, p.caption, p.created_at, 
             u.username, u.id as user_id,
             COUNT(l.id) as like_count
      FROM photos p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN likes l ON p.id = l.photo_id
      WHERE p.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1
        UNION SELECT $1
      )
      GROUP BY p.id, u.username, u.id
      ORDER BY p.created_at DESC
      LIMIT $2
    `, [req.user.userId, limit]);
    
    const feed = result.rows;
    await setCache(cacheKey, feed, 60); // Cache for 1 minute
    
    res.json(feed);
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Feed error:`, error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Upload photo
app.post('/api/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    
    const { caption } = req.body;
    const photoUrl = `/uploads/${req.file.filename}`;
    
    const result = await masterPool.query(
      'INSERT INTO photos (user_id, photo_url, caption) VALUES ($1, $2, $3) RETURNING *',
      [req.user.userId, photoUrl, caption || '']
    );
    
    // Invalidate feed cache
    const feedKeys = await redisClient.keys(`feed:*`);
    if (feedKeys.length > 0) {
      await redisClient.del(feedKeys);
    }
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Upload error:`, error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Like a photo
app.post('/api/photos/:id/like', authenticateToken, async (req, res) => {
  try {
    const photoId = parseInt(req.params.id);
    
    await masterPool.query(
      'INSERT INTO likes (user_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, photoId]
    );
    
    // Invalidate related caches
    const feedKeys = await redisClient.keys(`feed:*`);
    if (feedKeys.length > 0) {
      await redisClient.del(feedKeys);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Like error:`, error);
    res.status(500).json({ error: 'Like failed' });
  }
});

// Follow a user
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
  try {
    const followingId = parseInt(req.params.id);
    
    if (followingId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    await masterPool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, followingId]
    );
    
    // Invalidate feed cache
    const feedKeys = await redisClient.keys(`feed:${req.user.userId}:*`);
    if (feedKeys.length > 0) {
      await redisClient.del(feedKeys);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Follow error:`, error);
    res.status(500).json({ error: 'Follow failed' });
  }
});

// Instance info endpoint
app.get('/api/instance', (req, res) => {
  res.json({
    instance: INSTANCE_ID,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    platform: process.platform,
    connections: {
      master: masterPool.totalCount,
      read: readPool.totalCount
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
    }
  });
});

// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((error, req, res, next) => {
  console.error(`[${INSTANCE_ID}] Unhandled error:`, error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the main server
app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] 🚀 Server running on port ${PORT}`);
  console.log(`[${INSTANCE_ID}] 📊 Metrics available on port ${METRICS_PORT}`);
});

// Start metrics server
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

metricsApp.listen(METRICS_PORT, () => {
  console.log(`[${INSTANCE_ID}] 📊 Metrics server running on port ${METRICS_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[${INSTANCE_ID}] Received SIGTERM, shutting down gracefully`);
  
  try {
    await masterPool.end();
    await readPool.end();
    await redisClient.quit();
  } catch (error) {
    console.error(`[${INSTANCE_ID}] Error during shutdown:`, error);
  }
  
  process.exit(0);
});