// debug-stage1.js - Save this as a new file
const axios = require('axios');

const API_URL = 'http://localhost:3000';

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function debugTest() {
  console.log(`${colors.blue}🔍 Starting Stage 1 Debug Test...${colors.reset}\n`);
  
  // Test 1: Server health check
  console.log('1️⃣  Checking server health...');
  try {
    const health = await axios.get(`${API_URL}/health`);
    console.log(`${colors.green}✅ Server is running${colors.reset}`, health.data);
  } catch (error) {
    console.error(`${colors.red}❌ Server is not responding!${colors.reset}`);
    console.error('Make sure the server is running with: npm run dev');
    return;
  }
  
  // Test 2: Check metrics endpoint
  console.log('\n2️⃣  Checking metrics endpoint...');
  try {
    const metrics = await axios.get(`${API_URL}/api/metrics`);
    console.log(`${colors.green}✅ Metrics working${colors.reset}`);
    console.log('Current errors:', metrics.data.totalErrors);
    console.log('Error rate:', metrics.data.errorRate);
  } catch (error) {
    console.error(`${colors.red}❌ Metrics endpoint failed${colors.reset}`);
  }
  
  // Test 3: Try login with seeded user
  console.log('\n3️⃣  Testing login with seeded user...');
  try {
    const loginResponse = await axios.post(`${API_URL}/api/login`, {
      username: 'testuser',
      password: 'test123'
    });
    console.log(`${colors.green}✅ Login successful${colors.reset}`);
    const token = loginResponse.data.token;
    
    // Test 4: Get feed with token
    console.log('\n4️⃣  Testing feed endpoint...');
    try {
      const feedResponse = await axios.get(`${API_URL}/api/feed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`${colors.green}✅ Feed retrieved successfully${colors.reset}`);
      console.log(`Photos in feed: ${feedResponse.data.length}`);
    } catch (feedError) {
      console.error(`${colors.red}❌ Feed failed:${colors.reset}`, feedError.response?.data);
    }
    
  } catch (loginError) {
    console.error(`${colors.red}❌ Login failed:${colors.reset}`);
    if (loginError.response) {
      console.error('Status:', loginError.response.status);
      console.error('Error:', loginError.response.data);
    } else {
      console.error(loginError.message);
    }
    
    // Try to create a new user
    console.log('\n4️⃣  Attempting to register new user...');
    try {
      const newUser = {
        username: `test_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'password123'
      };
      
      const registerResponse = await axios.post(`${API_URL}/api/register`, newUser);
      console.log(`${colors.green}✅ Registration successful${colors.reset}`);
      console.log('New user ID:', registerResponse.data.userId);
    } catch (registerError) {
      console.error(`${colors.red}❌ Registration failed:${colors.reset}`);
      if (registerError.response) {
        console.error('Status:', registerError.response.status);
        console.error('Error:', registerError.response.data);
      }
    }
  }
  
  // Test 5: Simple concurrent test
  console.log('\n5️⃣  Testing concurrent requests...');
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      axios.get(`${API_URL}/health`)
        .then(() => true)
        .catch(() => false)
    );
  }
  
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r).length;
  console.log(`Concurrent requests: ${successCount}/5 successful`);
  
  // Final diagnosis
  console.log(`\n${colors.yellow}📋 Diagnosis:${colors.reset}`);
  if (successCount === 5) {
    console.log('- Server can handle basic concurrent requests');
  } else {
    console.log('- Server struggling with concurrent requests');
  }
  
  try {
    const finalMetrics = await axios.get(`${API_URL}/api/metrics`);
    console.log(`- Total requests processed: ${finalMetrics.data.totalRequests}`);
    console.log(`- Current error rate: ${finalMetrics.data.errorRate}`);
    console.log(`- Memory usage: ${(finalMetrics.data.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  } catch (e) {
    // Ignore
  }
}

// Run the debug test
debugTest().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err.message);
});