const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const Redis = require('redis');
const prometheus = require('prom-client');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const instanceId = process.env.INSTANCE_ID || uuidv4().substring(0, 8);

console.log(`🚀 Starting MiniGram Stage 5 - Stateless Web Tier (Instance: ${instanceId})`);

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
  password: process.env.REDIS_PASSWORD || null,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes default
const SESSION_SECRET = process.env.SESSION_SECRET || 'stateless-web-tier-secret';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key';

// Initialize Redis clients - separate for cache and sessions
const cacheClient = Redis.createClient(redisConfig);
const sessionClient = Redis.createClient({
  ...redisConfig,
  db: 1, // Use separate Redis database for sessions
});

// Initialize PostgreSQL pool
const pool = new Pool(dbConfig);

// Initialize Prometheus metrics
const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register, prefix: 'minigram_stage5_' });

// Custom metrics for stateless architecture
const sessionMetrics = new prometheus.Counter({
  name: 'session_operations_total',
  help: 'Total number of session operations',
  labelNames: ['operation', 'instance'],
  registers: [register],
});

const instanceMetrics = new prometheus.Counter({
  name: 'request_instance_total',
  help: 'Total requests per instance',
  labelNames: ['instance', 'method', 'endpoint'],
  registers: [register],
});

const cacheHitsTotal = new prometheus.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'instance'],
  registers: [register],
});

const requestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'endpoint', 'status_code', 'instance'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request tracking middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Track request per instance
  instanceMetrics.inc({ 
    instance: instanceId, 
    method: req.method, 
    endpoint: req.path 
  });

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    requestDuration.observe(
      { 
        method: req.method, 
        endpoint: req.path, 
        status_code: res.statusCode,
        instance: instanceId 
      },
      duration
    );
  });
  
  next();
});

// Session configuration with external Redis storage
app.use(session({
  store: new RedisStore({ client: sessionClient }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'minigram.sid'
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `photo-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Connect to Redis and PostgreSQL
async function connectServices() {
  try {
    await cacheClient.connect();
    await sessionClient.connect();
    console.log('✅ Connected to Redis (cache & sessions)');
    
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');
    
    // Initialize database tables
    await initializeDatabase();
  } catch (error) {
    console.error('❌ Failed to connect to services:', error);
    process.exit(1);
  }
}

async function initializeDatabase() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      session_data JSONB DEFAULT '{}'::jsonb
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      caption TEXT,
      upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      file_size INTEGER DEFAULT 0,
      instance_processed VARCHAR(50) DEFAULT '${instanceId}',
      cache_status VARCHAR(20) DEFAULT 'uncached'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_photos_upload_time ON photos(upload_time DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }
  console.log('✅ Database initialized');
}

// Authentication middleware for stateless operations
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Fall back to session-based auth
    if (req.session && req.session.userId) {
      sessionMetrics.inc({ operation: 'session_auth', instance: instanceId });
      req.userId = req.session.userId;
      return next();
    }
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    sessionMetrics.inc({ operation: 'jwt_auth', instance: instanceId });
    req.userId = user.userId;
    next();
  });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await cacheClient.ping();
    res.json({ 
      status: 'healthy', 
      instance: instanceId,
      timestamp: new Date().toISOString(),
      architecture: 'stateless-web-tier'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      instance: instanceId,
      error: error.message 
    });
  }
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    
    // Generate JWT token for stateless auth
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({ 
      message: 'User registered successfully',
      user: { id: user.id, username: user.username, email: user.email },
      token,
      instance: instanceId
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const bcrypt = require('bcrypt');

    const result = await pool.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Store in session AND provide JWT for stateless access
    req.session.userId = user.id;
    sessionMetrics.inc({ operation: 'session_create', instance: instanceId });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email },
      token,
      instance: instanceId
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    sessionMetrics.inc({ operation: 'session_destroy', instance: instanceId });
    res.json({ message: 'Logged out successfully', instance: instanceId });
  });
});

// Upload photo
app.post('/api/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { caption } = req.body;
    const result = await pool.query(
      'INSERT INTO photos (user_id, filename, caption, file_size, instance_processed) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, req.file.filename, caption || '', req.file.size, instanceId]
    );

    // Cache the photo metadata
    const photoData = result.rows[0];
    const cacheKey = `photo:${photoData.id}`;
    await cacheClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(photoData));
    cacheHitsTotal.inc({ cache_type: 'photo_metadata', instance: instanceId });

    res.status(201).json({ 
      message: 'Photo uploaded successfully',
      photo: photoData,
      instance: instanceId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get photos with intelligent caching
app.get('/api/photos', authenticateToken, async (req, res) => {
  try {
    const cacheKey = `user_photos:${req.userId}`;
    
    // Try cache first
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      cacheHitsTotal.inc({ cache_type: 'user_photos', instance: instanceId });
      return res.json({ 
        photos: JSON.parse(cached),
        cached: true,
        instance: instanceId
      });
    }

    // Fallback to database
    const result = await pool.query(
      'SELECT * FROM photos WHERE user_id = $1 ORDER BY upload_time DESC LIMIT 50',
      [req.userId]
    );

    const photos = result.rows;
    
    // Cache for future requests
    await cacheClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(photos));

    res.json({ 
      photos,
      cached: false,
      instance: instanceId
    });
  } catch (error) {
    console.error('Photos fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Get metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).end();
  }
});

// Instance info endpoint for debugging stateless behavior
app.get('/api/instance', (req, res) => {
  res.json({
    instanceId,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    architecture: 'stateless-web-tier',
    sessionStore: 'redis-external',
    cacheStore: 'redis-external'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ 
    error: 'Internal server error',
    instance: instanceId
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Graceful shutdown starting...');
  try {
    await cacheClient.quit();
    await sessionClient.quit();
    await pool.end();
    console.log('✅ Connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
});

// Start server
connectServices().then(() => {
  app.listen(port, () => {
    console.log(`🚀 MiniGram Stage 5 (Stateless Web Tier) running on port ${port}`);
    console.log(`📊 Instance ID: ${instanceId}`);
    console.log(`🔄 Session Store: External Redis (Database 1)`);
    console.log(`💾 Cache Store: External Redis (Database 0)`);
    console.log(`📈 Metrics: http://localhost:${port}/metrics`);
    console.log('🎯 Architecture: Stateless servers with external session storage');
  });
});

module.exports = app;