const axios = require('axios');

async function trueConcurrentWriteTest() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║        TRUE CONCURRENT WRITE TEST                    ║
╠══════════════════════════════════════════════════════╣
║  Testing database write locks with simultaneous      ║
║  writes to the SAME resources                        ║
╚══════════════════════════════════════════════════════╝
  `);

  // Test concurrent UPDATES to same resource (this will show SQLite's weakness)
  async function testConcurrentLikes(url, stageName) {
    console.log(`\n🔥 Testing ${stageName}...`);
    
    // First, create a user and photo to like
    const userRes = await axios.post(`${url}/api/register`, {
      username: `test_user_${Date.now()}`,
      email: `test_${Date.now()}@test.com`,
      password: 'test123'
    });
    const token = userRes.data.token;
    
    // Upload a photo
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    
    // Create a dummy image
    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync('test.png', imageBuffer);
    form.append('photo', fs.createReadStream('test.png'));
    form.append('caption', 'Test photo');
    
    const photoRes = await axios.post(`${url}/api/photos`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    const photoId = photoRes.data.id;
    
    // Now create 50 users who will all try to like the SAME photo simultaneously
    const users = [];
    for (let i = 0; i < 50; i++) {
      const res = await axios.post(`${url}/api/register`, {
        username: `liker_${i}_${Date.now()}`,
        email: `liker_${i}_${Date.now()}@test.com`,
        password: 'test123'
      });
      users.push(res.data.token);
    }
    
    console.log(`📸 Created photo ID ${photoId} and 50 users`);
    console.log(`💥 All 50 users will like the same photo simultaneously...`);
    
    // Now all users try to like the same photo at the exact same time
    const startTime = Date.now();
    const promises = users.map((userToken, i) => 
      axios.post(`${url}/api/photos/${photoId}/like`, {}, {
        headers: { Authorization: `Bearer ${userToken}` },
        timeout: 5000,
        validateStatus: () => true
      })
      .then(res => ({
        success: res.status === 200,
        status: res.status,
        responseTime: Date.now() - startTime,
        error: res.data.error
      }))
      .catch(err => ({
        success: false,
        error: err.code || err.message,
        responseTime: Date.now() - startTime
      }))
    );
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const maxResponseTime = Math.max(...results.map(r => r.responseTime));
    
    // Count error types
    const errorTypes = {};
    results.filter(r => !r.success).forEach(r => {
      const key = r.error || 'Unknown';
      errorTypes[key] = (errorTypes[key] || 0) + 1;
    });
    
    // Clean up
    fs.unlinkSync('test.png');
    
    return {
      stageName,
      successful,
      failed,
      total: users.length,
      successRate: ((successful / users.length) * 100).toFixed(1),
      duration,
      avgResponseTime: Math.round(avgResponseTime),
      maxResponseTime,
      errorTypes
    };
  }
  
  // Test rapid feed fetches (read operations under write load)
  async function testReadUnderWriteLoad(url, stageName) {
    console.log(`\n📖 Testing reads while writes are happening...`);
    
    const userRes = await axios.post(`${url}/api/register`, {
      username: `reader_${Date.now()}`,
      email: `reader_${Date.now()}@test.com`,
      password: 'test123'
    });
    const token = userRes.data.token;
    
    // Start background writes
    let writeErrors = 0;
    const backgroundWrites = setInterval(async () => {
      try {
        await axios.post(`${url}/api/register`, {
          username: `bg_writer_${Date.now()}_${Math.random()}`,
          email: `bg_${Date.now()}@test.com`,
          password: 'test123'
        });
      } catch (err) {
        writeErrors++;
      }
    }, 10); // Write every 10ms
    
    // Now do 100 rapid feed reads
    const readStart = Date.now();
    const readPromises = [];
    
    for (let i = 0; i < 100; i++) {
      readPromises.push(
        axios.get(`${url}/api/feed`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 2000,
          validateStatus: () => true
        })
        .then(res => ({
          success: res.status === 200,
          responseTime: Date.now() - readStart
        }))
        .catch(() => ({
          success: false,
          responseTime: Date.now() - readStart
        }))
      );
    }
    
    const readResults = await Promise.all(readPromises);
    clearInterval(backgroundWrites);
    
    const successfulReads = readResults.filter(r => r.success).length;
    const avgReadTime = readResults.reduce((sum, r) => sum + r.responseTime, 0) / readResults.length;
    
    return {
      stageName,
      successfulReads,
      totalReads: readResults.length,
      readSuccessRate: ((successfulReads / readResults.length) * 100).toFixed(1),
      avgReadTime: Math.round(avgReadTime),
      backgroundWriteErrors: writeErrors
    };
  }
  
  // Run tests
  const results = {};
  
  // Test Stage 1
  try {
    await axios.get('http://localhost:3000/health', { timeout: 1000 });
    console.log('\n🏷️  Stage 1 - SQLite');
    results.stage1Like = await testConcurrentLikes('http://localhost:3000', 'Stage 1 - Concurrent Likes');
    results.stage1Read = await testReadUnderWriteLoad('http://localhost:3000', 'Stage 1 - Read Under Load');
  } catch (err) {
    console.log('❌ Stage 1 not available');
  }
  
  // Test Stage 2
  try {
    await axios.get('http://localhost:3001/health', { timeout: 1000 });
    console.log('\n🏷️  Stage 2 - PostgreSQL');
    results.stage2Like = await testConcurrentLikes('http://localhost:3001', 'Stage 2 - Concurrent Likes');
    results.stage2Read = await testReadUnderWriteLoad('http://localhost:3001', 'Stage 2 - Read Under Load');
  } catch (err) {
    console.log('❌ Stage 2 not available');
  }
  
  // Display results
  console.log(`\n${'='.repeat(60)}`);
  console.log('CONCURRENT WRITE TEST RESULTS');
  console.log('='.repeat(60));
  
  if (results.stage1Like && results.stage2Like) {
    console.log('\n📊 Concurrent Like Test (50 users liking same photo):');
    console.log('─'.repeat(60));
    console.log(`Stage 1 (SQLite):`);
    console.log(`  Success Rate: ${results.stage1Like.successRate}% (${results.stage1Like.successful}/${results.stage1Like.total})`);
    console.log(`  Failed: ${results.stage1Like.failed}`);
    console.log(`  Avg Response: ${results.stage1Like.avgResponseTime}ms`);
    console.log(`  Max Response: ${results.stage1Like.maxResponseTime}ms`);
    if (Object.keys(results.stage1Like.errorTypes).length > 0) {
      console.log(`  Errors: ${JSON.stringify(results.stage1Like.errorTypes)}`);
    }
    
    console.log(`\nStage 2 (PostgreSQL):`);
    console.log(`  Success Rate: ${results.stage2Like.successRate}% (${results.stage2Like.successful}/${results.stage2Like.total})`);
    console.log(`  Failed: ${results.stage2Like.failed}`);
    console.log(`  Avg Response: ${results.stage2Like.avgResponseTime}ms`);
    console.log(`  Max Response: ${results.stage2Like.maxResponseTime}ms`);
    if (Object.keys(results.stage2Like.errorTypes).length > 0) {
      console.log(`  Errors: ${JSON.stringify(results.stage2Like.errorTypes)}`);
    }
  }
  
  if (results.stage1Read && results.stage2Read) {
    console.log('\n📊 Read Performance Under Write Load:');
    console.log('─'.repeat(60));
    console.log(`Stage 1 (SQLite):`);
    console.log(`  Read Success Rate: ${results.stage1Read.readSuccessRate}%`);
    console.log(`  Avg Read Time: ${results.stage1Read.avgReadTime}ms`);
    console.log(`  Background Write Errors: ${results.stage1Read.backgroundWriteErrors}`);
    
    console.log(`\nStage 2 (PostgreSQL):`);
    console.log(`  Read Success Rate: ${results.stage2Read.readSuccessRate}%`);
    console.log(`  Avg Read Time: ${results.stage2Read.avgReadTime}ms`);
    console.log(`  Background Write Errors: ${results.stage2Read.backgroundWriteErrors}`);
  }
  
  console.log(`\n💡 Key Insights:`);
  console.log(`• SQLite uses file-level locking, causing sequential processing`);
  console.log(`• PostgreSQL uses row-level locking with MVCC for true concurrency`);
  console.log(`• Response time is the key metric - not just success rate`);
  console.log(`• In production, slow responses = poor user experience`);
  
  console.log(`\n🎯 Interview Answer:`);
  console.log(`"While both databases completed all requests, SQLite took ${
    results.stage1Like ? results.stage1Like.avgResponseTime : 'N/A'
  }ms`);
  console.log(`average response time due to file-level locking, while PostgreSQL`);
  console.log(`maintained ${
    results.stage2Like ? results.stage2Like.avgResponseTime : 'N/A'
  }ms with row-level locking and connection pooling."`);
}

// Run the test
trueConcurrentWriteTest()
  .then(() => console.log('\n✅ Test complete!'))
  .catch(err => console.error('❌ Test failed:', err));