function generateReport(results) {
    const { totalCalls, totalTokens, totalCost, wastedCost, wastedPercent, breakdown, recommendations, period } = results;

    console.log('━'.repeat(60));
    console.log('');
    console.log('  📊  YOUR AI AGENT GRIEF REPORT');
    console.log(`  Period: ${period}`);
    console.log('');
    console.log('━'.repeat(60));
    console.log('');

    // Headline numbers
    console.log(`  Total API Calls:     ${totalCalls.toLocaleString()}`);
    console.log(`  Total Tokens:        ${(totalTokens / 1_000_000).toFixed(1)}M`);
    console.log(`  Total Spend:         $${totalCost.toFixed(2)}`);
    console.log('');

    // The punchline
    const wastedBar = '█'.repeat(Math.round(wastedPercent / 5)) + '░'.repeat(20 - Math.round(wastedPercent / 5));
    console.log(`  💸 WASTED:           $${wastedCost.toFixed(2)} (${wastedPercent}%)`);
    console.log(`     [${wastedBar}]`);
    console.log('');

    // Breakdown
    console.log('─'.repeat(60));
    console.log('  WASTE BREAKDOWN');
    console.log('─'.repeat(60));
    console.log('');

    const categories = Object.entries(breakdown).sort((a, b) => b[1].cost - a[1].cost);
    for (const [key, data] of categories) {
        if (data.cost === 0) continue;
        const icon = getIcon(key);
        const name = formatKey(key);
        console.log(`  ${icon}  ${name}`);
        console.log(`     ${data.calls} calls • ${(data.tokens / 1_000).toFixed(0)}K tokens • $${data.cost.toFixed(2)} wasted`);
        console.log(`     ↳ ${data.description}`);
        console.log('');
    }

    // Recommendations
    if (recommendations.length > 0) {
        console.log('─'.repeat(60));
        console.log('  💡 RECOMMENDATIONS');
        console.log('─'.repeat(60));
        console.log('');

        for (const rec of recommendations) {
            console.log(`  ✅ ${rec.action}`);
            console.log(`     Save ${rec.savings} — ${rec.reason}`);
            console.log('');
        }
    }

    // CTA
    console.log('━'.repeat(60));
    console.log('');
    console.log('  🛡️  Fix this in 60 seconds:');
    console.log('');
    console.log('  npx @jockeyvc/agentic-firewall install');
    console.log('');
    console.log('  → One-line proxy that kills loops, caches reads,');
    console.log('    and routes simple tasks to cheaper models.');
    console.log('');
    console.log('  Learn more: https://jockeyvc.com');
    console.log('');
    console.log('━'.repeat(60));
}

function getIcon(key) {
    const icons = {
        duplicateReads: '📄',
        infiniteLoops: '🔄',
        overkillModel: '🧠',
        staleContext: '📦',
    };
    return icons[key] || '📊';
}

function formatKey(key) {
    const names = {
        duplicateReads: 'Duplicate Codebase Reads',
        infiniteLoops: 'Infinite Retry Loops',
        overkillModel: 'Overkill Model Selection',
        staleContext: 'Stale Context Re-sends',
    };
    return names[key] || key;
}

module.exports = { generateReport };
