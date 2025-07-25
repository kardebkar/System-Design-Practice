// working-load-test.js - A load test that actually works
const axios = require('axios');

// Configure axios with proper timeouts and connection limits
const axiosConfig = {
  timeout: 5000,
  maxRedirects: 0,
  validateStatus: function (status) {
    return status < 500; // Don't throw on 4xx errors
  }
};

const API_URL = 'http://localhost:3000';
let testUserToken = null;

// Create axios instance with connection pooling
const api = axios.create({
  ...axiosConfig,
  baseURL: API_URL,
  httpAgent: new require('http').Agent({ 
    keepAlive: true,
    maxSockets: 10 // Limit concurrent connections
  })
});

async function setupTestUser() {
  try {
    const response = await api.post('/api/login', {
      username: 'testuser',
      password: 'test123'
    });
    testUserToken = response.data.token;
    console.log('✅ Test user logged in');
  } catch (error) {
    console.error('❌ Failed to login test user. Make sure you ran: npm run seed');
    process.exit(1);
  }
}

async function registerUser(userId) {
  const username = `user_${userId}_${Date.now()}`;
  try {
    const response = await api.post('/api/register', {
      username,
      email: `${username}@test.com`,
      password: 'password123'
    });
    return { success: true, token: response.data.token, username };
  } catch (error) {
    return { success: false, error: error.response?.status || error.code };
  }
}

async function testUserFlow(userId) {
  const startTime = Date.now();
  const results = {
    register: false,
    login: false,
    getFeed: false,
    duration: 0,
    error: null
  };

  // 1. Register
  const regResult = await registerUser(userId);
  if (!regResult.success) {
    results.error = `Registration failed: ${regResult.error}`;
    results.duration = Date.now() - startTime;
    return results;
  }
  results.register = true;
  const token = regResult.token;

  // 2. Get Feed
  try {
    await api.get('/api/feed', {
      headers: { Authorization: `Bearer ${token}` }
    });
    results.getFeed = true;
  } catch (error) {
    results.error = `Feed failed: ${error.response?.status || error.code}`;
  }

  results.duration = Date.now() - startTime;
  return results;
}

async function runScenario(name, totalUsers, batchSize = 5) {
  console.log(`\n🔄 ${name}: ${totalUsers} users (batches of ${batchSize})...`);
  
  const startTime = Date.now();
  const results = [];
  
  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < totalUsers; i += batchSize) {
    const batchPromises = [];
    const currentBatchSize = Math.min(batchSize, totalUsers - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      batchPromises.push(testUserFlow(i + j));
    }
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < totalUsers) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Calculate stats
  const successful = results.filter(r => r.register && r.getFeed).length;
  const failed = results.filter(r => !r.register || !r.getFeed).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const totalDuration = Date.now() - startTime;
  
  // Get server metrics
  let serverMetrics = null;
  try {
    const metricsResponse = await api.get('/api/metrics');
    serverMetrics = metricsResponse.data;
  } catch (error) {
    console.error('Failed to get metrics');
  }
  
  console.log(`
📊 Results:
├─ Total Time: ${totalDuration}ms
├─ Success: ${successful}/${totalUsers} (${((successful/totalUsers)*100).toFixed(1)}%)
├─ Failed: ${failed}
├─ Avg Response Time: ${avgDuration.toFixed(0)}ms
├─ Throughput: ${(totalUsers / (totalDuration / 1000)).toFixed(1)} users/sec
${serverMetrics ? `├─ Server Errors: ${serverMetrics.errorRate}
├─ Active Connections: ${serverMetrics.activeConnections}
├─ Memory: ${(serverMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB
└─ DB Queries/sec: ${serverMetrics.dbQueriesPerSecond}` : ''}
  `);
  
  // Show some error samples
  const errors = results.filter(r => r.error).slice(0, 3);
  if (errors.length > 0) {
    console.log('❌ Sample errors:');
    errors.forEach(e => console.log(`   - ${e.error}`));
  }
  
  return {
    name,
    totalUsers,
    successful,
    failed,
    avgDuration,
    totalDuration,
    throughput: (totalUsers / (totalDuration / 1000))
  };
}

async function runLoadTest() {
  console.log(`
╔════════════════════════════════════════════╗
║      Working Stage 1 Load Test             ║
╠════════════════════════════════════════════╣
║  Testing with proper connection management ║
╚════════════════════════════════════════════╝
  `);
  
  // Setup
  await setupTestUser();
  
  // Wait for server to be ready
  console.log('\n⏳ Warming up server...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run scenarios with appropriate batch sizes
  const scenarios = [];
  
  scenarios.push(await runScenario('Light Load', 10, 5));
  await new Promise(resolve => setTimeout(resolve, 3000)); // Cool down
  
  scenarios.push(await runScenario('Medium Load', 30, 10));
  await new Promise(resolve => setTimeout(resolve, 3000)); // Cool down
  
  scenarios.push(await runScenario('Heavy Load', 50, 10));
  await new Promise(resolve => setTimeout(resolve, 3000)); // Cool down
  
  scenarios.push(await runScenario('Stress Test', 100, 20));
  
  // Summary
  console.log(`
╔════════════════════════════════════════════╗
║            Test Summary                    ║
╚════════════════════════════════════════════╝
  `);
  
  console.log('📈 Performance Degradation:');
  scenarios.forEach(s => {
    console.log(`${s.name}: ${s.successful}/${s.totalUsers} succeeded (${s.avgDuration.toFixed(0)}ms avg)`);
  });
  
  console.log(`
🔍 Key Observations:
1. SQLite write locks start causing failures around ${scenarios.find(s => s.failed > 0)?.totalUsers || 'N/A'} concurrent users
2. Response times increase ${((scenarios[scenarios.length-1].avgDuration / scenarios[0].avgDuration).toFixed(1))}x under load
3. Single process handles ~${scenarios[0].throughput.toFixed(1)} users/second efficiently
4. No connection pooling = connection overhead
5. No caching = database hit for every request

💡 This demonstrates why production systems need:
- Separate database server (Stage 2)
- Connection pooling
- Caching layer (Stage 5)
- Load balancing (Stage 3)
- Async processing (Stage 8)
  `);
}

// Error handlers
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

// Run the test
runLoadTest()
  .then(() => {
    console.log('\n✅ Load test completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Load test failed:', err);
    process.exit(1);
  });