const express = require('express');
const pool = require('./db/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
const redis = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Redis client with connection handling
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', err => console.log('Redis Error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected'));

// // Connect Redis if not in test mode or ensure connection
// if (process.env.NODE_ENV !== 'test') {
//   redisClient.connect().catch(console.error);
// }

// Create directories
['uploads', 'logs'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { 
  stream: fs.createWriteStream('./logs/access.log', { flags: 'a' }) 
}));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Metrics tracking
const metrics = {
  requests: 0,
  errors: 0,
  responseTimes: [],
  dbQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now()
};

// Request tracking middleware
app.use((req, res, next) => {
  const start = Date.now();
  metrics.requests++;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.responseTimes.push(duration);
    if (metrics.responseTimes.length > 100) {
      metrics.responseTimes.shift();
    }
    if (res.statusCode >= 400) {
      metrics.errors++;
    }
  });
  
  next();
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Cache middleware
const cacheMiddleware = (keyPrefix) => {
  return async (req, res, next) => {
    if (!redisClient.isOpen) {
      return next();
    }
    
    const key = `${keyPrefix}:${req.user?.id || 'anonymous'}:${JSON.stringify(req.query)}`;
    
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        metrics.cacheHits++;
        return res.json(JSON.parse(cached));
      }
      metrics.cacheMisses++;
      
      // Store original json method
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode === 200) {
          redisClient.setEx(key, 60, JSON.stringify(data)).catch(console.error);
        }
        return originalJson(data);
      };
    } catch (err) {
      console.error('Cache error:', err);
    }
    
    next();
  };
};

// ====== API ENDPOINTS ======

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisOk = redisClient.isOpen;
    
    res.json({ 
      status: 'healthy',
      postgres: 'connected',
      redis: redisOk ? 'connected' : 'disconnected',
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      },
      uptime: Math.floor((Date.now() - metrics.startTime) / 1000) + 's'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message 
    });
  }
});

// User Registration
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({ 
      error: 'Username, email, and password are required' 
    });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, hashedPassword]
    );
    
    metrics.dbQueries++;
    const user = result.rows[0];
    
    const token = jwt.sign(
      { id: user.id, username: user.username }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token, 
      userId: user.id, 
      username: user.username 
    });
  } catch (error) {
    metrics.errors++;
    if (error.code === '23505') {
      return res.status(400).json({ 
        error: 'Username or email already exists' 
      });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Username and password are required' 
    });
  }
  
  try {
    const result = await pool.query(
      'SELECT id, username, password FROM users WHERE username = $1',
      [username]
    );
    
    metrics.dbQueries++;
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token, 
      userId: user.id, 
      username: user.username 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload Photo
app.post('/api/photos', authenticateToken, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }
  
  const { caption } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO photos (user_id, filename, caption) VALUES ($1, $2, $3) RETURNING id, filename, caption, created_at',
      [req.user.id, req.file.filename, caption || '']
    );
    
    metrics.dbQueries++;
    const photo = result.rows[0];
    
    // Invalidate feed cache
    if (redisClient.isOpen) {
      await redisClient.del(`feed:${req.user.id}:*`);
    }
    
    res.json({ 
      id: photo.id,
      filename: photo.filename,
      caption: photo.caption,
      url: `${req.protocol}://${req.get('host')}/uploads/${photo.filename}`,
      created_at: photo.created_at
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: 'Failed to save photo' });
  }
});

// Get Feed
app.get('/api/feed', authenticateToken, cacheMiddleware('feed'), async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.filename,
        p.caption,
        p.created_at,
        p.like_count,
        u.username,
        EXISTS(
          SELECT 1 FROM likes 
          WHERE photo_id = p.id AND user_id = $1
        ) as user_liked
      FROM photos p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);
    
    metrics.dbQueries++;
    
    const photos = result.rows.map(photo => ({
      ...photo,
      url: `${req.protocol}://${req.get('host')}/uploads/${photo.filename}`
    }));
    
    res.json(photos);
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Like Photo
app.post('/api/photos/:id/like', authenticateToken, async (req, res) => {
  const photoId = parseInt(req.params.id);
  
  if (!photoId || isNaN(photoId)) {
    return res.status(400).json({ error: 'Invalid photo ID' });
  }
  
  try {
    await pool.query(
      'INSERT INTO likes (user_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, photoId]
    );
    
    metrics.dbQueries++;
    
    // Invalidate caches
    if (redisClient.isOpen) {
      await redisClient.del(`feed:${req.user.id}:*`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like photo' });
  }
});

// Unlike Photo
app.delete('/api/photos/:id/like', authenticateToken, async (req, res) => {
  const photoId = parseInt(req.params.id);
  
  if (!photoId || isNaN(photoId)) {
    return res.status(400).json({ error: 'Invalid photo ID' });
  }
  
  try {
    await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND photo_id = $2',
      [req.user.id, photoId]
    );
    
    metrics.dbQueries++;
    
    // Invalidate caches
    if (redisClient.isOpen) {
      await redisClient.del(`feed:${req.user.id}:*`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Unlike error:', error);
    res.status(500).json({ error: 'Failed to unlike photo' });
  }
});

// Get Metrics
app.get('/api/metrics', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  const avgResponseTime = metrics.responseTimes.length > 0
    ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
    : 0;
  
  res.json({
    stage: 'Stage 2 - PostgreSQL',
    uptime: Math.floor(uptime / 1000) + 's',
    totalRequests: metrics.requests,
    requestsPerSecond: (metrics.requests / (uptime / 1000)).toFixed(2),
    totalErrors: metrics.errors,
    errorRate: metrics.requests > 0 
      ? ((metrics.errors / metrics.requests) * 100).toFixed(2) + '%' 
      : '0%',
    avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
    dbQueries: metrics.dbQueries,
    dbQueriesPerSecond: (metrics.dbQueries / (uptime / 1000)).toFixed(2),
    cacheMetrics: {
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      hitRate: (metrics.cacheHits + metrics.cacheMisses) > 0
        ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%'
    },
    poolStats: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    },
    memoryUsage: process.memoryUsage()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  metrics.errors++;
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function start() {
  try {
    /// Connect to Redis only if not already connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════╗
║          MiniGram Stage 2 - PostgreSQL               ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  🚀 Server: http://localhost:${PORT}                    ║
║  📊 Metrics: http://localhost:${PORT}/metrics           ║
║  💾 Database: PostgreSQL with connection pooling     ║
║  🔄 Pool: ${process.env.DB_POOL_MIN}-${process.env.DB_POOL_MAX} connections                      ║
║  💨 Cache: Redis                                     ║
║                                                      ║
║  ✨ Improvements from Stage 1:                       ║
║  - Connection pooling (100+ concurrent connections)  ║
║  - Redis caching for read operations                 ║
║  - PostgreSQL MVCC for parallel writes               ║
║  - Prepared statements & query optimization          ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
      `);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    async function shutdown() {
      console.log('\n📤 Shutting down gracefully...');
      server.close(async () => {
        await pool.end();
        await redisClient.quit();
        console.log('✅ All connections closed');
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export app for testing
module.exports = app;

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  start();
}