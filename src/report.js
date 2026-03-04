// ANSI color helpers (zero dependencies)
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[91m',
    green: '\x1b[92m',
    yellow: '\x1b[93m',
    blue: '\x1b[94m',
    magenta: '\x1b[95m',
    cyan: '\x1b[96m',
    white: '\x1b[97m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
};

const W = 62; // Report width

function generateReport(results) {
    const { totalCalls, totalTokens, totalCost, wastedCost, wastedPercent, breakdown, recommendations, period, sources } = results;

    // ─── Header ──────────────────────────────────
    console.log('');
    printBar('═', c.red);
    printCentered('');
    printCentered(`${c.bold}${c.white}📊  YOUR AI AGENT GRIEF REPORT${c.reset}`);
    printCentered(`${c.gray}${period}${c.reset}`);
    printCentered('');
    printBar('═', c.red);
    console.log('');

    // ─── Headline Numbers ────────────────────────
    printStat('Total API Calls', formatNum(totalCalls), c.white);
    printStat('Total Tokens', formatTokens(totalTokens), c.white);
    printStat('Total Spend', `${c.bold}$${totalCost.toFixed(2)}${c.reset}`, c.white);
    console.log('');

    // ─── The Punchline ───────────────────────────
    const barLen = 30;
    const filled = Math.min(barLen, Math.max(0, Math.round((Math.min(wastedPercent, 100) / 100) * barLen)));
    const bar = `${c.red}${'█'.repeat(filled)}${c.gray}${'░'.repeat(barLen - filled)}${c.reset}`;

    console.log(`  ${c.red}${c.bold}  💸 WASTED:  $${wastedCost.toFixed(2)}  (${wastedPercent}%)${c.reset}`);
    console.log(`     [${bar}]`);
    console.log('');

    // ─── Waste Breakdown ─────────────────────────
    printBar('─', c.gray);
    console.log(`  ${c.bold}${c.white}  WASTE BREAKDOWN${c.reset}`);
    printBar('─', c.gray);
    console.log('');

    const categories = Object.entries(breakdown).sort((a, b) => b[1].cost - a[1].cost);
    for (const [key, data] of categories) {
        if (data.cost <= 0) continue;
        const icon = getIcon(key);
        const name = formatKey(key);
        const severity = getSeverityColor(data.cost, wastedCost);

        console.log(`  ${severity}  ${icon}  ${c.bold}${name}${c.reset}`);
        console.log(`  ${c.gray}     ${formatNum(data.calls)} calls  •  ${formatTokens(data.tokens)}  •  ${c.red}$${data.cost.toFixed(2)} wasted${c.reset}`);
        console.log(`  ${c.gray}     ↳ ${data.description}${c.reset}`);
        console.log('');
    }

    // ─── Source Breakdown ────────────────────────
    if (sources && sources.length > 0) {
        printBar('─', c.gray);
        console.log(`  ${c.bold}${c.white}  📡 LOG SOURCES${c.reset}`);
        printBar('─', c.gray);
        console.log('');

        for (const src of sources) {
            const pct = totalCost > 0 ? Math.round((src.cost / totalCost) * 100) : 0;
            const filledPct = Math.min(20, Math.max(1, Math.round(pct / 5)));
            const miniBar = '█'.repeat(filledPct) + '░'.repeat(20 - filledPct);
            console.log(`  ${c.cyan}  ${src.name.padEnd(14)}${c.reset} ${c.gray}${miniBar}${c.reset}  ${c.white}${formatNum(src.calls)} calls${c.reset}  ${c.gray}•${c.reset}  ${c.white}$${src.cost.toFixed(2)}${c.reset}  ${c.gray}(${pct}%)${c.reset}`);
        }
        console.log('');
    }

    // ─── Recommendations ─────────────────────────
    if (recommendations.length > 0) {
        printBar('─', c.gray);
        console.log(`  ${c.bold}${c.white}  💡 RECOMMENDATIONS${c.reset}`);
        printBar('─', c.gray);
        console.log('');

        for (const rec of recommendations) {
            console.log(`  ${c.green}  ✓  ${c.bold}${c.white}${rec.action}${c.reset}`);
            console.log(`  ${c.gray}     Save ${c.green}${c.bold}${rec.savings}${c.reset}${c.gray} — ${rec.reason}${c.reset}`);
            console.log('');
        }
    }

    // ─── CTA ─────────────────────────────────────
    printBar('═', c.red);
    console.log('');
    console.log(`  ${c.bold}${c.white}  🛡️  Fix this in 60 seconds:${c.reset}`);
    console.log('');
    console.log(`  ${c.green}  $${c.reset} ${c.bold}npx @jockeyvc/agentic-firewall install${c.reset}`);
    console.log('');
    console.log(`  ${c.gray}  → One-line proxy that kills loops, caches reads,${c.reset}`);
    console.log(`  ${c.gray}    and routes simple tasks to cheaper models.${c.reset}`);
    console.log('');
    console.log(`  ${c.cyan}  Learn more: ${c.bold}https://jockeyvc.com${c.reset}`);
    console.log('');
    printBar('═', c.red);
    console.log('');
}

// ─── Helpers ─────────────────────────────────

function printBar(char, color) {
    console.log(`  ${color}${char.repeat(W)}${c.reset}`);
}

function printCentered(text) {
    // Strip ANSI codes for length calculation
    const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, Math.floor((W - plain.length) / 2));
    console.log(`  ${' '.repeat(pad)}${text}`);
}

function printStat(label, value, color) {
    console.log(`  ${c.gray}  ${label.padEnd(20)}${c.reset} ${color}${value}${c.reset}`);
}

function formatNum(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function formatTokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tokens`;
    return `${n} tokens`;
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

function getSeverityColor(cost, total) {
    if (total === 0) return c.gray;
    const pct = cost / total;
    if (pct > 0.4) return c.red;
    if (pct > 0.15) return c.yellow;
    return c.green;
}

module.exports = { generateReport };
