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
const geoip = require('geoip-lite');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;
const region = process.env.REGION || 'us-west';
const replicaMode = process.env.REPLICA_MODE || 'master';
const instanceId = `${region}-${uuidv4().substring(0, 8)}`;

console.log(`🌍 Starting MiniGram Stage 6 - Multi Data Center`);
console.log(`📍 Region: ${region.toUpperCase()}`);
console.log(`🔄 Mode: ${replicaMode.toUpperCase()}`);
console.log(`🆔 Instance: ${instanceId}`);

// Regional configuration mapping
const REGION_CONFIG = {
  'us-west': {
    name: 'US West (Oregon)',
    timezone: 'America/Los_Angeles',
    coordinates: { lat: 45.5152, lng: -122.6784 },
    primaryDB: true,
    cdnEdges: ['us-west-1', 'us-west-2'],
    backupRegions: ['us-east', 'europe']
  },
  'us-east': {
    name: 'US East (Virginia)', 
    timezone: 'America/New_York',
    coordinates: { lat: 38.1316, lng: -78.2040 },
    primaryDB: false,
    cdnEdges: ['us-east-1', 'us-east-2'],
    backupRegions: ['us-west', 'europe']
  },
  'europe': {
    name: 'Europe (Ireland)',
    timezone: 'Europe/Dublin', 
    coordinates: { lat: 53.4129, lng: -8.2439 },
    primaryDB: false,
    cdnEdges: ['eu-west-1', 'eu-central-1'],
    backupRegions: ['us-west', 'us-east']
  }
};

const currentRegionConfig = REGION_CONFIG[region];

// Environment variables with regional defaults
const dbConfig = {
  host: process.env.DB_HOST || `${region}-postgres.internal`,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'minigram',
  user: process.env.DB_USER || 'minigram_user',
  password: process.env.DB_PASS || 'minigram_pass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Enable read-only for replica regions
  ...(replicaMode === 'replica' && { 
    options: '-c default_transaction_read_only=on'
  })
};

const redisConfig = {
  host: process.env.REDIS_HOST || `${region}-redis.internal`,
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300;
const SESSION_SECRET = process.env.SESSION_SECRET || 'multi-dc-secret';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key';
const GEODNS_ENABLED = process.env.GEODNS_ENABLED !== 'false';

// Cross-region replication endpoints
const CROSS_REGION_ENDPOINTS = {
  'us-west': process.env.US_WEST_ENDPOINT || 'http://us-west-lb.internal:3000',
  'us-east': process.env.US_EAST_ENDPOINT || 'http://us-east-lb.internal:3000',
  'europe': process.env.EUROPE_ENDPOINT || 'http://europe-lb.internal:3000'
};

// Initialize Redis clients
const cacheClient = Redis.createClient({
  ...redisConfig,
  db: 0
});

const sessionClient = Redis.createClient({
  ...redisConfig,
  db: 1
});

// Cross-region cache for global data consistency
const globalCacheClient = Redis.createClient({
  ...redisConfig,
  db: 2
});

// Initialize PostgreSQL pool
const pool = new Pool(dbConfig);

// Initialize Prometheus metrics with regional labels
const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ 
  register, 
  prefix: `minigram_stage6_${region.replace('-', '_')}_` 
});

// Custom metrics for multi-DC architecture
const regionalRequestsTotal = new prometheus.Counter({
  name: 'regional_requests_total',
  help: 'Total requests per region',
  labelNames: ['region', 'instance', 'method', 'endpoint'],
  registers: [register],
});

const crossRegionLatency = new prometheus.Histogram({
  name: 'cross_region_latency_seconds',
  help: 'Latency for cross-region operations',
  labelNames: ['source_region', 'target_region', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

const geoLocationRequests = new prometheus.Counter({
  name: 'geo_location_requests_total',
  help: 'Requests by geographic location',
  labelNames: ['region', 'country', 'instance'],
  registers: [register],
});

const dataReplicationStatus = new prometheus.Gauge({
  name: 'data_replication_lag_seconds',
  help: 'Data replication lag between regions',
  labelNames: ['source_region', 'target_region'],
  registers: [register],
});

const requestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'endpoint', 'status_code', 'region', 'instance'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Geographic routing middleware
app.use((req, res, next) => {
  const start = Date.now();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
  
  // Extract real IP from proxy headers
  const realIP = clientIP.split(',')[0].trim();
  let geo = null;
  
  try {
    if (realIP !== '127.0.0.1' && realIP !== '::1') {
      geo = geoip.lookup(realIP);
    }
  } catch (error) {
    console.warn('GeoIP lookup failed:', error.message);
  }
  
  // Add geographic data to request
  req.geo = {
    ip: realIP,
    country: geo?.country || 'unknown',
    region: geo?.region || 'unknown',
    city: geo?.city || 'unknown',
    timezone: geo?.timezone || currentRegionConfig.timezone,
    coordinates: geo ? { lat: geo.ll[0], lng: geo.ll[1] } : currentRegionConfig.coordinates
  };

  // Track geographic requests
  geoLocationRequests.inc({ 
    region, 
    country: req.geo.country, 
    instance: instanceId 
  });

  // Track regional requests
  regionalRequestsTotal.inc({ 
    region, 
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
        region,
        instance: instanceId 
      },
      duration
    );
  });
  
  next();
});

// Session configuration with regional Redis
app.use(session({
  store: new RedisStore({ client: sessionClient }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  name: `minigram.${region}.sid`
}));

// File upload configuration with regional storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', region);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${region}-photo-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Connect to services
async function connectServices() {
  try {
    await cacheClient.connect();
    await sessionClient.connect();
    await globalCacheClient.connect();
    console.log(`✅ Connected to Redis (${region})`);
    
    await pool.query('SELECT NOW()');
    console.log(`✅ Connected to PostgreSQL (${region})`);
    
    // Initialize database
    await initializeDatabase();
    
    // Start cross-region health checks
    startHealthChecks();
    
    // Start data synchronization
    if (replicaMode === 'master') {
      startDataReplication();
    }
    
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
      home_region VARCHAR(20) DEFAULT '${region}',
      preferred_language VARCHAR(10) DEFAULT 'en',
      timezone VARCHAR(50) DEFAULT '${currentRegionConfig.timezone}'
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      caption TEXT,
      upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      file_size INTEGER DEFAULT 0,
      region_stored VARCHAR(20) DEFAULT '${region}',
      instance_processed VARCHAR(50) DEFAULT '${instanceId}',
      replication_status VARCHAR(20) DEFAULT 'pending',
      cdn_urls JSONB DEFAULT '{}'::jsonb
    )`,
    `CREATE TABLE IF NOT EXISTS region_sync_log (
      id SERIAL PRIMARY KEY,
      source_region VARCHAR(20) NOT NULL,
      target_region VARCHAR(20) NOT NULL,
      sync_type VARCHAR(50) NOT NULL,
      record_id INTEGER,
      sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'success',
      latency_ms INTEGER
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_photos_region ON photos(region_stored)`,
    `CREATE INDEX IF NOT EXISTS idx_users_region ON users(home_region)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_log_time ON region_sync_log(sync_time DESC)`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }
  console.log(`✅ Database initialized (${region})`);
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (req.session && req.session.userId) {
      req.userId = req.session.userId;
      return next();
    }
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = user.userId;
    next();
  });
}

// Cross-region data replication
async function replicateToRegions(data, operation, recordId) {
  if (replicaMode !== 'master') return;
  
  const replicationPromises = currentRegionConfig.backupRegions.map(async (targetRegion) => {
    const startTime = Date.now();
    
    try {
      const endpoint = CROSS_REGION_ENDPOINTS[targetRegion];
      if (!endpoint) return;

      // Simulate cross-region replication
      await new Promise(resolve => setTimeout(resolve, 10)); // Network latency simulation
      
      const latency = Date.now() - startTime;
      crossRegionLatency.observe(
        { source_region: region, target_region: targetRegion, operation },
        latency / 1000
      );

      // Log replication
      await pool.query(
        'INSERT INTO region_sync_log (source_region, target_region, sync_type, record_id, latency_ms) VALUES ($1, $2, $3, $4, $5)',
        [region, targetRegion, operation, recordId, latency]
      );
      
      console.log(`📡 Replicated ${operation} to ${targetRegion} (${latency}ms)`);
      
    } catch (error) {
      console.error(`❌ Replication to ${targetRegion} failed:`, error.message);
      
      await pool.query(
        'INSERT INTO region_sync_log (source_region, target_region, sync_type, record_id, status) VALUES ($1, $2, $3, $4, $5)',
        [region, targetRegion, operation, recordId, 'failed']
      );
    }
  });
  
  await Promise.allSettled(replicationPromises);
}

// Health check system
function startHealthChecks() {
  cron.schedule('*/30 * * * * *', async () => { // Every 30 seconds
    try {
      const healthData = {
        region,
        instanceId,
        timestamp: new Date().toISOString(),
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeConnections: pool.totalCount
      };
      
      await globalCacheClient.setEx(`health:${region}:${instanceId}`, 60, JSON.stringify(healthData));
      
    } catch (error) {
      console.error('Health check failed:', error);
    }
  });
}

// Data synchronization monitoring
function startDataReplication() {
  cron.schedule('*/5 * * * *', async () => { // Every 5 minutes
    try {
      // Calculate replication lag
      const replicationLag = await pool.query(`
        SELECT 
          target_region,
          AVG(latency_ms) as avg_latency,
          COUNT(*) as sync_count
        FROM region_sync_log 
        WHERE source_region = $1 
          AND sync_time > NOW() - INTERVAL '5 minutes'
        GROUP BY target_region
      `, [region]);
      
      replicationLag.rows.forEach(row => {
        dataReplicationStatus.set(
          { source_region: region, target_region: row.target_region },
          row.avg_latency / 1000 // Convert to seconds
        );
      });
      
    } catch (error) {
      console.error('Replication monitoring failed:', error);
    }
  });
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to MiniGram Stage 6 - Multi Data Center`,
    region: currentRegionConfig.name,
    instanceId,
    userLocation: req.geo,
    localTime: new Date().toLocaleString('en-US', { 
      timeZone: currentRegionConfig.timezone 
    })
  });
});

// Health check with regional information
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await cacheClient.ping();
    
    // Check cross-region connectivity
    const crossRegionHealth = {};
    for (const targetRegion of currentRegionConfig.backupRegions) {
      try {
        const healthData = await globalCacheClient.get(`health:${targetRegion}:*`);
        crossRegionHealth[targetRegion] = healthData ? 'healthy' : 'unknown';
      } catch (error) {
        crossRegionHealth[targetRegion] = 'unhealthy';
      }
    }
    
    res.json({ 
      status: 'healthy', 
      region: currentRegionConfig.name,
      instanceId,
      replicationMode: replicaMode,
      timestamp: new Date().toISOString(),
      crossRegionHealth,
      userGeo: req.geo
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      region: currentRegionConfig.name,
      instanceId,
      error: error.message 
    });
  }
});

// User registration with regional optimization
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, home_region, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email',
      [username, email, passwordHash, region, req.geo.timezone]
    );

    const user = result.rows[0];
    
    // Replicate user data to other regions
    await replicateToRegions(user, 'user_registration', user.id);
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({ 
      message: 'User registered successfully',
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        homeRegion: region
      },
      token,
      region: currentRegionConfig.name,
      instanceId
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

// Photo upload with CDN distribution
app.post('/api/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { caption } = req.body;
    
    // Generate CDN URLs for global distribution
    const cdnUrls = {};
    currentRegionConfig.cdnEdges.forEach(edge => {
      cdnUrls[edge] = `https://cdn-${edge}.minigram.com/${req.file.filename}`;
    });
    
    const result = await pool.query(
      'INSERT INTO photos (user_id, filename, caption, file_size, region_stored, instance_processed, cdn_urls) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.userId, req.file.filename, caption || '', req.file.size, region, instanceId, JSON.stringify(cdnUrls)]
    );

    const photo = result.rows[0];
    
    // Replicate photo metadata to other regions
    await replicateToRegions(photo, 'photo_upload', photo.id);
    
    // Cache photo metadata globally
    const cacheKey = `photo:${photo.id}`;
    await globalCacheClient.setEx(cacheKey, CACHE_TTL * 3, JSON.stringify(photo)); // Longer TTL for global cache
    
    res.status(201).json({ 
      message: 'Photo uploaded successfully',
      photo: {
        ...photo,
        uploadRegion: currentRegionConfig.name,
        cdnUrls: JSON.parse(photo.cdn_urls)
      },
      region: currentRegionConfig.name,
      instanceId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get photos with global caching
app.get('/api/photos', authenticateToken, async (req, res) => {
  try {
    const cacheKey = `user_photos:${req.userId}`;
    
    // Try global cache first for better cross-region performance
    const cached = await globalCacheClient.get(cacheKey);
    if (cached) {
      return res.json({ 
        photos: JSON.parse(cached),
        cached: true,
        cacheRegion: 'global',
        servedBy: currentRegionConfig.name,
        instanceId
      });
    }

    // Fallback to database
    const result = await pool.query(
      'SELECT *, region_stored as upload_region FROM photos WHERE user_id = $1 ORDER BY upload_time DESC LIMIT 50',
      [req.userId]
    );

    const photos = result.rows.map(photo => ({
      ...photo,
      cdn_urls: typeof photo.cdn_urls === 'string' ? JSON.parse(photo.cdn_urls) : photo.cdn_urls
    }));
    
    // Cache globally for cross-region access
    await globalCacheClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(photos));

    res.json({ 
      photos,
      cached: false,
      servedBy: currentRegionConfig.name,
      instanceId
    });
  } catch (error) {
    console.error('Photos fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Regional statistics endpoint
app.get('/api/regional-stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN home_region = $1 THEN 1 END) as local_users,
        (SELECT COUNT(*) FROM photos WHERE region_stored = $1) as photos_stored,
        (SELECT COUNT(*) FROM region_sync_log WHERE source_region = $1 AND sync_time > NOW() - INTERVAL '1 hour') as recent_syncs
    `, [region]);

    const replicationLag = await pool.query(`
      SELECT 
        target_region,
        AVG(latency_ms) as avg_latency_ms,
        MAX(latency_ms) as max_latency_ms,
        COUNT(*) as sync_count
      FROM region_sync_log 
      WHERE source_region = $1 
        AND sync_time > NOW() - INTERVAL '1 hour'
      GROUP BY target_region
    `, [region]);

    res.json({
      region: currentRegionConfig.name,
      regionCode: region,
      statistics: stats.rows[0],
      replicationMetrics: replicationLag.rows,
      serverTime: new Date().toISOString(),
      localTime: new Date().toLocaleString('en-US', { 
        timeZone: currentRegionConfig.timezone 
      }),
      instanceId
    });
  } catch (error) {
    console.error('Regional stats error:', error);
    res.status(500).json({ error: 'Failed to fetch regional stats' });
  }
});

// Metrics endpoint with regional labels
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).end();
  }
});

// GeoDNS routing simulation endpoint
app.get('/api/nearest-datacenter', (req, res) => {
  // Calculate distances to all regions (simplified)
  const distances = Object.entries(REGION_CONFIG).map(([regionCode, config]) => {
    const userLat = req.geo.coordinates.lat;
    const userLng = req.geo.coordinates.lng;
    const dcLat = config.coordinates.lat;
    const dcLng = config.coordinates.lng;
    
    // Simple distance calculation (Haversine would be more accurate)
    const distance = Math.sqrt(
      Math.pow(userLat - dcLat, 2) + Math.pow(userLng - dcLng, 2)
    );
    
    return {
      region: regionCode,
      name: config.name,
      distance: distance,
      estimatedLatency: Math.round(distance * 10) + 'ms' // Rough estimate
    };
  }).sort((a, b) => a.distance - b.distance);

  res.json({
    userLocation: req.geo,
    currentRegion: {
      code: region,
      name: currentRegionConfig.name,
      serving: true
    },
    nearestDatacenters: distances,
    geoDNSRecommendation: distances[0],
    routingDecision: distances[0].region === region ? 'optimal' : 'suboptimal'
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Error:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ 
    error: 'Internal server error',
    region: currentRegionConfig.name,
    instanceId
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Graceful shutdown starting...');
  try {
    await cacheClient.quit();
    await sessionClient.quit();
    await globalCacheClient.quit();
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
    console.log(`🌍 MiniGram Stage 6 (Multi-DC) running on port ${port}`);
    console.log(`📍 Region: ${currentRegionConfig.name}`);
    console.log(`🔄 Mode: ${replicaMode}`);
    console.log(`🆔 Instance: ${instanceId}`);
    console.log(`⏰ Timezone: ${currentRegionConfig.timezone}`);
    console.log(`📈 Metrics: http://localhost:${port}/metrics`);
    console.log(`🌐 GeoDNS: ${GEODNS_ENABLED ? 'Enabled' : 'Disabled'}`);
  });
});

module.exports = app;