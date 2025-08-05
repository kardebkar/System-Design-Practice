const http = require('http');
const https = require('https');
const fs = require('fs');

class LoadBalancedTest {
  constructor() {
    this.baseUrl = 'http://localhost';
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      instanceDistribution: {},
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  async makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const postData = data ? JSON.stringify(data) : null;
      
      const options = {
        hostname: 'localhost',
        port: 80,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoadBalancedTest/1.0'
        }
      };

      if (postData) {
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          
          // Try to extract instance info from response
          let instanceId = 'unknown';
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.instance) {
              instanceId = parsed.instance;
            }
          } catch (e) {
            // Check headers for instance info
            instanceId = res.headers['x-instance-id'] || 'unknown';
          }
          
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            instance: instanceId,
            success: res.statusCode >= 200 && res.statusCode < 400,
            data: responseData
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          statusCode: 0,
          responseTime: Date.now() - startTime,
          instance: 'error',
          success: false,
          error: error.message
        });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({
          statusCode: 0,
          responseTime: 10000,
          instance: 'timeout',
          success: false,
          error: 'Request timeout'
        });
      });

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }

  async testHealthChecks() {
    console.log('\n🏥 Testing Health Checks...');
    
    const healthResults = [];
    for (let i = 0; i < 10; i++) {
      const result = await this.makeRequest('/health');
      healthResults.push(result);
      
      if (result.success) {
        this.results.instanceDistribution[result.instance] = 
          (this.results.instanceDistribution[result.instance] || 0) + 1;
      }
    }
    
    const successRate = healthResults.filter(r => r.success).length / healthResults.length * 100;
    const avgResponseTime = healthResults.reduce((sum, r) => sum + r.responseTime, 0) / healthResults.length;
    
    console.log(`Health Check Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log('Instance Distribution:', this.results.instanceDistribution);
    
    return { successRate, avgResponseTime };
  }

  async testLoadBalancing() {
    console.log('\n⚖️ Testing Load Balancing Distribution...');
    
    const requests = 50;
    const results = [];
    
    // Reset instance distribution
    this.results.instanceDistribution = {};
    
    // Make concurrent requests to test load balancing
    const promises = [];
    for (let i = 0; i < requests; i++) {
      promises.push(this.makeRequest('/api/instance'));
    }
    
    const responses = await Promise.all(promises);
    
    responses.forEach(result => {
      if (result.success) {
        this.results.instanceDistribution[result.instance] = 
          (this.results.instanceDistribution[result.instance] || 0) + 1;
      }
      results.push(result);
    });
    
    const successRate = results.filter(r => r.success).length / results.length * 100;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    console.log(`Load Balancing Test Results:`);
    console.log(`- Total Requests: ${requests}`);
    console.log(`- Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`- Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`- Instance Distribution:`, this.results.instanceDistribution);
    
    // Check if load is evenly distributed (within 20% variance)
    const instanceCounts = Object.values(this.results.instanceDistribution);
    const avgCount = instanceCounts.reduce((a, b) => a + b, 0) / instanceCounts.length;
    const maxVariance = Math.max(...instanceCounts.map(count => Math.abs(count - avgCount))) / avgCount;
    
    console.log(`- Load Distribution Variance: ${(maxVariance * 100).toFixed(1)}%`);
    console.log(`- Load Balancing Quality: ${maxVariance < 0.3 ? '✅ Good' : '⚠️ Uneven'}`);
    
    return { successRate, avgResponseTime, loadBalancingQuality: maxVariance < 0.3 };
  }

  async testConcurrentLoad() {
    console.log('\n🚀 Testing Concurrent Load Handling...');
    
    const concurrencyLevels = [10, 25, 50, 100];
    const results = {};
    
    for (const concurrency of concurrencyLevels) {
      console.log(`\nTesting ${concurrency} concurrent requests...`);
      
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < concurrency; i++) {
        promises.push(this.makeRequest('/health'));
      }
      
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      const successful = responses.filter(r => r.success).length;
      const failed = responses.length - successful;
      const successRate = (successful / responses.length) * 100;
      const avgResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
      const totalTime = endTime - startTime;
      const throughput = responses.length / (totalTime / 1000);
      
      results[concurrency] = {
        successful,
        failed,
        successRate,
        avgResponseTime,
        totalTime,
        throughput
      };
      
      console.log(`- Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`- Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
      console.log(`- Total Time: ${totalTime}ms`);
      console.log(`- Throughput: ${throughput.toFixed(1)} req/s`);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }

  async testFailover() {
    console.log('\n🔄 Testing Failover Behavior...');
    
    // This test would ideally stop one container and test if traffic redirects
    // For now, we'll test the system's resilience under load
    
    console.log('Note: Full failover testing requires container orchestration');
    console.log('Testing system resilience instead...');
    
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(this.makeRequest('/health'));
      // Add some random delays to simulate real-world traffic
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const results = await Promise.all(promises);
    const successRate = results.filter(r => r.success).length / results.length * 100;
    
    console.log(`System Resilience Test: ${successRate.toFixed(1)}% success rate`);
    
    return { successRate };
  }

  generateReport() {
    console.log('\n📊 LOAD BALANCED TEST REPORT');
    console.log('=' .repeat(50));
    
    console.log('\n🎯 Summary:');
    console.log(`- Total Test Duration: ${this.results.endTime - this.results.startTime}ms`);
    console.log(`- Load Balancing: ${Object.keys(this.results.instanceDistribution).length} instances detected`);
    console.log(`- Instance Distribution:`, this.results.instanceDistribution);
    
    // Save detailed results
    const reportPath = 'load-balanced-test-results.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📝 Detailed results saved to: ${reportPath}`);
    
    return this.results;
  }

  async runFullTest() {
    console.log('🚀 Starting Load Balanced Performance Test');
    console.log('Testing load balancer distribution, failover, and scaling...\n');
    
    this.results.startTime = Date.now();
    
    try {
      // Test 1: Health checks and instance discovery
      const healthResults = await this.testHealthChecks();
      
      // Test 2: Load balancing distribution
      const loadBalancingResults = await this.testLoadBalancing();
      
      // Test 3: Concurrent load handling
      const concurrentResults = await this.testConcurrentLoad();
      
      // Test 4: Failover resilience
      const failoverResults = await this.testFailover();
      
      this.results.endTime = Date.now();
      
      // Store all results
      this.results.testResults = {
        health: healthResults,
        loadBalancing: loadBalancingResults,
        concurrent: concurrentResults,
        failover: failoverResults
      };
      
      return this.generateReport();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.results.endTime = Date.now();
      this.results.errors.push(error.message);
      return this.generateReport();
    }
  }
}

// Run the test if called directly
if (require.main === module) {
  const test = new LoadBalancedTest();
  test.runFullTest().then(results => {
    console.log('\n✅ Load balanced test completed!');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = LoadBalancedTest;