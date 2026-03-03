const fs = require('fs');
const path = require('path');

const TOKEN_COSTS = {
    'claude-3-5-sonnet': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-3-5-haiku': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'default': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
};

async function scanDirectory(dir) {
    const results = {
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        wastedCost: 0,
        wastedPercent: 0,
        breakdown: {
            duplicateReads: { calls: 0, tokens: 0, cost: 0, description: 'Same file re-read by agent' },
            infiniteLoops: { calls: 0, tokens: 0, cost: 0, description: 'Stuck retrying same error' },
            overkillModel: { calls: 0, tokens: 0, cost: 0, description: 'Flagship model for simple tasks' },
            staleContext: { calls: 0, tokens: 0, cost: 0, description: 'Resending unchanged history' },
        },
        recommendations: [],
        scanDate: new Date().toISOString(),
        period: 'Scanned files',
    };

    const logFiles = findLogFiles(dir);

    for (const file of logFiles) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            analyzeLog(content, results);
        } catch (err) {
            // Skip unreadable files
        }
    }

    // Calculate waste percentage
    if (results.totalCost > 0) {
        results.wastedCost = results.breakdown.duplicateReads.cost
            + results.breakdown.infiniteLoops.cost
            + results.breakdown.overkillModel.cost
            + results.breakdown.staleContext.cost;
        results.wastedPercent = Math.round((results.wastedCost / results.totalCost) * 1000) / 10;
    }

    // Generate recommendations
    if (results.breakdown.duplicateReads.cost > 0) {
        results.recommendations.push({
            action: 'Install Agentic Firewall',
            savings: `$${results.breakdown.duplicateReads.cost.toFixed(2)}/week`,
            reason: 'Auto-caches duplicate codebase reads',
        });
    }
    if (results.breakdown.infiniteLoops.cost > 0) {
        results.recommendations.push({
            action: 'Enable Circuit Breaker',
            savings: `$${results.breakdown.infiniteLoops.cost.toFixed(2)}/week`,
            reason: 'Kills infinite retry loops after 3 attempts',
        });
    }
    if (results.breakdown.overkillModel.cost > 0) {
        results.recommendations.push({
            action: 'Enable Shadow Router',
            savings: `$${results.breakdown.overkillModel.cost.toFixed(2)}/week`,
            reason: 'Routes simple tasks to cheaper models',
        });
    }

    return results;
}

function findLogFiles(dir, depth = 0) {
    if (depth > 4) return [];
    const files = [];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && depth < 4) {
                files.push(...findLogFiles(fullPath, depth + 1));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                const name = entry.name.toLowerCase();
                if (ext === '.log' || ext === '.jsonl' || name.includes('agent') || name.includes('claude') || name.includes('openai')) {
                    files.push(fullPath);
                }
            }
        }
    } catch (err) {
        // Permission denied, skip
    }

    return files;
}

function analyzeLog(content, results) {
    const lines = content.split('\n');
    const seenPayloads = new Map();
    let consecutiveErrors = 0;
    let lastErrorSignature = '';

    for (const line of lines) {
        if (!line.trim()) continue;

        // Try to parse as JSON (structured log)
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            // Plain text log — look for patterns
            analyzeTextLine(line, results);
            continue;
        }

        results.totalCalls++;

        // Estimate tokens from content length
        const contentLength = JSON.stringify(entry).length;
        const estimatedTokens = Math.ceil(contentLength / 4);
        results.totalTokens += estimatedTokens;

        const model = entry.model || 'default';
        const costs = TOKEN_COSTS[model] || TOKEN_COSTS.default;
        const callCost = estimatedTokens * costs.input;
        results.totalCost += callCost;

        // Detect duplicate payloads (same content hash)
        const payloadHash = simpleHash(JSON.stringify(entry.messages || entry.prompt || ''));
        if (seenPayloads.has(payloadHash)) {
            results.breakdown.duplicateReads.calls++;
            results.breakdown.duplicateReads.tokens += estimatedTokens;
            results.breakdown.duplicateReads.cost += callCost;
        }
        seenPayloads.set(payloadHash, (seenPayloads.get(payloadHash) || 0) + 1);

        // Detect error loops
        const errorSig = entry.error || entry.status === 'error' ? JSON.stringify(entry.error || '') : '';
        if (errorSig && errorSig === lastErrorSignature) {
            consecutiveErrors++;
            if (consecutiveErrors >= 3) {
                results.breakdown.infiniteLoops.calls++;
                results.breakdown.infiniteLoops.tokens += estimatedTokens;
                results.breakdown.infiniteLoops.cost += callCost;
            }
        } else {
            consecutiveErrors = errorSig ? 1 : 0;
            lastErrorSignature = errorSig;
        }

        // Detect overkill model usage for simple tasks
        const isSimpleTask = estimatedTokens < 500;
        const isFlagshipModel = ['claude-3-5-sonnet', 'gpt-4o', 'gpt-4'].some(m => (model || '').includes(m));
        if (isSimpleTask && isFlagshipModel) {
            results.breakdown.overkillModel.calls++;
            results.breakdown.overkillModel.tokens += estimatedTokens;
            const savingsIfMini = callCost - (estimatedTokens * TOKEN_COSTS['gpt-4o-mini'].input);
            results.breakdown.overkillModel.cost += savingsIfMini;
        }
    }
}

function analyzeTextLine(line, results) {
    // Detect common waste patterns in plain text logs
    if (line.includes('retrying') || line.includes('retry') || line.includes('attempt')) {
        results.breakdown.infiniteLoops.calls++;
        results.breakdown.infiniteLoops.cost += 0.15; // Estimated
    }
    if (line.includes('rate limit') || line.includes('429')) {
        results.breakdown.overkillModel.calls++;
        results.breakdown.overkillModel.cost += 0.10;
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

module.exports = { scanDirectory, findLogFiles };
