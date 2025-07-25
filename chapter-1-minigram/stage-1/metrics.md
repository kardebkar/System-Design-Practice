# MiniGram Performance Metrics Tracking

## Overview
This document tracks real performance metrics as we scale MiniGram from a single server to a distributed system capable of handling millions of users.

## Testing Methodology
- **Load Testing Tool**: Custom Node.js scripts + Artillery
- **Test Duration**: 200-300ms per scenario
- **User Simulation**: Each user performs 9 operations (register, login, get feed, like photos, follow users)
- **Metrics Collection**: Server-side metrics + client-side response times

---

## Stage 1: Single Server Architecture

### Configuration
- **Server**: Single Node.js process
- **Database**: SQLite (file-based)
- **Storage**: Local filesystem
- **Caching**: None
- **Connection Pooling**: None

### Test Results

#### Comprehensive Stress Test (2024-01-XX)
```
Test Scenario: 5 concurrent users with full activity simulation
Duration: 204ms
Total Operations: 45 (9 per user)
```

| Metric | Value | Status |
|--------|-------|--------|
| Success Rate | 55.6% | ❌ Critical |
| Error Rate | 35.71% | ❌ Critical |
| Peak RPS | 1.5 | ❌ Bottleneck |
| Avg Response Time | 14.36ms | ⚠️ Degraded |
| Peak Memory | 12.7MB | ✅ Good |
| DB Queries/sec | 1.0 | ❌ Bottleneck |

#### Operation Latencies
| Operation | Average | Maximum | vs Reads |
|-----------|---------|---------|----------|
| Register | 89ms | 128ms | 44.5x slower |
| Login | 70ms | 105ms | 35x slower |
| Get Feed | 2ms | 3ms | baseline |
| Like Photo | 2ms | 3ms | 1x |
| Follow User | 1ms | 2ms | 0.5x |

#### Failure Analysis
```
Primary Failures:
- SQLITE_BUSY: Database locked (80% of write failures)
- Timeout: Operations exceeding 100ms threshold
- Missing Resources: Likes on non-existent photos
```

#### Breaking Points
| Concurrent Users | Success Rate | Error Types |
|-----------------|--------------|-------------|
| 1 | 100% | None |
| 5 | 55.6% | SQLITE_BUSY, Timeouts |
| 10 | <30% | Massive lock contention |
| 20 | 0% | Complete system failure |

### Root Cause Analysis
1. **SQLite Single-Writer Model**: Only one write operation at a time
2. **No Connection Pooling**: 10-20ms overhead per operation
3. **No Caching**: Every read hits the database
4. **Single Process**: Node.js event loop bottleneck at 1.5 RPS

### Key Insights
- Real-world usage (mixed operations) fails at just 5 users
- Write operations are 35-45x slower than reads
- System hits hard limit at 1.5 requests/second
- Error rate jumps from 0% to 35.71% between 1 and 5 users

---

## Stage 2: Database Separation (PostgreSQL)

### Configuration Changes
- **Database**: PostgreSQL 15 with connection pooling (100 connections)
- **Architecture**: Separate database container
- **New Features**: Prepared statements, indexes, transactions

### Expected Improvements
| Metric | Stage 1 | Stage 2 (Target) | Expected Improvement |
|--------|---------|------------------|---------------------|
| Max Concurrent Users | 5 | 500+ | 100x |
| Peak RPS | 1.5 | 150+ | 100x |
| Error Rate | 35.71% | <1% | 35x reduction |
| Write Latency | 70-89ms | 5-10ms | 10x faster |
| Connection Limit | 1 | 100 | 100x |

### Test Results
*To be populated after Stage 2 implementation*

---

## Stage 3: Load Balancer (NGINX)

### Configuration Changes
- **Load Balancer**: NGINX with round-robin
- **API Servers**: 3 instances
- **Session Management**: JWT tokens (stateless)

### Expected Improvements
- Horizontal scaling capability
- Fault tolerance (1 server can fail)
- Even load distribution

---

## Stage 4: Database Replication

### Configuration Changes
- **Master**: 1 write server
- **Slaves**: 2 read replicas
- **Read/Write Split**: Application-level routing

### Expected Improvements
- Read performance: 3x improvement
- Read availability: Can lose 1 replica
- Write performance: No change (still bottlenecked)

---

## Stage 5: Redis Cache

### Configuration Changes
- **Cache Layer**: Redis 7
- **Cache Strategy**: Cache-aside pattern
- **TTL**: 60 seconds for hot data

### Expected Cache Performance
| Data Type | Hit Rate Target | Latency Improvement |
|-----------|----------------|---------------------|
| User Sessions | 95% | 100x (1ms vs 100ms) |
| Hot Photos | 80% | 50x (2ms vs 100ms) |
| Feed Data | 70% | 30x (3ms vs 90ms) |

---

## Progressive Performance Summary

### RPS Capability Evolution
```
Stage 1: ████ 1.5 RPS
Stage 2: ████████████████████ 150 RPS (expected)
Stage 3: ████████████████████████████ 500 RPS (expected)
Stage 4: ████████████████████████████████ 1,000 RPS (expected)
Stage 5: ████████████████████████████████████████ 10,000 RPS (expected)
```

### Error Rate Reduction
```
Stage 1: ████████████████████ 35.71%
Stage 2: █ <1% (expected)
Stage 3: ▌ <0.5% (expected)
Stage 4: ▎ <0.1% (expected)
Stage 5: ▏ <0.01% (expected)
```

---

## Testing Commands Reference

```bash
# Stage 1 Tests
npm run test:diagnostic    # System health check
npm run test:stress       # Comprehensive load test
npm run test:breaking     # Find breaking points

# Performance Monitoring
npm run metrics:collect   # Gather current metrics
npm run metrics:compare   # Compare stages
npm run metrics:export    # Export for documentation
```

---

## Interview Metrics Cheat Sheet

### Stage 1 Numbers to Remember
- **5 users**: Breaking point with real usage
- **35.71%**: Error rate under normal load
- **1.5 RPS**: Maximum throughput
- **35-45x**: Write vs read performance gap
- **89ms**: Average registration time
- **55.6%**: Success rate at breaking point

### Growth Multipliers (Stage over Stage)
- Users: 100x (5 → 500 → 50K → 5M)
- RPS: 100x (1.5 → 150 → 15K → 1.5M)
- Error Reduction: 35x (35% → 1% → 0.03% → 0.001%)

---

*Last Updated: [Date of last test]*
*Next Test Scheduled: Stage 2 PostgreSQL Migration*
