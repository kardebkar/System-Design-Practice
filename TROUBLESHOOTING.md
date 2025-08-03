# 🔧 Dashboard Troubleshooting Guide

## Issue #1: Dashboard Charts Not Loading / Blank Page

### **Problem Description**
The GitHub Pages dashboard was loading HTML but charts remained blank and CI/CD status showed "Loading..." indefinitely.

### **Root Cause Analysis**
The issue was in the GitHub Actions workflow file `.github/workflows/deploy-pages.yml`. The shell command to generate the JavaScript data file was using single quotes around the EOF delimiter:

```bash
# PROBLEMATIC CODE:
cat > docs/live-performance-data.js << 'EOF'
window.livePerformanceData = {
  lastUpdated: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",  # This command wasn't executing!
```

**Root Cause:** Using single quotes (`'EOF'`) prevents shell variable expansion and command substitution. The `$(date ...)` command was being written literally as a string instead of being executed.

### **Solution Applied**
1. **Fixed the EOF delimiter** by removing single quotes to allow variable expansion
2. **Pre-executed the date command** and stored it in a variable
3. **Used double quotes** to allow variable substitution

```bash
# FIXED CODE:
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > docs/live-performance-data.js << EOF
window.livePerformanceData = {
  lastUpdated: "${TIMESTAMP}",  # Now properly substituted!
```

### **Files Modified**
- `.github/workflows/deploy-pages.yml` - Line 72-75

### **Testing Steps**
1. Commit and push changes to trigger GitHub Pages deployment
2. Wait 2-3 minutes for deployment to complete
3. Check `https://kardebkar.github.io/System-Design-Practice/live-performance-data.js` for proper timestamp
4. Verify dashboard loads with charts and data

### **Key Learning**
- **Single quotes (`'EOF'`)**: Prevent all variable expansion and command substitution
- **Double quotes (`EOF`)**: Allow variable expansion with `${VAR}` and command substitution with `$(command)`
- **Always test shell variable expansion** in CI/CD workflows

### **Prevention**
- Use `echo` commands to verify variable values in workflow logs
- Test heredoc syntax with simple variables first
- Check deployed files directly via URL to verify content generation

---

## Issue #2: Charts Still Not Loading Despite Fixed Timestamps

### **Problem Description**
Even after fixing the timestamp generation, the dashboard charts (Response Time Trend and Error Distribution) remained blank, and the CI/CD status continued showing "Loading...".

### **Root Cause Analysis**
The JavaScript was executing before:
1. **Chart.js library fully loaded** from the CDN
2. **DOM elements were ready** for chart initialization
3. **Proper error handling** for missing canvas elements

**Symptoms:**
- `TypeError: Chart is not a constructor` (Chart.js not loaded)
- `Cannot read property 'getContext' of null` (DOM not ready)
- Silent failures with no error logging

### **Solution Applied**
1. **Added Chart.js loading check** with retry mechanism
2. **Wrapped all initialization** in a single function with proper sequencing
3. **Added DOM element validation** before chart creation
4. **Improved error logging** for debugging

```javascript
// BEFORE - Race condition issues:
const ctx = document.getElementById('performanceChart').getContext('2d');
new Chart(ctx, {...});

// AFTER - Proper loading sequence:
function initializeDashboard() {
    if (typeof Chart === 'undefined') {
        setTimeout(initializeDashboard, 100);  // Retry until Chart.js loads
        return;
    }
    
    const ctx = document.getElementById('performanceChart');
    if (!ctx) {
        console.error('Performance chart canvas not found');
        return;
    }
    // ... safe to proceed
}
```

### **Files Modified**
- `.github/workflows/deploy-pages.yml` - Lines 479-699 (JavaScript initialization)

### **Key Learning**
- **External CDN libraries** may load after your script executes
- **Always validate DOM elements** exist before using them
- **Use retry mechanisms** for external dependencies
- **Wrap related initialization** in a single function for better control

---

**Last Updated:** $(date)
**Resolved By:** Claude Code Assistant