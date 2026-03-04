const fs = require('fs');
const path = require('path');
const os = require('os');

// Current Anthropic pricing per million tokens
const CLAUDE_PRICING = {
    'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
    'claude-sonnet-4-5': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
    'claude-haiku-4-5': { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
    'claude-3-5-haiku': { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
    'claude-opus-4': { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
    'default': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
};

function getClaudeDir() {
    // Allow override for testing via module.exports
    return module.exports._claudeDir || path.join(os.homedir(), '.claude');
}

function isAvailable() {
    const dir = getClaudeDir();
    return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'projects'));
}

function scan() {
    const claudeDir = getClaudeDir();
    const results = {
        source: 'Claude Code',
        sessions: 0,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        breakdown: {
            duplicateReads: { calls: 0, tokens: 0, cost: 0, description: 'Same file re-read by agent' },
            infiniteLoops: { calls: 0, tokens: 0, cost: 0, description: 'Stuck retrying same error' },
            overkillModel: { calls: 0, tokens: 0, cost: 0, description: 'Flagship model for simple tasks' },
            staleContext: { calls: 0, tokens: 0, cost: 0, description: 'Resending unchanged history' },
        },
        models: {},
        toolUses: {},
    };

    // Scan JSONL conversation logs
    const projectsDir = path.join(claudeDir, 'projects');
    if (fs.existsSync(projectsDir)) {
        const jsonlFiles = findJsonlFiles(projectsDir);
        for (const file of jsonlFiles) {
            try {
                parseConversationLog(file, results);
                results.sessions++;
            } catch (err) {
                // Skip unreadable files
            }
        }
    }

    // Scan debug logs for additional patterns
    const debugDir = path.join(claudeDir, 'debug');
    if (fs.existsSync(debugDir)) {
        const debugFiles = findDebugFiles(debugDir);
        for (const file of debugFiles) {
            try {
                parseDebugLog(file, results);
            } catch (err) {
                // Skip unreadable files
            }
        }
    }

    return results;
}

function findJsonlFiles(dir) {
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...findJsonlFiles(fullPath));
            } else if (entry.name.endsWith('.jsonl')) {
                files.push(fullPath);
            }
        }
    } catch (err) { /* permission denied */ }
    return files;
}

function findDebugFiles(dir) {
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.txt')) {
                files.push(path.join(dir, entry.name));
            }
        }
    } catch (err) { /* permission denied */ }
    return files;
}

function parseConversationLog(filePath, results) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const filesRead = new Map();     // file_path -> count
    let consecutiveErrors = 0;
    let lastErrorTool = '';

    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }

        // Only process assistant messages with usage data
        if (entry.type !== 'assistant' || !entry.message?.usage) continue;

        const usage = entry.message.usage;
        const model = entry.message.model || 'default';

        // Get pricing for this model
        const pricing = getPricing(model);

        // Calculate real token counts
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheCreation = usage.cache_creation_input_tokens || 0;
        const cacheRead = usage.cache_read_input_tokens || 0;
        const totalTokens = inputTokens + outputTokens + cacheCreation + cacheRead;

        // Calculate cost
        const cost =
            (inputTokens / 1_000_000) * pricing.input +
            (outputTokens / 1_000_000) * pricing.output +
            (cacheCreation / 1_000_000) * pricing.cacheWrite +
            (cacheRead / 1_000_000) * pricing.cacheRead;

        results.totalCalls++;
        results.totalTokens += totalTokens;
        results.totalCost += cost;

        // Track model usage
        if (!results.models[model]) results.models[model] = { calls: 0, tokens: 0, cost: 0 };
        results.models[model].calls++;
        results.models[model].tokens += totalTokens;
        results.models[model].cost += cost;

        // Analyze content for waste patterns
        const content = entry.message.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            // Track tool uses
            if (block.type === 'tool_use') {
                const toolName = block.name;
                if (!results.toolUses[toolName]) results.toolUses[toolName] = 0;
                results.toolUses[toolName]++;

                // Detect duplicate file reads
                if (toolName === 'Read' && block.input?.file_path) {
                    const fp = block.input.file_path;
                    const count = (filesRead.get(fp) || 0) + 1;
                    filesRead.set(fp, count);
                    if (count > 1) {
                        // This is a duplicate read
                        results.breakdown.duplicateReads.calls++;
                        results.breakdown.duplicateReads.tokens += totalTokens;
                        results.breakdown.duplicateReads.cost += cost;
                    }
                }

                // Reset error counter on successful tool use
                consecutiveErrors = 0;
                lastErrorTool = '';
            }
        }

        // Detect overkill model usage — flagship model for tiny total prompts
        // Total prompt = new input + cache writes + cache reads
        const totalPromptTokens = inputTokens + cacheCreation + cacheRead;
        const isFlagship = model.includes('sonnet') || model.includes('opus');
        const isSmallRequest = totalPromptTokens < 1000 && outputTokens < 200;
        if (isFlagship && isSmallRequest && totalPromptTokens > 0) {
            const haikuCost = (inputTokens / 1_000_000) * 0.80 + (outputTokens / 1_000_000) * 4.00 +
                (cacheCreation / 1_000_000) * 1.00 + (cacheRead / 1_000_000) * 0.08;
            const savings = cost - haikuCost;
            if (savings > 0) {
                results.breakdown.overkillModel.calls++;
                results.breakdown.overkillModel.tokens += totalTokens;
                results.breakdown.overkillModel.cost += savings;
            }
        }

        // Detect stale context — high cache reads mean resending unchanged history
        if (cacheRead > 10000 && cacheCreation < 500) {
            const wastedCacheCost = (cacheRead / 1_000_000) * pricing.cacheRead;
            results.breakdown.staleContext.calls++;
            results.breakdown.staleContext.tokens += cacheRead;
            results.breakdown.staleContext.cost += wastedCacheCost;
        }

        // Check for tool result errors (in user messages, but we track via assistant patterns)
        if (entry.type === 'user' && entry.toolUseResult && typeof entry.toolUseResult === 'string'
            && entry.toolUseResult.startsWith('Error')) {
            if (lastErrorTool === (entry.sourceToolAssistantUUID || '')) {
                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                    results.breakdown.infiniteLoops.calls++;
                    results.breakdown.infiniteLoops.tokens += 500; // Estimated
                    results.breakdown.infiniteLoops.cost += 0.15;
                }
            } else {
                consecutiveErrors = 1;
                lastErrorTool = entry.sourceToolAssistantUUID || '';
            }
        }
    }
}

function parseDebugLog(filePath, results) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let retryCount = 0;
    let lastErrorLine = '';

    for (const line of lines) {
        // Count rate limit errors
        if (line.includes('status=429') || line.includes('rate_limit')) {
            results.breakdown.infiniteLoops.calls++;
            results.breakdown.infiniteLoops.cost += 0.10;
        }

        // Count consecutive errors
        if (line.includes('[ERROR]')) {
            if (line === lastErrorLine) {
                retryCount++;
                if (retryCount >= 3) {
                    results.breakdown.infiniteLoops.calls++;
                    results.breakdown.infiniteLoops.cost += 0.05;
                }
            } else {
                retryCount = 1;
                lastErrorLine = line;
            }
        } else {
            retryCount = 0;
        }
    }
}

function getPricing(model) {
    // Try exact match first
    if (CLAUDE_PRICING[model]) return CLAUDE_PRICING[model];

    // Try partial match
    for (const [key, pricing] of Object.entries(CLAUDE_PRICING)) {
        if (model.includes(key) || key.includes(model)) return pricing;
    }

    // Check for model family
    if (model.includes('haiku')) return CLAUDE_PRICING['claude-haiku-4-5'];
    if (model.includes('opus')) return CLAUDE_PRICING['claude-opus-4'];
    if (model.includes('sonnet')) return CLAUDE_PRICING['claude-sonnet-4-6'];

    return CLAUDE_PRICING.default;
}

module.exports = { scan, isAvailable, getClaudeDir };
