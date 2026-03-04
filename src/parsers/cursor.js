const fs = require('fs');
const path = require('path');
const os = require('os');

function getCursorDir() {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor');
    } else if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor');
    } else {
        return path.join(os.homedir(), '.config', 'Cursor');
    }
}

function isAvailable() {
    const dir = getCursorDir();
    return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'logs'));
}

function scan() {
    const cursorDir = getCursorDir();
    const results = {
        source: 'Cursor',
        sessions: 0,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        breakdown: {
            duplicateReads: { calls: 0, tokens: 0, cost: 0, description: 'Redundant file indexing' },
            infiniteLoops: { calls: 0, tokens: 0, cost: 0, description: 'Extension error loops' },
            overkillModel: { calls: 0, tokens: 0, cost: 0, description: 'Premium model for simple completions' },
            staleContext: { calls: 0, tokens: 0, cost: 0, description: 'Unchanged context resent' },
        },
        errorCount: 0,
    };

    const logsDir = path.join(cursorDir, 'logs');
    if (!fs.existsSync(logsDir)) return results;

    // Find all log session directories
    const sessionDirs = findLogDirectories(logsDir);

    for (const sessionDir of sessionDirs) {
        try {
            parseSessionLogs(sessionDir, results);
            results.sessions++;
        } catch (err) {
            // Skip unreadable sessions
        }
    }

    return results;
}

function findLogDirectories(logsDir) {
    const dirs = [];
    try {
        const entries = fs.readdirSync(logsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                dirs.push(path.join(logsDir, entry.name));
            }
        }
    } catch (err) { /* permission denied */ }
    return dirs;
}

function parseSessionLogs(sessionDir, results) {
    const logFiles = findLogFiles(sessionDir);

    for (const logFile of logFiles) {
        try {
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.split('\n');

            let lastErrorMsg = '';
            let consecutiveErrors = 0;
            const seenErrors = new Map();

            for (const line of lines) {
                if (!line.trim()) continue;

                // Parse log level
                const levelMatch = line.match(/\[(info|error|warning|warn|debug)\]/i);
                if (!levelMatch) continue;
                const level = levelMatch[1].toLowerCase();

                // Count errors
                if (level === 'error') {
                    results.errorCount++;

                    // Detect repeated errors (infinite loops)
                    const errorKey = line.replace(/[\d.]+/g, 'N'); // Normalize numbers
                    const count = (seenErrors.get(errorKey) || 0) + 1;
                    seenErrors.set(errorKey, count);

                    if (line === lastErrorMsg) {
                        consecutiveErrors++;
                        if (consecutiveErrors >= 3) {
                            results.breakdown.infiniteLoops.calls++;
                            results.breakdown.infiniteLoops.cost += 0.05;
                        }
                    } else {
                        consecutiveErrors = 1;
                        lastErrorMsg = line;
                    }

                    // Detect specific waste patterns
                    if (line.includes('rate limit') || line.includes('429')) {
                        results.breakdown.overkillModel.calls++;
                        results.breakdown.overkillModel.cost += 0.10;
                    }
                }

                // Detect extension reinstall churn
                if (line.includes('Installing extension') || line.includes('Downloading extension')) {
                    results.breakdown.duplicateReads.calls++;
                    results.breakdown.duplicateReads.cost += 0.02;
                }

                // Track MCP/AI activity
                if (line.includes('MCP') || line.includes('chatgpt') || line.includes('copilot')) {
                    results.totalCalls++;
                }
            }
        } catch (err) {
            // Skip unreadable files
        }
    }

    // Estimate tokens and cost from activity
    // Cursor doesn't expose token counts, so we estimate conservatively
    results.totalTokens = results.totalCalls * 2000; // ~2k tokens per interaction
    results.totalCost = (results.totalTokens / 1_000_000) * 3.00; // Assume Sonnet-tier pricing
}

function findLogFiles(dir, depth = 0) {
    if (depth > 4) return [];
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && depth < 4) {
                files.push(...findLogFiles(fullPath, depth + 1));
            } else if (entry.isFile() && entry.name.endsWith('.log')) {
                files.push(fullPath);
            }
        }
    } catch (err) { /* permission denied */ }
    return files;
}

module.exports = { scan, isAvailable, getCursorDir };
