/**
 * MiniGram Stage 4 - Frontend JavaScript
 * Demonstrates cache performance and CDN delivery
 * This file is served through CDN for optimal caching
 */

class MiniGramStage4 {
    constructor() {
        this.instanceData = null;
        this.cacheStats = null;
        this.init();
    }

    async init() {
        console.log('🚀 MiniGram Stage 4 - Cache & CDN Demo initialized');
        await this.loadInstanceInfo();
        await this.loadCacheStats();
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    async loadInstanceInfo() {
        try {
            const response = await fetch('/api/instance');
            this.instanceData = await response.json();
            this.updateInstanceDisplay();
        } catch (error) {
            console.error('Failed to load instance info:', error);
            this.showError('instance-id', 'Failed to load');
        }
    }

    async loadCacheStats() {
        try {
            const response = await fetch('/api/cache/stats');
            if (response.ok) {
                this.cacheStats = await response.json();
            } else {
                console.warn('Cache stats not available');
            }
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        }
    }

    updateInstanceDisplay() {
        if (!this.instanceData) return;

        const instanceIdEl = document.getElementById('instance-id');
        const cacheStatusEl = document.getElementById('cache-status');
        const uptimeEl = document.getElementById('uptime');

        if (instanceIdEl) {
            instanceIdEl.textContent = this.instanceData.instance || 'Unknown';
            instanceIdEl.className = 'instance-badge';
        }

        if (cacheStatusEl) {
            const isHealthy = this.instanceData.cache_enabled;
            cacheStatusEl.innerHTML = isHealthy 
                ? '<span class="cache-indicator"></span>Enabled & Healthy'
                : '<span class="cache-indicator error"></span>Disabled';
            cacheStatusEl.className = isHealthy ? 'success' : 'error';
        }

        if (uptimeEl) {
            const uptime = this.formatUptime(this.instanceData.uptime || 0);
            uptimeEl.textContent = uptime;
        }
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = 'error';
        }
    }

    setupEventListeners() {
        // Add load test button functionality
        const loadTestBtn = document.querySelector('button[onclick="loadTest()"]');
        if (loadTestBtn) {
            loadTestBtn.onclick = () => this.runLoadTest();
        }
    }

    async runLoadTest() {
        const resultsEl = document.getElementById('test-results');
        if (!resultsEl) return;

        resultsEl.innerHTML = '<div class="loading"></div> Running cache performance test...';
        resultsEl.className = 'show';

        try {
            const results = await this.performCacheTest();
            this.displayTestResults(results);
        } catch (error) {
            resultsEl.innerHTML = `<span class="error">Test failed: ${error.message}</span>`;
        }
    }

    async performCacheTest() {
        const testResults = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgResponseTime: 0,
            testDuration: 0
        };

        const startTime = Date.now();
        const requests = [];
        const numRequests = 20;

        // Test multiple endpoints to demonstrate caching
        const endpoints = [
            '/api/posts?page=1&limit=5',
            '/api/posts?page=1&limit=10',
            '/health',
            '/api/instance'
        ];

        console.log('🧪 Starting cache performance test...');

        // Make concurrent requests to test cache performance
        for (let i = 0; i < numRequests; i++) {
            const endpoint = endpoints[i % endpoints.length];
            const requestPromise = this.makeTimedRequest(endpoint);
            requests.push(requestPromise);
        }

        const responses = await Promise.all(requests);
        const endTime = Date.now();

        // Analyze results
        responses.forEach(response => {
            testResults.totalRequests++;
            testResults.avgResponseTime += response.duration;
            
            if (response.cacheHit) {
                testResults.cacheHits++;
            } else {
                testResults.cacheMisses++;
            }
        });

        testResults.avgResponseTime = testResults.avgResponseTime / testResults.totalRequests;
        testResults.testDuration = endTime - startTime;
        testResults.cacheHitRatio = (testResults.cacheHits / testResults.totalRequests * 100).toFixed(1);

        return testResults;
    }

    async makeTimedRequest(endpoint) {
        const startTime = Date.now();
        try {
            const response = await fetch(endpoint);
            const endTime = Date.now();
            const data = await response.json();
            
            return {
                endpoint,
                duration: endTime - startTime,
                status: response.status,
                cacheHit: data.cache_hit || response.headers.get('X-Cache-Status') === 'HIT',
                cached: data.cached || false
            };
        } catch (error) {
            return {
                endpoint,
                duration: Date.now() - startTime,
                status: 500,
                error: error.message,
                cacheHit: false
            };
        }
    }

    displayTestResults(results) {
        const resultsEl = document.getElementById('test-results');
        if (!resultsEl) return;

        const html = `
            <h4>🏁 Cache Performance Test Results</h4>
            <div class="test-metrics">
                <p><strong>Total Requests:</strong> ${results.totalRequests}</p>
                <p><strong>Cache Hits:</strong> ${results.cacheHits} (${results.cacheHitRatio}%)</p>
                <p><strong>Cache Misses:</strong> ${results.cacheMisses}</p>
                <p><strong>Average Response Time:</strong> ${results.avgResponseTime.toFixed(2)}ms</p>
                <p><strong>Test Duration:</strong> ${results.testDuration}ms</p>
                <p><strong>Cache Hit Ratio:</strong> ${results.cacheHitRatio}%</p>
            </div>
            <div class="performance-indicator ${results.cacheHitRatio > 50 ? 'success' : 'warning'}">
                ${results.cacheHitRatio > 50 
                    ? '✅ Good cache performance!' 
                    : '⚠️ Cache could be improved'
                }
            </div>
        `;

        resultsEl.innerHTML = html;
        console.log('📊 Test Results:', results);
    }

    startPeriodicUpdates() {
        // Update instance info every 30 seconds
        setInterval(() => {
            this.loadInstanceInfo();
        }, 30000);

        // Update cache stats every 60 seconds
        setInterval(() => {
            this.loadCacheStats();
        }, 60000);
    }

    // Utility function to warm cache
    async warmCache() {
        try {
            const response = await fetch('/api/cache/warm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            console.log('🔥 Cache warmed:', result);
            return result;
        } catch (error) {
            console.error('Failed to warm cache:', error);
        }
    }

    // Utility function to invalidate cache
    async invalidateCache(pattern = '*') {
        try {
            const response = await fetch('/api/cache/invalidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pattern })
            });
            const result = await response.json();
            console.log('🗑️ Cache invalidated:', result);
            return result;
        } catch (error) {
            console.error('Failed to invalidate cache:', error);
        }
    }
}

// Global functions for backward compatibility
function loadTest() {
    if (window.minigramApp) {
        window.minigramApp.runLoadTest();
    }
}

function warmCache() {
    if (window.minigramApp) {
        return window.minigramApp.warmCache();
    }
}

function invalidateCache(pattern) {
    if (window.minigramApp) {
        return window.minigramApp.invalidateCache(pattern);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.minigramApp = new MiniGramStage4();
});

// Add some console styling for better debugging
console.log('%c🚀 MiniGram Stage 4 - Cache & CDN', 
    'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('%cDemonstrating multi-layered caching with Redis and CDN', 
    'color: #764ba2; font-size: 12px;');

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MiniGramStage4;
}