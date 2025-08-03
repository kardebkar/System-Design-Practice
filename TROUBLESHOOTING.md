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

## Issue #2: [Future issues will be documented here]

---

**Last Updated:** $(date)
**Resolved By:** Claude Code Assistant