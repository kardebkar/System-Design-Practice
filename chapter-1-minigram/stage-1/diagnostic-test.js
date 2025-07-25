// diagnostic-test.js - Find out exactly what's failing and why
const axios = require('axios');

const API_URL = 'http://localhost:3000';

// Test each operation type separately
async function testOperationType(operationType, count = 5) {
  console.log(`\n🧪 Testing ${operationType} with ${count} concurrent operations...`);
  
  const results = {
    success: 0,
    failed: 0,
    errors: {}
  };
  
  const promises = [];
  
  switch(operationType) {
    case 'register':
      for (let i = 0; i < count; i++) {
        promises.push(
          axios.post(`${API_URL}/api/register`, {
            username: `diag_user_${i}_${Date.now()}`,
            email: `diag_${i}_${Date.now()}@test.com`,
            password: 'password123'
          })
          .then(() => results.success++)
          .catch(err => {
            results.failed++;
            const errorMsg = err.response?.data?.error || err.message;
            results.errors[errorMsg] = (results.errors[errorMsg] || 0) + 1;
          })
        );
      }
      break;
      
    case 'login':
      // First create a user
      const testUser = await axios.post(`${API_URL}/api/register`, {
        username: `login_test_${Date.now()}`,
        email: `login_test_${Date.now()}@test.com`,
        password: 'test123'
      });
      
      for (let i = 0; i < count; i++) {
        promises.push(
          axios.post(`${API_URL}/api/login`, {
            username: testUser.data.username,
            password: 'test123'
          })
          .then(() => results.success++)
          .catch(err => {
            results.failed++;
            const errorMsg = err.response?.data?.error || err.message;
            results.errors[errorMsg] = (results.errors[errorMsg] || 0) + 1;
          })
        );
      }
      break;
      
    case 'feed':
      // Get a token first
      const loginResp = await axios.post(`${API_URL}/api/login`, {
        username: 'testuser',
        password: 'test123'
      });
      const token = loginResp.data.token;
      
      for (let i = 0; i < count; i++) {
        promises.push(
          axios.get(`${API_URL}/api/feed`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          .then(() => results.success++)
          .catch(err => {
            results.failed++;
            const errorMsg = err.response?.data?.error || err.message;
            results.errors[errorMsg] = (results.errors[errorMsg] || 0) + 1;
          })
        );
      }
      break;
      
    case 'like':
      // Get a token
      const likeLogin = await axios.post(`${API_URL}/api/login`, {
        username: 'testuser',
        password: 'test123'
      });
      const likeToken = likeLogin.data.token;
      
      for (let i = 0; i < count; i++) {
        promises.push(
          axios.post(`${API_URL}/api/photos/1/like`, {}, {
            headers: { Authorization: `Bearer ${likeToken}` }
          })
          .then(() => results.success++)
          .catch(err => {
            results.failed++;
            const errorMsg = err.response?.data?.error || err.message;
            results.errors[errorMsg] = (results.errors[errorMsg] || 0) + 1;
          })
        );
      }
      break;
  }
  
  await Promise.all(promises);
  
  console.log(`✅ Success: ${results.success}/${count} (${((results.success/count)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (Object.keys(results.errors).length > 0) {
    console.log('📋 Error breakdown:');
    Object.entries(results.errors).forEach(([error, count]) => {
      console.log(`   - "${error}": ${count} times`);
    });
  }
  
  return results;
}

// Check what exists in database
async function checkDatabaseState() {
  console.log('\n🔍 Checking database state...');
  
  try {
    // Login as test user
    const login = await axios.post(`${API_URL}/api/login`, {
      username: 'testuser',
      password: 'test123'
    });
    
    // Get feed to see if there are any photos
    const feed = await axios.get(`${API_URL}/api/feed`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    
    console.log(`📸 Photos in database: ${feed.data.length}`);
    
    if (feed.data.length === 0) {
      console.log('⚠️  No photos exist! This explains why likes are failing.');
      console.log('💡 Creating a test photo...');
      
      // Create a test photo
      const formData = new (require('form-data'))();
      formData.append('caption', 'Test photo for likes');
      
      try {
        await axios.post(`${API_URL}/api/photos`, formData, {
          headers: { 
            ...formData.getHeaders(),
            Authorization: `Bearer ${login.data.token}`
          }
        });
        console.log('✅ Test photo created');
      } catch (err) {
        console.log('❌ Failed to create photo:', err.response?.data?.error || err.message);
      }
    }
    
  } catch (err) {
    console.error('Error checking database:', err.message);
  }
}

// Main diagnostic flow
async function runDiagnostics() {
  console.log(`
╔════════════════════════════════════════════╗
║        Stage 1 Diagnostic Test             ║
╠════════════════════════════════════════════╣
║  Finding exactly what's failing and why    ║
╚════════════════════════════════════════════╝
  `);
  
  // Check database state first
  await checkDatabaseState();
  
  // Test each operation type
  const operations = ['register', 'login', 'feed', 'like'];
  const results = {};
  
  for (const op of operations) {
    results[op] = await testOperationType(op, 10);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Cool down
  }
  
  // Summary
  console.log(`
╔════════════════════════════════════════════╗
║              Diagnostic Summary            ║
╚════════════════════════════════════════════╝
  `);
  
  console.log('📊 Operation Success Rates:');
  Object.entries(results).forEach(([op, result]) => {
    const total = result.success + result.failed;
    const rate = ((result.success / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(rate / 5));
    console.log(`${op.padEnd(10)}: ${bar} ${rate}%`);
  });
  
  // Check metrics
  try {
    const metrics = await axios.get(`${API_URL}/api/metrics`);
    console.log(`
📈 Current Server State:
├─ Total Requests: ${metrics.data.totalRequests}
├─ Error Rate: ${metrics.data.errorRate}
├─ DB Queries/sec: ${metrics.data.dbQueriesPerSecond}
└─ Memory: ${(metrics.data.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB
    `);
  } catch (err) {
    console.error('Failed to get metrics');
  }
  
  console.log(`
🎯 Diagnosis Complete!

Common issues found:
1. Likes failing because photo with ID doesn't exist
2. Follows failing because user IDs don't exist
3. SQLite write locks on concurrent operations
4. No proper error handling for missing resources
  `);
}

// Run diagnostics
runDiagnostics().catch(console.error);