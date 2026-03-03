#!/usr/bin/env node

const { scanDirectory } = require('./scanner');
const { generateReport } = require('./report');
const path = require('path');

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🔍  WASTE SCANNER — Find Your AI Agent's Hidden Costs       ║
║                                                               ║
║   Free tool by JockeyVC • https://scan.jockeyvc.com           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);

  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');
  const targetDir = args.find(a => !a.startsWith('--')) || process.cwd();

  if (isDemo) {
    console.log('Running in DEMO mode with sample data...\n');
    const demoResults = getDemoData();
    generateReport(demoResults);
    return;
  }

  console.log(`Scanning: ${path.resolve(targetDir)}\n`);
  console.log('Looking for agent logs, API call records, and token usage...\n');

  const results = await scanDirectory(targetDir);

  if (results.totalCalls === 0) {
    console.log('No agent activity detected in this directory.');
    console.log('Try pointing the scanner at a directory with:');
    console.log('  • Claude Code logs (~/.claude/)');
    console.log('  • OpenClaw logs');
    console.log('  • Cursor logs');
    console.log('  • PM2 logs (~/.pm2/logs/)');
    console.log('\nOr run with --demo to see a sample report.');
    return;
  }

  generateReport(results);
}

function getDemoData() {
  return {
    totalCalls: 847,
    totalTokens: 12_450_000,
    totalCost: 142.38,
    wastedCost: 89.12,
    wastedPercent: 62.6,
    breakdown: {
      duplicateReads: { calls: 312, tokens: 6_240_000, cost: 52.40, description: 'Same file re-read by agent' },
      infiniteLoops: { calls: 48, tokens: 1_920_000, cost: 18.72, description: 'Stuck retrying same error' },
      overkillModel: { calls: 187, tokens: 2_805_000, cost: 12.00, description: 'Flagship model for simple tasks' },
      staleContext: { calls: 114, tokens: 1_485_000, cost: 6.00, description: 'Resending unchanged history' },
    },
    recommendations: [
      { action: 'Install Agentic Firewall', savings: '$52.40/week', reason: 'Auto-caches duplicate codebase reads' },
      { action: 'Enable Circuit Breaker', savings: '$18.72/week', reason: 'Kills infinite retry loops after 3 attempts' },
      { action: 'Enable Shadow Router', savings: '$12.00/week', reason: 'Routes simple tasks to cheaper models' },
    ],
    scanDate: new Date().toISOString(),
    period: 'Last 7 days',
  };
}

main().catch(err => {
  console.error('Scanner error:', err.message);
  process.exit(1);
});
