# 🚀 GitHub Pages & CI/CD Integration Setup Guide

## 📋 Quick Setup Checklist

### 1. Enable GitHub Pages
1. Go to your repository settings: `https://github.com/kardebkar/System-Design-Practice/settings/pages`
2. Under "Source", select **GitHub Actions**
3. Save the settings

### 2. Repository Permissions
Make sure your repository has the following permissions:
- **Actions**: Read and write permissions
- **Pages**: Write permissions  
- **Contents**: Read permissions

To check/update permissions:
1. Go to `Settings > Actions > General`
2. Under "Workflow permissions", select **Read and write permissions**
3. Check **Allow GitHub Actions to create and approve pull requests**

### 3. Deploy Dashboard
The dashboard will automatically deploy when you push changes to `main` branch.

**Deployment URL:** https://kardebkar.github.io/System-Design-Practice/

## 🔧 Manual Deployment

If you need to manually trigger deployment:

```bash
# Trigger GitHub Pages deployment
gh workflow run deploy-pages.yml

# Or use the GitHub web interface:
# Go to Actions > Deploy Dashboard to GitHub Pages > Run workflow
```

## 🔗 Direct Links Configuration

### Current Links
- **Live Dashboard:** https://kardebkar.github.io/System-Design-Practice/
- **GitHub Actions:** https://github.com/kardebkar/System-Design-Practice/actions
- **Latest CI/CD Run:** Dynamic (fetched via API)
- **Performance Reports:** Available as artifacts

### API Endpoints Used
```javascript
// Latest workflow runs
GET https://api.github.com/repos/kardebkar/System-Design-Practice/actions/runs

// Specific run details  
GET https://api.github.com/repos/kardebkar/System-Design-Practice/actions/runs/{run_id}

// Run artifacts
GET https://api.github.com/repos/kardebkar/System-Design-Practice/actions/runs/{run_id}/artifacts
```

## 🔑 GitHub API Authentication (Optional)

For higher API rate limits, you can add authentication:

### Method 1: Personal Access Token (for local development)
```javascript
// Add to dashboard's fetch requests
const headers = {
    'Authorization': 'token YOUR_GITHUB_TOKEN',
    'Accept': 'application/vnd.github.v3+json'
};

fetch(url, { headers })
```

### Method 2: GitHub Actions (for CI/CD)
The workflow already uses `GITHUB_TOKEN` automatically:
```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 📊 Real-time Features

### What Works Now
✅ **Real-time CI/CD status** - Fetches latest workflow runs  
✅ **Direct links to runs** - Click to view detailed results  
✅ **Artifact downloads** - Access performance reports  
✅ **Live GitHub Pages** - Auto-deployed dashboard  
✅ **Responsive design** - Works on all devices  

### API Rate Limits
- **Unauthenticated:** 60 requests/hour per IP
- **Authenticated:** 5,000 requests/hour
- **GitHub Actions:** Higher limits automatically

## 🎯 Interview Demo Script

### 1. Show Live Dashboard
```
"Let me show you the live performance dashboard I built. 
It's deployed on GitHub Pages and pulls real-time data from our CI/CD pipeline."

URL: https://kardebkar.github.io/System-Design-Practice/
```

### 2. Demonstrate Real-time Integration
```
"Click 'Refresh Real-time Data' to see it fetch the latest CI/CD results 
from the GitHub API. This shows the actual performance test results."
```

### 3. Show CI/CD Pipeline
```
"Here you can see our automated testing pipeline. Every commit triggers 
performance tests that compare SQLite vs PostgreSQL with real user behavior."

Direct link: https://github.com/kardebkar/System-Design-Practice/actions
```

### 4. Download Performance Reports
```
"The system automatically generates detailed performance reports that you 
can download. These include metrics like user experience scores and 
response time analysis."
```

## 🚨 Troubleshooting

### Dashboard Not Loading
1. Check GitHub Pages is enabled
2. Verify the workflow completed successfully
3. Wait 5-10 minutes for propagation

### API Rate Limit Exceeded
1. The dashboard shows cached data
2. Links still work manually
3. Implement authentication for higher limits

### Workflow Failures
1. Check repository permissions
2. Verify workflow file syntax
3. Look at workflow run logs

## 🔄 Automatic Updates

The dashboard automatically updates when:
- You push changes to `main` branch
- The CI/CD pipeline runs
- Performance tests complete

## 🎓 Advanced Features

### Custom Domain (Optional)
1. Add `CNAME` file to repository root
2. Configure DNS settings
3. Enable HTTPS in repository settings

### Analytics Integration
Add to dashboard HTML:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

### Enhanced Monitoring
```javascript
// Track dashboard usage
function trackDashboardView() {
    fetch('/api/analytics', {
        method: 'POST',
        body: JSON.stringify({ event: 'dashboard_view' })
    });
}
```

## 📋 Verification Steps

After setup, verify these work:

1. ✅ **GitHub Pages URL loads:** https://kardebkar.github.io/System-Design-Practice/
2. ✅ **Real-time data refresh** works without errors
3. ✅ **CI/CD links** navigate to correct workflow runs  
4. ✅ **Responsive design** works on mobile/tablet
5. ✅ **Performance charts** render correctly

## 🎯 Next Steps

1. **Enable GitHub Pages** (5 minutes)
2. **Test the live dashboard** (2 minutes)  
3. **Run performance tests** to generate fresh data
4. **Share the live URL** in interviews/demos

**Live Dashboard:** https://kardebkar.github.io/System-Design-Practice/ 🚀