const fs = require('fs');
const path = require('path');
const os = require('os');

function getPm2Dir() {
    return path.join(os.homedir(), '.pm2', 'logs');
}

function isAvailable() {
    const dir = getPm2Dir();
    return fs.existsSync(dir);
}

function scan() {
    const logsDir = getPm2Dir();
    const results = {
        source: 'PM2',
        sessions: 0,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        breakdown: {
            duplicateReads: { calls: 0, tokens: 0, cost: 0, description: 'Repeated identical API calls' },
            infiniteLoops: { calls: 0, tokens: 0, cost: 0, description: 'Service crash-restart loops' },
            overkillModel: { calls: 0, tokens: 0, cost: 0, description: 'Expensive model for health checks' },
            staleContext: { calls: 0, tokens: 0, cost: 0, description: 'Unchanged prompts resent' },
        },
        processes: [],
    };

    if (!fs.existsSync(logsDir)) return results;

    try {
        const entries = fs.readdirSync(logsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            if (!entry.name.endsWith('.log')) continue;

            const fullPath = path.join(logsDir, entry.name);
            const isError = entry.name.includes('-error');
            const processName = entry.name.replace(/-(out|error)-\d+\.log$/, '');

            if (!results.processes.includes(processName)) {
                results.processes.push(processName);
                results.sessions++;
            }

            try {
                parseLogFile(fullPath, isError, results);
            } catch (err) {
                // Skip unreadable files
            }
        }
    } catch (err) { /* permission denied */ }

    return results;
}

function parseLogFile(filePath, isError, results) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const seenPayloads = new Map();
    let consecutiveErrors = 0;
    let lastErrorSig = '';

    for (const line of lines) {
        if (!line.trim()) continue;

        // Detect API call patterns
        const modelMatch = line.match(/model["\s:=]+["']?(claude|gpt|gemini|llama)[^"'\s]*/i);
        if (modelMatch) {
            results.totalCalls++;

            // Check for token count in log
            const tokenMatch = line.match(/tokens?["\s:=]+(\d+)/i);
            if (tokenMatch) {
                results.totalTokens += parseInt(tokenMatch[1]);
            } else {
                results.totalTokens += 2000; // Estimate
            }
        }

        // Detect cost info
        const costMatch = line.match(/cost["\s:=]+\$?([\d.]+)/i);
        if (costMatch) {
            results.totalCost += parseFloat(costMatch[1]);
        }

        // Detect error loops
        if (isError || line.toLowerCase().includes('error') || line.toLowerCase().includes('err')) {
            const sig = line.replace(/[\d.]+/g, 'N').replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, 'TIME');
            if (sig === lastErrorSig) {
                consecutiveErrors++;
                if (consecutiveErrors >= 5) {
                    results.breakdown.infiniteLoops.calls++;
                    results.breakdown.infiniteLoops.cost += 0.05;
                }
            } else {
                consecutiveErrors = 1;
                lastErrorSig = sig;
            }
        }

        // Detect retry patterns
        if (line.includes('retry') || line.includes('retrying') || line.includes('attempt')) {
            results.breakdown.infiniteLoops.calls++;
            results.breakdown.infiniteLoops.cost += 0.10;
        }

        // Detect rate limits
        if (line.includes('rate limit') || line.includes('429') || line.includes('Too Many Requests')) {
            results.breakdown.overkillModel.calls++;
            results.breakdown.overkillModel.cost += 0.10;
        }

        // Detect duplicate payloads
        if (line.includes('messages') || line.includes('prompt')) {
            const hash = simpleHash(line);
            const count = (seenPayloads.get(hash) || 0) + 1;
            seenPayloads.set(hash, count);
            if (count > 2) {
                results.breakdown.duplicateReads.calls++;
                results.breakdown.duplicateReads.cost += 0.15;
            }
        }
    }

    // Estimate cost if not found in logs
    if (results.totalCost === 0 && results.totalTokens > 0) {
        results.totalCost = (results.totalTokens / 1_000_000) * 3.00;
    }
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}

module.exports = { scan, isAvailable, getPm2Dir };
