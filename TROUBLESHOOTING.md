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

## Issue #3: JavaScript Syntax Error - Malformed Indentation

### **Problem Description**
Dashboard remained blank despite fixing timestamps and race conditions. Charts still not rendering and CI/CD status stuck on loading.

### **Root Cause Analysis**
During the previous fixes, **JavaScript indentation was malformed** causing syntax errors:

```javascript
// BROKEN SYNTAX - Missing indentation:
new Chart(performanceChart, {
type: 'line',           // <-- Missing proper indentation!
data: {                 // <-- Inconsistent indentation causing parse errors
```

**JavaScript Parser Error:** The malformed indentation created invalid object literals, preventing the entire script from executing.

### **Symptoms Observed**
- Charts remained completely blank (no rendering)
- Browser console showed JavaScript syntax errors
- CI/CD status never updated from "Loading..."
- No error logs because script failed to parse

### **Solution Applied**
1. **Fixed all JavaScript indentation** to be consistent (4-space indentation)
2. **Restructured chart initialization** with proper nesting
3. **Validated object literal syntax** for both Chart.js configurations
4. **Ensured function scoping** for initializeDashboard()

```javascript
// FIXED SYNTAX - Proper indentation:
new Chart(performanceChart, {
    type: 'line',                    // ✅ Proper 4-space indentation
    data: {                          // ✅ Consistent nesting
        labels: [...],               // ✅ Valid object structure
        datasets: [{...}]
    },
    options: {...}
});
```

### **Files Modified**
- `.github/workflows/deploy-pages.yml` - Lines 478-595 (Complete JavaScript section)

### **Key Learning**
- **Indentation matters in object literals** - inconsistent spacing breaks parsing
- **Syntax errors prevent entire script execution** - no fallback behavior
- **Always validate JavaScript syntax** especially in CI-generated content
- **Use consistent indentation style** throughout embedded scripts

### **Testing Validation**
- Check browser console for JavaScript errors
- Verify Chart.js objects initialize properly
- Confirm canvas elements render chart content

---

## Issue #4: Charts Using Hardcoded Data Instead of Live Data

### **Problem Description**
Despite fixing JavaScript syntax errors, charts were still not displaying live data. Response Time Trend and Error Distribution charts showed static values instead of the dynamic data from `window.livePerformanceData`.

### **Root Cause Analysis**
**Data flow disconnect:** Charts were initialized with hardcoded arrays instead of reading from the live performance data:

```javascript
// PROBLEM - Hardcoded data ignoring live data:
new Chart(ctx, {
    data: {
        datasets: [{
            data: [145, 652, 1361, 2774],  // ❌ Static hardcoded values
        }]
    }
});
```

**Investigation Process:**
1. ✅ Verified `live-performance-data.js` loads with valid data  
2. ✅ Confirmed Chart.js CDN accessibility
3. ✅ Validated JavaScript syntax correctness
4. ❌ **Discovered charts ignore `window.livePerformanceData`**

### **Solution Applied**
1. **Modified chart initialization** to read from live data source
2. **Added fallback mechanism** with hardcoded data when live data unavailable
3. **Implemented data mapping** from live metrics to chart datasets
4. **Added console logging** for debugging data source usage

```javascript
// FIXED - Dynamic data from live source:
let stage1Data = [145, 652, 1361, 2774]; // Fallback
if (typeof window.livePerformanceData !== 'undefined') {
    const liveData = window.livePerformanceData;
    stage1Data = [
        liveData.metrics.stage1.metrics["10"].response,
        liveData.metrics.stage1.metrics["50"].response,
        // ... map all data points
    ];
    console.log('Using live performance data:', liveData.lastUpdated);
}

new Chart(ctx, {
    data: {
        datasets: [{ data: stage1Data }]  // ✅ Dynamic data
    }
});
```

### **Files Modified**
- `.github/workflows/deploy-pages.yml` - Lines 486-640 (Chart initialization with live data)

### **Data Flow Verification**
1. **Live Data Source**: `https://kardebkar.github.io/System-Design-Practice/live-performance-data.js`
2. **Performance Chart**: Maps `metrics.stage1/stage2.metrics["10-200"].response` 
3. **Error Chart**: Calculates from `metrics.stage1/stage2.successRate`
4. **Console Logs**: Show which data source is being used

### **Key Learning**
- **Always verify data flow end-to-end** - syntax correctness ≠ data usage
- **Add console logging** for debugging dynamic data loading
- **Implement fallback data** for graceful degradation
- **Test with actual data sources** not just static examples

---

**Last Updated:** August 3, 2025
**Resolved By:** Claude Code Assistant