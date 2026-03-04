const claude = require('./claude');
const cursor = require('./cursor');
const pm2 = require('./pm2');

const ALL_PARSERS = [
    { name: 'Claude Code', module: claude },
    { name: 'Cursor', module: cursor },
    { name: 'PM2', module: pm2 },
];

/**
 * Discover which log sources are available on this machine.
 * Returns array of { name, module } for each available source.
 */
function discoverSources() {
    return ALL_PARSERS.filter(p => p.module.isAvailable());
}

/**
 * Scan all available log sources and merge results into a unified report.
 */
function scanAllSources() {
    const sources = discoverSources();
    const perSource = [];

    const merged = {
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
        period: 'All time',
        sources: [],
    };

    for (const { name, module: parser } of sources) {
        try {
            const result = parser.scan();
            perSource.push({ name, ...result });

            // Merge totals
            merged.totalCalls += result.totalCalls;
            merged.totalTokens += result.totalTokens;
            merged.totalCost += result.totalCost;

            // Merge breakdown
            for (const [key, data] of Object.entries(result.breakdown)) {
                if (merged.breakdown[key]) {
                    merged.breakdown[key].calls += data.calls;
                    merged.breakdown[key].tokens += data.tokens;
                    merged.breakdown[key].cost += data.cost;
                }
            }

            // Track source info
            merged.sources.push({
                name,
                calls: result.totalCalls,
                tokens: result.totalTokens,
                cost: result.totalCost,
                sessions: result.sessions || 0,
            });
        } catch (err) {
            // Skip failing parsers
        }
    }

    // Calculate waste
    merged.wastedCost =
        merged.breakdown.duplicateReads.cost +
        merged.breakdown.infiniteLoops.cost +
        merged.breakdown.overkillModel.cost +
        merged.breakdown.staleContext.cost;

    if (merged.totalCost > 0) {
        merged.wastedPercent = Math.round((merged.wastedCost / merged.totalCost) * 1000) / 10;
    }

    // Generate recommendations
    if (merged.breakdown.duplicateReads.cost > 0) {
        merged.recommendations.push({
            action: 'Install Agentic Firewall',
            savings: `$${merged.breakdown.duplicateReads.cost.toFixed(2)}/week`,
            reason: 'Auto-caches duplicate codebase reads',
        });
    }
    if (merged.breakdown.infiniteLoops.cost > 0) {
        merged.recommendations.push({
            action: 'Enable Circuit Breaker',
            savings: `$${merged.breakdown.infiniteLoops.cost.toFixed(2)}/week`,
            reason: 'Kills infinite retry loops after 3 attempts',
        });
    }
    if (merged.breakdown.overkillModel.cost > 0) {
        merged.recommendations.push({
            action: 'Enable Shadow Router',
            savings: `$${merged.breakdown.overkillModel.cost.toFixed(2)}/week`,
            reason: 'Routes simple tasks to cheaper models',
        });
    }
    if (merged.breakdown.staleContext.cost > 0) {
        merged.recommendations.push({
            action: 'Enable Context CDN',
            savings: `$${merged.breakdown.staleContext.cost.toFixed(2)}/week`,
            reason: 'Caches unchanged conversation history',
        });
    }

    return merged;
}

module.exports = { discoverSources, scanAllSources, ALL_PARSERS };
