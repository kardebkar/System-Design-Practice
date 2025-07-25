const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'stage1-secret-key';

// Create necessary directories
['uploads', 'logs'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: fs.createWriteStream('./logs/access.log', { flags: 'a' }) }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// METRICS TRACKING
const metrics = {
  requests: 0,
  errors: 0,
  responseTimes: [],
  dbQueries: 0,
  activeConnections: 0,
  startTime: Date.now(),
  endpoints: {}
};

// Track response times
app.use((req, res, next) => {
  const start = Date.now();
  metrics.requests++;
  metrics.activeConnections++;
  
  // Track endpoint usage
  const endpoint = `${req.method} ${req.path}`;
  metrics.endpoints[endpoint] = (metrics.endpoints[endpoint] || 0) + 1;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.responseTimes.push(duration);
    if (metrics.responseTimes.length > 100) metrics.responseTimes.shift();
    metrics.activeConnections--;
    
    if (res.statusCode >= 400) metrics.errors++;
  });
  
  next();
});

// SQLite Database Setup
const db = new sqlite3.Database('./minigram.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('📦 Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL,
    photo_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, photo_id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (photo_id) REFERENCES photos (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users (id),
    FOREIGN KEY (following_id) REFERENCES users (id)
  )`);
  
  // Create indexes for better performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at)`);
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// API ENDPOINTS

// User Registration
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        metrics.dbQueries++;
        if (err) {
          return res.status(400).json({ error: 'User already exists' });
        }
        
        const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET);
        res.json({ token, userId: this.lastID, username });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      metrics.dbQueries++;
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
      res.json({ token, userId: user.id, username });
    }
  );
});

// Upload Photo (CPU intensive!)
app.post('/api/photos', authenticateToken, upload.single('photo'), async (req, res) => {
  const { caption } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }
  
  // Simulate image processing (CPU intensive)
  const processingStart = Date.now();
  let sum = 0;
  for (let i = 0; i < 5000000; i++) {
    sum += Math.sqrt(i);
  }
  const processingTime = Date.now() - processingStart;
  
  db.run(
    'INSERT INTO photos (user_id, filename, caption) VALUES (?, ?, ?)',
    [req.user.id, req.file.filename, caption || ''],
    function(err) {
      metrics.dbQueries++;
      if (err) {
        return res.status(500).json({ error: 'Failed to save photo' });
      }
      
      res.json({ 
        id: this.lastID,
        filename: req.file.filename,
        caption,
        processingTime: processingTime + 'ms',
        url: `http://localhost:${PORT}/uploads/${req.file.filename}`
      });
    }
  );
});

// Get Feed (No pagination - bad for scale!)
app.get('/api/feed', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      p.*,
      u.username,
      COUNT(DISTINCT l.user_id) as like_count,
      EXISTS(SELECT 1 FROM likes WHERE photo_id = p.id AND user_id = ?) as user_liked
    FROM photos p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN likes l ON p.id = l.photo_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 50
  `;
  
  db.all(query, [req.user.id], (err, photos) => {
    metrics.dbQueries++;
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch feed' });
    }
    
    const photosWithUrls = photos.map(photo => ({
      ...photo,
      url: `http://localhost:${PORT}/uploads/${photo.filename}`,
      user_liked: !!photo.user_liked
    }));
    
    res.json(photosWithUrls);
  });
});

// Like Photo
app.post('/api/photos/:id/like', authenticateToken, (req, res) => {
  db.run(
    'INSERT OR IGNORE INTO likes (user_id, photo_id) VALUES (?, ?)',
    [req.user.id, req.params.id],
    (err) => {
      metrics.dbQueries++;
      if (err) {
        return res.status(500).json({ error: 'Failed to like photo' });
      }
      res.json({ success: true });
    }
  );
});

// Unlike Photo
app.delete('/api/photos/:id/like', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM likes WHERE user_id = ? AND photo_id = ?',
    [req.user.id, req.params.id],
    (err) => {
      metrics.dbQueries++;
      if (err) {
        return res.status(500).json({ error: 'Failed to unlike photo' });
      }
      res.json({ success: true });
    }
  );
});

// Get Metrics
app.get('/api/metrics', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  const avgResponseTime = metrics.responseTimes.length > 0
    ? metrics.responseTimes.reduce((a, b) => a + b) / metrics.responseTimes.length
    : 0;
  
  res.json({
    uptime: Math.floor(uptime / 1000) + 's',
    totalRequests: metrics.requests,
    requestsPerSecond: (metrics.requests / (uptime / 1000)).toFixed(2),
    activeConnections: metrics.activeConnections,
    totalErrors: metrics.errors,
    errorRate: ((metrics.errors / metrics.requests) * 100).toFixed(2) + '%',
    avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
    dbQueries: metrics.dbQueries,
    dbQueriesPerSecond: (metrics.dbQueries / (uptime / 1000)).toFixed(2),
    memoryUsage: process.memoryUsage(),
    endpoints: metrics.endpoints
  });
});

// Serve metrics dashboard
app.get('/metrics', (req, res) => {
  res.redirect('/metrics.html');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          MiniGram Stage 1 - Single Server            ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  🚀 Server: http://localhost:${PORT}                    ║
║  📊 Metrics: http://localhost:${PORT}/metrics           ║
║  💾 Database: SQLite (./minigram.db)                ║
║  📁 Storage: Local filesystem (./uploads)            ║
║                                                      ║
║  ⚠️  Limitations:                                    ║
║  - Everything on ONE server                          ║
║  - No caching                                        ║
║  - No load balancing                                 ║
║  - SQLite = write locks                              ║
║  - Image processing blocks requests                  ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📤 Shutting down gracefully...');
  server.close(() => {
    db.close(() => {
      console.log('✅ Database closed');
      process.exit(0);
    });
  });
});