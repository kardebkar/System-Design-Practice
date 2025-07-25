const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const API_URL = 'http://localhost:3000';
let successCount = 0;
let errorCount = 0;
const responseTimes = [];

// Test user credentials
const testUser = {
  username: 'testuser',
  password: 'test123'
};

async function getAuthToken() {
  try {
    const response = await axios.post(`${API_URL}/api/login`, testUser);
    return response.data.token;
  } catch (error) {
    console.error('❌ Failed to login test user. Run "npm run seed" first!');
    process.exit(1);
  }
}

async function simulateUser(userId, token) {
  const start = Date.now();
  
  try {
    // 1. Register new user
    const username = `user_${userId}_${Date.now()}`;
    const registerResponse = await axios.post(`${API_URL}/api/register`, {
      username,
      email: `${username}@test.com`,
      password: 'password123'
    });
    
    const userToken = registerResponse.data.token;
    
    // 2. Get feed
    await axios.get(`${API_URL}/api/feed`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    
    // 3. Like a photo (if any exist)
    await axios.post(`${API_URL}/api/photos/1/like`, {}, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    
    successCount++;
    const duration = Date.now() - start;
    responseTimes.push(duration);
    
  } catch (error) {
    errorCount++;
    if (error.response?.status !== 404) {
      console.error(`❌ User ${userId} failed:`, error.message);
    }
  }
}

async function runLoadTest() {
  console.log(`
╔════════════════════════════════════════════╗
║        Stage 1 Load Test Starting          ║
╠════════════════════════════════════════════╣
║  Testing single server limitations...      ║
╚════════════════════════════════════════════╝
  `);
  
  const token = await getAuthToken();
  
  // Test scenarios
  const scenarios = [
    { users: 10, concurrent: true, name: "Light Load" },
    { users: 50, concurrent: true, name: "Medium Load" },
    { users: 100, concurrent: true, name: "Heavy Load" },
    { users: 200, concurrent: true, name: "Extreme Load" }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n🔄 Running ${scenario.name}: ${scenario.users} users...`);
    
    successCount = 0;
    errorCount = 0;
    responseTimes.length = 0;
    
    const startTime = Date.now();
    
    if (scenario.concurrent) {
      // Concurrent users
      const promises = [];
      for (let i = 0; i < scenario.users; i++) {
        promises.push(simulateUser(i, token));
      }
      await Promise.all(promises);
    } else {
      // Sequential users
      for (let i = 0; i < scenario.users; i++) {
        await simulateUser(i, token);
      }
    }
    
    const totalTime = Date.now() - startTime;
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b) / responseTimes.length
      : 0;
    
    console.log(`
📊 ${scenario.name} Results:
├─ Total Time: ${totalTime}ms
├─ Success: ${successCount}/${scenario.users} (${((successCount/scenario.users)*100).toFixed(1)}%)
├─ Errors: ${errorCount}
├─ Avg Response Time: ${avgResponseTime.toFixed(0)}ms
└─ Requests/sec: ${(scenario.users / (totalTime / 1000)).toFixed(1)}
    `);
    
    // Get server metrics
    try {
      const metricsResponse = await axios.get(`${API_URL}/api/metrics`);
      const metrics = metricsResponse.data;
      console.log(`
🖥️  Server Metrics:
├─ Active Connections: ${metrics.activeConnections}
├─ Error Rate: ${metrics.errorRate}
├─ DB Queries/sec: ${metrics.dbQueriesPerSecond}
└─ Memory: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB
      `);
    } catch (error) {
      console.error('Failed to fetch metrics');
    }
    
    // Wait between scenarios
    if (scenario !== scenarios[scenarios.length - 1]) {
      console.log('\n⏳ Waiting 5 seconds before next scenario...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`
╔════════════════════════════════════════════╗
║           Load Test Complete!              ║
╠════════════════════════════════════════════╣
║  💡 Observations:                          ║
║  - Performance degrades with load          ║
║  - SQLite write locks cause errors        ║
║  - Single process = CPU bottleneck        ║
║  - No caching = every request hits DB     ║
╚════════════════════════════════════════════╝
  `);
}

// Run the test
runLoadTest().catch(console.error);