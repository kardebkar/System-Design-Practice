// concurrent-breaking-test.js - Shows real SQLite limitations
const axios = require('axios');

const API_URL = 'http://localhost:3000';

// No connection pooling, no limits - just raw concurrent requests
async function brutalConcurrentTest(numUsers) {
  console.log(`\n💥 TRUE CONCURRENT TEST: ${numUsers} simultaneous users...`);
  
  const startTime = Date.now();
  const promises = [];
  
  // Create ALL users at the SAME TIME - no batching!
  for (let i = 0; i < numUsers; i++) {
    const promise = axios.post(`${API_URL}/api/register`, {
      username: `concurrent_user_${i}_${Date.now()}`,
      email: `user_${i}_${Date.now()}@test.com`,
      password: 'password123'
    }, { 
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status
    })
    .then(res => ({
      success: res.status === 200,
      status: res.status,
      error: res.data.error
    }))
    .catch(err => ({
      success: false,
      error: err.message
    }));
    
    promises.push(promise);
  }
  
  // Wait for ALL to complete
  const results = await Promise.all(promises);
  
  const duration = Date.now() - startTime;
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`
📊 Results:
├─ Duration: ${duration}ms  
├─ Success: ${succeeded}/${numUsers} (${((succeeded/numUsers)*100).toFixed(1)}%)
├─ Failed: ${failed}
└─ Throughput: ${(numUsers / (duration / 1000)).toFixed(1)} requests/sec
  `);
  
  // Show error types
  const errorTypes = {};
  results.filter(r => !r.success).forEach(r => {
    const key = r.error || `Status ${r.status}`;
    errorTypes[key] = (errorTypes[key] || 0) + 1;
  });
  
  if (Object.keys(errorTypes).length > 0) {
    console.log('❌ Error breakdown:');
    Object.entries(errorTypes).forEach(([error, count]) => {
      console.log(`   - ${error}: ${count} times`);
    });
  }
  
  return { succeeded, failed, duration };
}

async function findBreakingPoint() {
  console.log(`
╔════════════════════════════════════════════╗
║   Finding SQLite Breaking Point Test       ║
╠════════════════════════════════════════════╣
║  TRUE concurrent requests (no batching!)   ║
╚════════════════════════════════════════════╝
  `);
  
  // Test with increasing concurrency
  const tests = [5, 10, 20, 30, 50, 75, 100];
  const results = [];
  
  for (const numUsers of tests) {
    const result = await brutalConcurrentTest(numUsers);
    results.push({ numUsers, ...result });
    
    // Stop if we hit significant failures
    if (result.failed > result.succeeded) {
      console.log(`\n🔥 Breaking point found at ${numUsers} concurrent users!`);
      break;
    }
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log(`
╔════════════════════════════════════════════╗
║           Breaking Point Analysis          ║
╚════════════════════════════════════════════╝
  `);
  
  console.log('📊 Concurrency vs Success Rate:');
  results.forEach(r => {
    const successRate = ((r.succeeded / r.numUsers) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(successRate / 5));
    console.log(`${r.numUsers.toString().padStart(3)} users: ${bar} ${successRate}%`);
  });
  
  const breakingPoint = results.find(r => r.failed > 0)?.numUsers || 'Not found';
  
  console.log(`
🎯 Key Findings:
- SQLite handles well up to: ${results[results.length - 1].succeeded} concurrent writes
- Breaking point: ${breakingPoint} concurrent users
- Failure mode: Database write locks

🔍 Interview Insight:
"SQLite uses a single-writer model. When ${breakingPoint} users try to 
register simultaneously, write locks cause failures. This is why 
production systems use PostgreSQL or MySQL with connection pooling."
  `);
}

async function compareSequentialVsConcurrent() {
  console.log(`
╔════════════════════════════════════════════╗
║    Sequential vs Concurrent Comparison     ║
╚════════════════════════════════════════════╝
  `);
  
  const testSize = 20;
  
  // Sequential test
  console.log(`\n📝 SEQUENTIAL: ${testSize} users one at a time...`);
  const seqStart = Date.now();
  let seqSuccess = 0;
  
  for (let i = 0; i < testSize; i++) {
    try {
      await axios.post(`${API_URL}/api/register`, {
        username: `seq_user_${i}_${Date.now()}`,
        email: `seq_${i}_${Date.now()}@test.com`,
        password: 'password123'
      });
      seqSuccess++;
    } catch (err) {
      // Failed
    }
  }
  
  const seqDuration = Date.now() - seqStart;
  console.log(`Sequential: ${seqSuccess}/${testSize} succeeded in ${seqDuration}ms`);
  
  // Concurrent test
  console.log(`\n💥 CONCURRENT: ${testSize} users at the same time...`);
  const concResult = await brutalConcurrentTest(testSize);
  
  console.log(`
📊 Comparison:
├─ Sequential: ${seqSuccess}/${testSize} succeeded (${seqDuration}ms)
├─ Concurrent: ${concResult.succeeded}/${testSize} succeeded (${concResult.duration}ms)
└─ Speed improvement: ${(seqDuration / concResult.duration).toFixed(1)}x faster

💡 But at what cost? ${concResult.failed} failures due to write locks!
  `);
}

// Menu
async function runTests() {
  console.log(`
Choose a test:
1. Find Breaking Point (recommended)
2. Compare Sequential vs Concurrent
3. Brutal 100 user concurrent test
  `);
  
  // For simplicity, run all tests
  await findBreakingPoint();
  await new Promise(resolve => setTimeout(resolve, 3000));
  await compareSequentialVsConcurrent();
}

runTests().catch(console.error);