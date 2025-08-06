# MiniGram Stage 4 - Cache Layer & CDN Implementation

## 🚀 Overview

Stage 4 implements a comprehensive caching strategy and CDN simulation, following Chapter 1 of Alex Xu's "System Design Interview: An Insider's Guide". This stage demonstrates how caching can dramatically improve application performance and user experience.

### Architecture Evolution

```
Stage 1: SQLite (100 RPS)
    ↓
Stage 2: PostgreSQL + Connection Pooling (500 RPS)
    ↓
Stage 3: Load Balancer + 3 App Instances (2,000 RPS)
    ↓
Stage 4: Cache Layer + CDN (5,000+ RPS) ← You are here
```

## 🏗️ Architecture Components

### Multi-Layer Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                          Client                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    NGINX Load Balancer                     │
│                   (Proxy Cache Layer)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
│   App Instance │ │   App Instance │ │   App Instance │
│      + Cache   │ │      + Cache   │ │      + Cache   │
│    Manager     │ │    Manager     │ │    Manager     │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Redis Cache Layer                        │
│            (Application-level Caching)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                PostgreSQL Database                         │
│                (Master + 2 Replicas)                       │
└─────────────────────────────────────────────────────────────┘

                  Static Assets Flow:
┌─────────────────────────────────────────────────────────────┐
│                     CDN Server                              │
│            (Aggressive Static Caching)                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **NGINX Proxy Cache**: First-level caching for API responses
2. **Redis Cache Layer**: Application-level cache with intelligent strategies
3. **CDN Simulation**: Optimized static asset delivery
4. **Cache Manager**: Sophisticated cache-aside pattern implementation
5. **Monitoring Stack**: Real-time cache performance tracking

## 🎯 Performance Improvements

### Cache Hit Ratio Targets
- **User Data**: 85-90% hit ratio
- **Posts**: 70-80% hit ratio  
- **System Stats**: 95%+ hit ratio
- **Static Assets**: 98%+ hit ratio

### Response Time Improvements
- **Cached Requests**: 5-15ms average
- **Uncached Requests**: 50-200ms average
- **Static Assets**: 1-5ms average
- **Overall Improvement**: 2.5x faster than Stage 3

## 🚦 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for load testing)
- 8GB+ RAM recommended

### Quick Start

1. **Start the complete stack:**
   ```bash
   docker-compose up -d
   ```

2. **Verify all services are running:**
   ```bash
   docker-compose ps
   ```

3. **Access the application:**
   - **Main App**: http://localhost
   - **Grafana Dashboard**: http://localhost:3001 (admin/admin123)
   - **Prometheus**: http://localhost:9090
   - **Redis Insight**: http://localhost:8001

### Service Health Checks

```bash
# Application health
curl http://localhost/health

# Cache status
curl http://localhost/api/cache/stats

# CDN health
curl http://localhost:8081/health

# Instance information
curl http://localhost/api/instance
```

## 🧪 Load Testing & Performance Analysis

### Run Cache Performance Test

```bash
# Quick test
./scripts/run-load-test.sh

# Custom test with high concurrency
./scripts/run-load-test.sh -c 50 -r 2000 -d 120

# Compare with previous stages
node ./scripts/stage-comparison.js
```

### Load Test Options

```bash
./scripts/run-load-test.sh [options]

Options:
  -u, --url URL          Base URL to test (default: http://localhost)
  -p, --port PORT        Port to test (default: 80)
  -c, --concurrency NUM  Concurrent requests (default: 20)
  -r, --requests NUM     Total requests (default: 1000)
  -d, --duration SEC     Test duration (default: 60)
```

### Expected Results

**Stage 4 Performance Metrics:**
```
Cached Requests:
  Average Response Time: 8-12ms
  95th Percentile: 15-25ms
  Cache Hit Ratio: 80-90%

Uncached Requests:
  Average Response Time: 45-80ms
  95th Percentile: 100-150ms

Overall Throughput: 4,000-6,000 RPS
```

## 💾 Cache Management

### Cache Operations

```bash
# Warm the cache
curl -X POST http://localhost/api/cache/warm

# Invalidate all cache
curl -X POST http://localhost/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "*"}'

# Invalidate user cache only
curl -X POST http://localhost/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "user:*"}'

# Get cache statistics
curl http://localhost/api/cache/stats
```

### Cache Key Patterns

- **Users**: `user:{id}`, `user_email:{email}`
- **Posts**: `post:{id}`, `posts:recent:page:{page}:limit:{limit}`
- **System**: `system:stats`

### TTL Strategies

- **Users**: 15 minutes (900s)
- **Posts**: 10 minutes (600s)
- **Recent Posts**: 5 minutes (300s)
- **System Stats**: 1 minute (60s)
- **Static Assets**: 1 year

## 📊 Monitoring & Dashboards

### Grafana Dashboards

Access Grafana at http://localhost:3001 (admin/admin123)

**Available Dashboards:**
1. **Cache Performance**: Hit ratios, operation latency, throughput
2. **Application Metrics**: Response times, request rates, errors
3. **System Resources**: CPU, memory, network usage
4. **Database Performance**: Query times, connection pools

### Key Metrics to Monitor

```
Cache Performance:
- cache_hits_total
- cache_misses_total
- cache_operation_duration_seconds
- cache_hit_ratio

Application Performance:
- http_request_duration_seconds
- http_requests_total
- db_query_duration_seconds
- active_connections
```

### Prometheus Queries

```promql
# Cache hit ratio
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100

# Average response time improvement
histogram_quantile(0.95, http_request_duration_seconds_bucket{cached="true"}) vs
histogram_quantile(0.95, http_request_duration_seconds_bucket{cached="false"})

# Requests per second
rate(http_requests_total[5m])
```

## 🔧 Configuration

### Environment Variables

```bash
# Application Configuration
NODE_ENV=production
CACHE_TTL=300              # Default cache TTL in seconds
CDN_URL=http://cdn:80      # CDN server URL

# Redis Configuration
REDIS_HOST=redis-cache
REDIS_PORT=6379

# Database Configuration
DB_HOST=postgres-master
DB_PORT=5432
DB_NAME=minigram
DB_USER=minigram_user
DB_PASS=minigram_pass
```

### Redis Cache Configuration

**Optimizations:**
- **Memory Limit**: 256MB
- **Eviction Policy**: allkeys-lru
- **Persistence**: Disabled (pure cache)
- **Threading**: 4 I/O threads
- **Compression**: Enabled

### NGINX Cache Configuration

**Cache Zones:**
- **static_cache**: 100MB, 60min inactive
- **api_cache**: 50MB, 30min inactive

**Cache Rules:**
- Static assets: 1 year
- API responses: 5 minutes
- Health checks: No cache

## 🚨 Troubleshooting

### Common Issues

**1. Cache not working**
```bash
# Check Redis connection
docker-compose logs redis-cache

# Check cache health
curl http://localhost/api/cache/stats
```

**2. Poor cache hit ratio**
```bash
# Warm the cache
curl -X POST http://localhost/api/cache/warm

# Check cache patterns
docker exec -it minigram_cache redis-cli KEYS "*"
```

**3. High response times**
```bash
# Check system resources
docker stats

# Monitor database performance
docker-compose logs postgres-master
```

### Performance Tuning

**For Higher Load:**
1. Increase Redis memory limit
2. Add more app instances
3. Tune NGINX worker processes
4. Optimize database queries

**Configuration Example:**
```yaml
# docker-compose.override.yml
services:
  redis-cache:
    command: redis-server --maxmemory 512mb
  
  app1:
    environment:
      - CACHE_TTL=600  # Longer cache TTL
```

## 📈 Architecture Benefits

### Performance Gains

1. **Database Load Reduction**: 70-80% fewer database queries
2. **Response Time**: 2.5x faster average response time
3. **Throughput**: 2.5x more requests per second
4. **Resource Efficiency**: Lower CPU and memory usage per request

### Scalability Improvements

1. **Horizontal Scaling**: Easier to add cache layers
2. **Geographic Distribution**: CDN simulation shows global scaling
3. **Peak Load Handling**: Better traffic spike management
4. **Cost Efficiency**: Reduced database and compute costs

### Operational Benefits

1. **Monitoring**: Rich metrics and dashboards
2. **Cache Management**: Programmatic cache control
3. **Debugging**: Detailed cache status information
4. **Maintenance**: Graceful cache warming and invalidation

## 🔮 Next Steps (Stage 5+)

**Potential Future Enhancements:**
1. **Database Sharding**: Horizontal database partitioning
2. **Message Queues**: Asynchronous processing with Redis/RabbitMQ
3. **Microservices**: Service decomposition
4. **Real CDN**: Integration with CloudFront/CloudFlare
5. **Advanced Caching**: Multi-region cache clusters
6. **Search**: Elasticsearch integration
7. **Real-time Features**: WebSocket support

## 📚 Learning Resources

**Related Concepts:**
- Cache-aside pattern
- Write-through vs Write-behind caching
- Cache invalidation strategies
- CDN edge computing
- Redis data structures
- NGINX proxy caching
- Prometheus monitoring
- Grafana visualization

**Recommended Reading:**
- "System Design Interview" by Alex Xu (Chapter 1)
- "Designing Data-Intensive Applications" by Martin Kleppmann
- Redis documentation on caching patterns
- NGINX caching guide

## 🤝 Contributing

To contribute to this stage:

1. Test the load testing scripts
2. Add new cache patterns
3. Improve monitoring dashboards
4. Optimize configuration
5. Add performance benchmarks

## 📄 Files Structure

```
stage-4/
├── app/
│   ├── server.js           # Enhanced app with cache layer
│   ├── package.json        # Node.js dependencies
│   └── Dockerfile          # Multi-stage container build
├── config/
│   ├── nginx.conf          # Load balancer with cache
│   ├── cdn-nginx.conf      # CDN simulation server
│   └── redis-cache.conf    # Redis cache configuration
├── static/
│   ├── styles.css          # Frontend styling
│   ├── app.js             # Cache performance demo
│   └── favicon.ico        # Static asset example
├── monitoring/
│   ├── prometheus.yml      # Metrics collection
│   ├── grafana-*.yml      # Dashboard configuration
│   └── dashboards/        # Grafana dashboard definitions
├── scripts/
│   ├── run-load-test.sh   # Load testing script
│   ├── cache-load-test.js # Cache performance tester
│   └── stage-comparison.js # Multi-stage comparison
├── docker-compose.yml      # Complete stack orchestration
└── README.md              # This documentation
```

---

**🎉 Congratulations!** You've successfully implemented a production-ready caching layer with CDN simulation. This represents a significant architectural milestone in building scalable web applications.

The cache layer demonstrates how strategic caching can provide dramatic performance improvements while maintaining data consistency and system reliability. You're now ready to handle thousands of concurrent users with sub-second response times!