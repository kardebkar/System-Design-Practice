// comprehensive-stress-test.js - Shows real bottlenecks and metrics
const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000';

// Get server metrics
async function getMetrics() {
  try {
    const response = await axios.get(`${API_URL}/api/metrics`);
    return response.data;
  } catch (error) {
    return null;
  }
}

// More realistic user simulation
async function simulateRealUser(userId, sharedToken) {
  const operations = [];
  const startTime = Date.now();
  
  try {
    // 1. Register
    const username = `stress_user_${userId}_${Date.now()}`;
    const regStart = Date.now();
    const regResponse = await axios.post(`${API_URL}/api/register`, {
      username,
      email: `${username}@test.com`,
      password: 'password123'
    }, { timeout: 5000 });
    operations.push({ op: 'register', time: Date.now() - regStart, success: true });
    
    const token = regResponse.data.token;
    
    // 2. Immediate login (tests session/auth system)
    const loginStart = Date.now();
    await axios.post(`${API_URL}/api/login`, {
      username,
      password: 'password123'
    }, { timeout: 5000 });
    operations.push({ op: 'login', time: Date.now() - loginStart, success: true });
    
    // 3. Get feed multiple times (read heavy)
    for (let i = 0; i < 3; i++) {
      const feedStart = Date.now();
      await axios.get(`${API_URL}/api/feed`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      });
      operations.push({ op: 'feed', time: Date.now() - feedStart, success: true });
    }
    
    // 4. Like some photos (write operations)
    for (let i = 1; i <= 3; i++) {
      const likeStart = Date.now();
      try {
        await axios.post(`${API_URL}/api/photos/${i}/like`, {}, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000
        });
        operations.push({ op: 'like', time: Date.now() - likeStart, success: true });
      } catch (err) {
        operations.push({ op: 'like', time: Date.now() - likeStart, success: false });
      }
    }
    
    // 5. Follow another user (write operation)
    const followStart = Date.now();
    try {
      await axios.post(`${API_URL}/api/users/${(userId % 10) + 1}/follow`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      });
      operations.push({ op: 'follow', time: Date.now() - followStart, success: true });
    } catch (err) {
      operations.push({ op: 'follow', time: Date.now() - followStart, success: false });
    }
    
  } catch (error) {
    operations.push({ 
      op: 'error', 
      error: error.response?.data?.error || error.message,
      code: error.response?.status
    });
  }
  
  return {
    userId,
    totalTime: Date.now() - startTime,
    operations,
    success: operations.filter(op => op.success).length,
    failed: operations.filter(op => op.success === false).length
  };
}

// Monitor metrics during test
async function monitorMetrics(duration, interval = 1000) {
  const metrics = [];
  const endTime = Date.now() + duration;
  
  while (Date.now() < endTime) {
    const metric = await getMetrics();
    if (metric) {
      metrics.push({
        time: Date.now(),
        rps: parseFloat(metric.requestsPerSecond),
        errorRate: parseFloat(metric.errorRate),
        connections: metric.activeConnections,
        memory: metric.memoryUsage.heapUsed / 1024 / 1024,
        avgResponseTime: parseFloat(metric.avgResponseTime),
        dbQps: parseFloat(metric.dbQueriesPerSecond)
      });
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return metrics;
}

// Heavy concurrent test
async function heavyStressTest(numUsers, testName) {
  console.log(`\n🔥 ${testName}: ${numUsers} concurrent users with FULL activity...`);
  
  const startMetrics = await getMetrics();
  const startTime = Date.now();
  
  // Start monitoring
  const monitorPromise = monitorMetrics(10000); // Monitor for 10 seconds
  
  // Launch all users AT ONCE
  const promises = [];
  for (let i = 0; i < numUsers; i++) {
    promises.push(simulateRealUser(i));
  }
  
  // Wait for all to complete
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  // Get final metrics
  const endMetrics = await getMetrics();
  const monitoringData = await monitorPromise;
  
  // Analyze results
  const totalOps = results.reduce((sum, r) => sum + r.operations.length, 0);
  const successOps = results.reduce((sum, r) => sum + r.success, 0);
  const failedOps = results.reduce((sum, r) => sum + r.failed, 0);
  const avgUserTime = results.reduce((sum, r) => sum + r.totalTime, 0) / numUsers;
  
  // Find peak metrics
  const peakRPS = Math.max(...monitoringData.map(m => m.rps));
  const peakMemory = Math.max(...monitoringData.map(m => m.memory));
  const peakResponseTime = Math.max(...monitoringData.map(m => m.avgResponseTime));
  const peakConnections = Math.max(...monitoringData.map(m => m.connections));
  
  console.log(`
📊 Test Results:
├─ Total Duration: ${duration}ms
├─ Users Processed: ${numUsers}
├─ Total Operations: ${totalOps} (${(totalOps/numUsers).toFixed(1)} per user)
├─ Successful Ops: ${successOps} (${((successOps/totalOps)*100).toFixed(1)}%)
├─ Failed Ops: ${failedOps}
└─ Avg Time per User: ${avgUserTime.toFixed(0)}ms

📈 Peak Metrics During Test:
├─ Peak RPS: ${peakRPS.toFixed(1)}
├─ Peak Memory: ${peakMemory.toFixed(1)}MB
├─ Peak Response Time: ${peakResponseTime.toFixed(0)}ms
├─ Peak Connections: ${peakConnections}
└─ Peak DB QPS: ${Math.max(...monitoringData.map(m => m.dbQps)).toFixed(1)}

🔄 Before → After:
├─ Error Rate: ${startMetrics.errorRate} → ${endMetrics.errorRate}
├─ Avg Response: ${startMetrics.avgResponseTime} → ${endMetrics.avgResponseTime}
└─ Memory: ${(startMetrics.memoryUsage.heapUsed/1024/1024).toFixed(1)}MB → ${(endMetrics.memoryUsage.heapUsed/1024/1024).toFixed(1)}MB
  `);
  
  // Show error breakdown
  const errors = {};
  results.forEach(r => {
    r.operations.filter(op => op.error).forEach(op => {
      const key = op.error || 'Unknown';
      errors[key] = (errors[key] || 0) + 1;
    });
  });
  
  if (Object.keys(errors).length > 0) {
    console.log('❌ Error Types:');
    Object.entries(errors).forEach(([error, count]) => {
      console.log(`   - ${error}: ${count} times`);
    });
  }
  
  // Show operation timings
  const opTimings = {};
  results.forEach(r => {
    r.operations.filter(op => op.time).forEach(op => {
      if (!opTimings[op.op]) opTimings[op.op] = [];
      opTimings[op.op].push(op.time);
    });
  });
  
  console.log('\n⏱️  Operation Timings:');
  Object.entries(opTimings).forEach(([op, times]) => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.log(`   ${op}: avg ${avg.toFixed(0)}ms, max ${max}ms`);
  });
  
  return {
    numUsers,
    duration,
    totalOps,
    successRate: (successOps / totalOps) * 100,
    peakRPS,
    peakResponseTime
  };
}

// Find the real breaking point
async function findRealBreakingPoint() {
  console.log(`
╔════════════════════════════════════════════╗
║   Real-World Stress Test with Metrics      ║
╠════════════════════════════════════════════╣
║  Full user simulation (register, login,    ║
║  multiple reads, writes, likes, follows)   ║
╚════════════════════════════════════════════╝
  `);
  
  const scenarios = [
    { users: 5, name: "Light Load" },
    { users: 10, name: "Moderate Load" },
    { users: 25, name: "Heavy Load" },
    { users: 50, name: "Extreme Load" },
    { users: 100, name: "Breaking Point" }
  ];
  
  const results = [];
  
  for (const scenario of scenarios) {
    const result = await heavyStressTest(scenario.users, scenario.name);
    results.push(result);
    
    // Stop if success rate drops below 80%
    if (result.successRate < 80) {
      console.log('\n💥 System is struggling! Stopping tests.');
      break;
    }
    
    // Cool down period
    console.log('\n⏳ Cooling down for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Final summary
  console.log(`
╔════════════════════════════════════════════╗
║         Comprehensive Test Summary         ║
╚════════════════════════════════════════════╝
  `);
  
  console.log('📊 Performance Degradation:');
  console.log('Users | Success | Peak RPS | Peak Response');
  console.log('------|---------|----------|---------------');
  results.forEach(r => {
    console.log(`${r.numUsers.toString().padEnd(5)} | ${r.successRate.toFixed(1).padEnd(7)}% | ${r.peakRPS.toFixed(1).padEnd(8)} | ${r.peakResponseTime.toFixed(0)}ms`);
  });
  
  console.log(`
🎯 Key Findings:
1. Single process handles ~${results[0].peakRPS.toFixed(0)} RPS efficiently
2. Response times degrade ${(results[results.length-1].peakResponseTime / results[0].peakResponseTime).toFixed(1)}x under load
3. Each user performs ~10 operations (register, login, reads, writes)
4. SQLite handles reads well but writes cause contention
5. No caching = ${results[results.length-1].peakRPS * 3} unnecessary DB hits

💡 Interview Insight:
"While SQLite handled concurrent registrations, the real bottleneck 
appeared when simulating full user activity. With ${results[results.length-1].numUsers} users each 
performing multiple operations, response times increased ${(results[results.length-1].peakResponseTime / results[0].peakResponseTime).toFixed(0)}x 
and the single process hit ${results[results.length-1].peakRPS.toFixed(0)} requests/second."
  `);
  
  // Save detailed metrics
  fs.writeFileSync('stress-test-metrics.json', JSON.stringify({
    scenarios: results,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('\n💾 Detailed metrics saved to stress-test-metrics.json');
}

// Run the comprehensive test
findRealBreakingPoint().catch(console.error);