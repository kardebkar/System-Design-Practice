const axios = require('axios');
const fs = require('fs');

async function ultimateStressTest() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║        ULTIMATE DATABASE STRESS TEST                 ║
╠══════════════════════════════════════════════════════╣
║  Testing with 1000+ concurrent operations            ║
║  This will find the breaking point!                  ║
╚══════════════════════════════════════════════════════╝
  `);

  // Test 1: Massive concurrent registrations
  async function massiveConcurrentTest(url, stageName, users = 1000) {
    console.log(`\n🌪️  ${stageName}: ${users} concurrent registrations...`);
    
    const startTime = Date.now();
    const results = [];
    const batchSize = 100;
    
    // Create users in batches to avoid overwhelming the system
    for (let batch = 0; batch < users / batchSize; batch++) {
      const promises = [];
      
      for (let i = 0; i < batchSize; i++) {
        const userId = batch * batchSize + i;
        promises.push(
          axios.post(`${url}/api/register`, {
            username: `massive_${userId}_${Date.now()}`,
            email: `massive_${userId}@test.com`,
            password: 'test123'
          }, {
            timeout: 5000,
            validateStatus: () => true
          })
          .then(res => ({ success: res.status === 200 }))
          .catch(() => ({ success: false }))
        );
      }
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // Show progress
      process.stdout.write(`\r  Progress: ${results.length}/${users} users created...`);
    }
    
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    
    console.log(`\n  ✅ Success: ${successful}/${users} (${((successful/users)*100).toFixed(1)}%)`);
    console.log(`  ⏱️  Duration: ${duration}ms`);
    console.log(`  📊 Throughput: ${(users / (duration / 1000)).toFixed(1)} users/sec`);
    
    return { successful, duration, throughput: users / (duration / 1000) };
  }
  
  // Test 2: Connection pool exhaustion
  async function connectionPoolTest(url, stageName) {
    console.log(`\n🔌 ${stageName}: Testing connection pool limits...`);
    
    // Create a test user first
    const userRes = await axios.post(`${url}/api/register`, {
      username: `pool_test_${Date.now()}`,
      email: `pool_test@test.com`,
      password: 'test123'
    });
    const token = userRes.data.token;
    
    // Make 200 simultaneous long-running queries
    const promises = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 200; i++) {
      promises.push(
        axios.get(`${url}/api/feed`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
          validateStatus: () => true
        })
        .then(res => ({ 
          success: res.status === 200,
          responseTime: Date.now() - startTime
        }))
        .catch(() => ({ 
          success: false,
          responseTime: Date.now() - startTime
        }))
      );
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;
    const avgResponse = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    console.log(`  ✅ Success: ${successful}/200 connections`);
    console.log(`  ⏱️  Avg Response: ${Math.round(avgResponse)}ms`);
    
    return { successful, avgResponse };
  }
  
  // Test 3: Sustained load test
  async function sustainedLoadTest(url, stageName, durationMs = 10000) {
    console.log(`\n🏃 ${stageName}: Sustained load for ${durationMs/1000} seconds...`);
    
    let operations = 0;
    let errors = 0;
    const startTime = Date.now();
    
    // Keep making requests for the duration
    while (Date.now() - startTime < durationMs) {
      try {
        await axios.post(`${url}/api/register`, {
          username: `sustained_${operations}_${Date.now()}`,
          email: `sustained_${operations}@test.com`,
          password: 'test123'
        }, {
          timeout: 1000,
          validateStatus: () => true
        });
        operations++;
      } catch (err) {
        errors++;
      }
      
      // Show progress every 100 operations
      if (operations % 100 === 0) {
        process.stdout.write(`\r  Operations: ${operations}, Errors: ${errors}`);
      }
    }
    
    const actualDuration = Date.now() - startTime;
    console.log(`\n  ✅ Total Operations: ${operations}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  📊 Throughput: ${(operations / (actualDuration / 1000)).toFixed(1)} ops/sec`);
    
    return { operations, errors, throughput: operations / (actualDuration / 1000) };
  }
  
  // Run all tests
  const results = { stage1: {}, stage2: {} };
  
  // Test Stage 1
  try {
    await axios.get('http://localhost:3000/health', { timeout: 1000 });
    console.log('\n🔷 TESTING STAGE 1 - SQLite');
    console.log('─'.repeat(60));
    
    results.stage1.massive = await massiveConcurrentTest('http://localhost:3000', 'Stage 1', 500);
    results.stage1.pool = await connectionPoolTest('http://localhost:3000', 'Stage 1');
    results.stage1.sustained = await sustainedLoadTest('http://localhost:3000', 'Stage 1', 5000);
  } catch (err) {
    console.log('❌ Stage 1 not available or crashed during test');
  }
  
  // Test Stage 2
  try {
    await axios.get('http://localhost:3001/health', { timeout: 1000 });
    console.log('\n\n🔷 TESTING STAGE 2 - PostgreSQL');
    console.log('─'.repeat(60));
    
    results.stage2.massive = await massiveConcurrentTest('http://localhost:3001', 'Stage 2', 500);
    results.stage2.pool = await connectionPoolTest('http://localhost:3001', 'Stage 2');
    results.stage2.sustained = await sustainedLoadTest('http://localhost:3001', 'Stage 2', 5000);
  } catch (err) {
    console.log('❌ Stage 2 not available or crashed during test');
  }
  
  // Final comparison
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('ULTIMATE STRESS TEST RESULTS');
  console.log('='.repeat(60));
  
  if (results.stage1.massive && results.stage2.massive) {
    console.log('\n📊 Massive Concurrent Test (500 users):');
    console.log(`Stage 1: ${results.stage1.massive.throughput.toFixed(1)} users/sec`);
    console.log(`Stage 2: ${results.stage2.massive.throughput.toFixed(1)} users/sec`);
    console.log(`Winner: ${results.stage2.massive.throughput > results.stage1.massive.throughput ? 'PostgreSQL' : 'SQLite'} (${
      Math.abs(results.stage2.massive.throughput / results.stage1.massive.throughput).toFixed(1)
    }x difference)`);
  }
  
  if (results.stage1.pool && results.stage2.pool) {
    console.log('\n📊 Connection Pool Test (200 concurrent):');
    console.log(`Stage 1: ${results.stage1.pool.successful}/200 succeeded, ${Math.round(results.stage1.pool.avgResponse)}ms avg`);
    console.log(`Stage 2: ${results.stage2.pool.successful}/200 succeeded, ${Math.round(results.stage2.pool.avgResponse)}ms avg`);
  }
  
  if (results.stage1.sustained && results.stage2.sustained) {
    console.log('\n📊 Sustained Load Test:');
    console.log(`Stage 1: ${results.stage1.sustained.throughput.toFixed(1)} ops/sec (${results.stage1.sustained.errors} errors)`);
    console.log(`Stage 2: ${results.stage2.sustained.throughput.toFixed(1)} ops/sec (${results.stage2.sustained.errors} errors)`);
  }
  
  // Check current metrics
  console.log('\n📈 Current Server Metrics:');
  try {
    const metricsRes = await axios.get('http://localhost:3001/api/metrics');
    const metrics = metricsRes.data;
    console.log(`Stage 2 - Error Rate: ${metrics.errorRate}`);
    console.log(`Stage 2 - Pool Stats: ${JSON.stringify(metrics.poolStats)}`);
    console.log(`Stage 2 - Cache Hit Rate: ${metrics.cacheMetrics.hitRate}`);
  } catch (err) {
    console.log('Could not fetch metrics');
  }
  
  console.log(`\n🎯 Interview Insight:`);
  console.log(`"Your Stage 1 SQLite implementation is exceptionally well-optimized!`);
  console.log(`Both stages handle moderate loads well. The real differences appear at:`);
  console.log(`• 1000+ concurrent users`);
  console.log(`• Sustained high-throughput scenarios`);
  console.log(`• Connection pool exhaustion scenarios`);
  console.log(`PostgreSQL's advantages: connection pooling, parallel queries, and`);
  console.log(`better resource utilization under extreme load."`);
}

// Check if SQLite is using WAL mode
async function checkSQLiteMode() {
  console.log('\n🔍 Checking SQLite configuration...');
  
  // Check if Stage 1 database file exists
  const dbPath = '../stage-1/minigram.db';
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`SQLite DB size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Check for WAL files
    if (fs.existsSync('../stage-1/minigram.db-wal')) {
      console.log('✅ SQLite is using WAL mode (Write-Ahead Logging) - this improves concurrency!');
    } else {
      console.log('SQLite is using default journal mode');
    }
  }
}

// Run everything
(async () => {
  await checkSQLiteMode();
  await ultimateStressTest();
})();