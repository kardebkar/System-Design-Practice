# 🚀 System Design Practice: Scale from Zero to Millions

## 📊 Interactive Performance Dashboard
**[🎯 VIEW LIVE DASHBOARD](https://kardebkar.github.io/System-Design-Practice/)** - Real-time performance comparison with CI/CD integration

**Features:**
- 🔄 **Live CI/CD Status** - Real-time GitHub Actions integration
- 📈 **Interactive Charts** - Response time trends and error distribution
- 📊 **Performance Metrics** - SQLite vs PostgreSQL comparison
- 🚀 **Auto-Updates** - Refreshes with every code push

---

## 🏗️ Complete Project Structure

```
System-Design-Practice/
├── 🌐 Live Dashboard: https://kardebkar.github.io/System-Design-Practice/
├── ⚙️ .github/workflows/           # CI/CD automation
│   ├── ci.yml                     # Performance testing pipeline
│   └── deploy-pages.yml           # Dashboard deployment
├── 📊 TROUBLESHOOTING.md          # Complete debugging guide
├── 🔧 github-pages-setup.md      # Setup instructions
├── 📋 README.md                   # This file
└── chapter-1-minigram/
    ├── stage-1/                   # SQLite implementation
    │   ├── 📊 Performance: 5 users max, 35% error rate
    │   └── 🎯 Interview Gold: Breaking point analysis
    └── stage-2/                   # PostgreSQL implementation  
        ├── 📊 Performance: 200+ users, <1% error rate
        ├── 🚀 46% faster response times
        └── 🎯 Interview Gold: Scaling architecture decisions
```

## 🎯 Stage Comparison Overview

| Aspect | Stage 1 (SQLite) | Stage 2 (PostgreSQL) | Improvement |
|--------|------------------|----------------------|-------------|
| **Max Users** | 5 concurrent | 200+ concurrent | **40x increase** |
| **Response Time** | 2.8s @ 50 users | 1.5s @ 200 users | **46% faster** |
| **Error Rate** | 35.71% under load | <1% under load | **35x better** |
| **User Experience** | 40.5/100 @ 50 users | 79.8/100 @ 200 users | **2x better** |
| **Architecture** | Single process | Connection pooling + Redis | **Production ready** |

## 🎯 Stage 1: Single Server Architecture

Everything runs on ONE server:
* Web Server (Express.js)
* Database (SQLite) 
* File Storage (Local filesystem)
* No caching
* No load balancing
* Single process, single thread

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Seed test data (users + photos)
npm run seed:all

# Start the server
npm run dev

# In another terminal, run tests
npm run test:diagnostic  # Check system health
npm run test:stress     # Comprehensive stress test
npm run test:breaking   # Find breaking points
```

## 📊 Performance Dashboards

### 🌐 Live Dashboard (Production)
**[View Live Dashboard](https://kardebkar.github.io/System-Design-Practice/)**
- Real-time CI/CD status from GitHub Actions
- Interactive performance charts
- Automatic updates with every deployment

### 🔧 Local Development Dashboard
Visit: http://localhost:3000/metrics.html
- Local performance metrics
- Real-time server monitoring

## 🔥 Performance Test Results

### Breaking Points Discovered
* **Maximum Concurrent Users:** 5 (with realistic usage)
* **Maximum RPS:** 1.5 requests/second
* **Error Rate at Load:** 35.71%
* **Success Rate:** 55.6%

### Operation Performance
**Write Operations (SLOW):**
```
├─ Register: 89ms avg (128ms max)
└─ Login: 70ms avg (105ms max)
```

**Read Operations (FAST):**
```
├─ Get Feed: 2ms avg
├─ Like Photo: 2ms avg
└─ Follow User: 1ms avg
```

### Key Bottlenecks
* **SQLite Write Locks:** Single writer limitation causes cascading failures
* **No Connection Pooling:** 10-20ms overhead per operation
* **No Caching:** Every request hits the database
* **Single Process:** CPU bound at 1.5 RPS

## 📈 What Actually Happens Under Load

| Users | Success Rate | Error Rate | Avg Response |
|-------|--------------|------------|--------------|
| 1     | 100%         | 0%         | 4ms          |
| 5     | 55.6%        | 35.71%     | 14ms         |
| 10    | <30%         | >60%       | Timeouts     |
| 20    | System Crash | -          | -            |

## 🏆 Interview Gold - Real Findings

### 1. The 5-User Reality Check
*"While testing isolated operations showed the system could handle 100 concurrent reads, simulating real user behavior revealed it failed at just 5 concurrent users. Each user performing typical activities (register, login, browse, like, follow) pushed the system to a 36% error rate."*

### 2. The 35-45x Performance Gap
*"I discovered a massive performance gap between read and write operations. Reads completed in 1-3ms while writes took 70-89ms. This 35-45x difference is due to SQLite's file-level locking mechanism."*

### 3. SQLite's Single-Writer Bottleneck
*"SQLite uses file-level locking, meaning only one write operation can occur at a time. With registration taking 89ms, all other writes are blocked during that time, creating a cascade of timeouts and retries."*

### 4. The 1.5 RPS Ceiling
*"The single-process architecture hit a hard limit at 1.5 requests per second. This is equivalent to just 90 requests per minute - completely inadequate for any production system."*

### 5. No Connection Pooling Cost
*"Without connection pooling, every operation opened a new database connection, adding 10-20ms overhead. With each user performing ~9 operations, that's 90-180ms wasted per user."*

## 🎓 Interview Talking Points

After implementing Stage 1, you can discuss:

### Architectural Limitations
* **Single Point of Failure:** One server dies = entire system down
* **No Horizontal Scaling:** Can't add more servers to handle load
* **Resource Contention:** CPU, memory, and I/O all compete
* **Database as Bottleneck:** SQLite's architecture limits concurrency

### Specific Metrics to Mention
* *"System failed at 5 concurrent users with real usage patterns"*
* *"35.71% error rate under normal load"*
* *"1.5 RPS maximum throughput"*
* *"35-45x performance gap between reads and writes"*
* *"No caching resulted in 4.38 unnecessary DB hits per user"*

### Lessons Learned
* **Test with realistic patterns:** Isolated benchmarks hide real problems
* **Database choice matters:** SQLite is great for development, terrible for production
* **Caching is not optional:** Even basic caching could 10x read performance
* **Connection pooling is critical:** Reduces overhead significantly

## 🔧 Quick Optimizations (Before Stage 2)

```javascript
// 1. Connection Reuse (20% improvement)
db.configure('busyTimeout', 3000);

// 2. Simple Caching (10x read improvement)
const cache = new Map();
// ... cache implementation

// 3. Write Batching (2-3x write improvement)
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  // batch operations
  db.run('COMMIT');
});
```

## 📊 Stage 1 vs Stage 2 Preview

| Metric | Stage 1 (SQLite) | Stage 2 (PostgreSQL) | Improvement |
|--------|------------------|----------------------|-------------|
| Max Concurrent Users | 5 | 500+ | 100x |
| Max RPS | 1.5 | 150+ | 100x |
| Error Rate | 35.71% | <1% | 35x better |
| Write Performance | 70-89ms | 5-10ms | 10x faster |
| Connection Limit | 1 | 100+ | 100x |

## 🚨 Common Issues & Fixes

### "No photos in database" error
```bash
npm run seed:photos
```

### "SQLITE_BUSY" errors
* Add retry logic with exponential backoff
* Implement write queuing

### High error rates
This is expected! SQLite can't handle concurrent writes. Document these failures - they're interview gold!

## 🎯 Next Steps

1. **View the Live Dashboard:**
   ```bash
   # Open the live performance dashboard
   open https://kardebkar.github.io/System-Design-Practice/
   ```

2. **Document your metrics:**
   ```bash
   npm run test:stress > stage1-final-metrics.txt
   ```

3. **Try quick optimizations (optional):**
   * Add connection reuse
   * Implement basic caching
   * Test improvement

4. **Move to Stage 2:**
   ```bash
   cd ../stage-2
   docker-compose up -d
   ```

## 🚀 CI/CD Integration

The project automatically:
- **Runs performance tests** on every push
- **Updates the live dashboard** with real results
- **Compares SQLite vs PostgreSQL** performance
- **Provides interview-ready metrics** and insights

**GitHub Actions Pipeline:** https://github.com/kardebkar/System-Design-Practice/actions

**Remember:** The "failures" in Stage 1 are actually successes - you've proven why distributed systems exist! 🚀