#!/usr/bin/env node

const { scanAll, scanDirectory, discoverSources } = require('./scanner');
const { generateReport } = require('./report');
const path = require('path');

const BANNER = `
\x1b[91m╔═══════════════════════════════════════════════════════════════╗\x1b[0m
\x1b[91m║\x1b[0m                                                               \x1b[91m║\x1b[0m
\x1b[91m║\x1b[0m   🔍  \x1b[1m\x1b[97mWASTE SCANNER\x1b[0m — Find Your AI Agent's Hidden Costs       \x1b[91m║\x1b[0m
\x1b[91m║\x1b[0m                                                               \x1b[91m║\x1b[0m
\x1b[91m║\x1b[0m   \x1b[90mFree tool by JockeyVC • https://scan.jockeyvc.com\x1b[0m           \x1b[91m║\x1b[0m
\x1b[91m║\x1b[0m                                                               \x1b[91m║\x1b[0m
\x1b[91m╚═══════════════════════════════════════════════════════════════╝\x1b[0m
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const isDemo = args.includes('--demo');
  const isJson = args.includes('--json');
  const showSources = args.includes('--sources');
  const targetDir = args.find(a => !a.startsWith('--'));

  if (!isJson) {
    console.log(BANNER);
  }

  if (isDemo) {
    if (!isJson) console.log('  \x1b[93m▸\x1b[0m Running in \x1b[1mDEMO\x1b[0m mode with sample data...\n');
    const demoResults = getDemoData();
    if (isJson) {
      console.log(JSON.stringify(demoResults, null, 2));
    } else {
      generateReport(demoResults);
    }
    return;
  }

  // Show spinner
  if (!isJson) {
    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r  ${spinner[i++ % spinner.length]} \x1b[90mScanning for agent logs...\x1b[0m`);
    }, 80);

    try {
      let results;

      if (targetDir) {
        // Scan specific directory
        process.stdout.write(`\r  ${spinner[0]} \x1b[90mScanning ${path.resolve(targetDir)}...\x1b[0m`);
        results = await scanDirectory(targetDir);
      } else {
        // Auto-discover all sources
        const sources = discoverSources();
        if (showSources) {
          clearInterval(interval);
          process.stdout.write('\r');
          console.log('  \x1b[1m\x1b[97mDetected log sources:\x1b[0m\n');
          if (sources.length === 0) {
            console.log('  \x1b[90m  No log sources found.\x1b[0m');
          } else {
            for (const s of sources) {
              console.log(`  \x1b[92m  ✓\x1b[0m ${s.name}`);
            }
          }
          console.log('');
          return;
        }
        results = await scanAll();
      }

      clearInterval(interval);
      process.stdout.write('\r\x1b[K'); // Clear spinner line

      if (results.totalCalls === 0) {
        printNoData();
        return;
      }

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        generateReport(results);
      }
    } catch (err) {
      clearInterval(interval);
      process.stdout.write('\r\x1b[K');
      throw err;
    }
  } else {
    // JSON mode, no spinner
    let results;
    if (targetDir) {
      results = await scanDirectory(targetDir);
    } else {
      results = await scanAll();
    }
    console.log(JSON.stringify(results, null, 2));
  }
}

function printNoData() {
  console.log('  \x1b[93m⚠\x1b[0m  No agent activity detected.\n');
  console.log('  \x1b[90mTry pointing the scanner at a directory with:\x1b[0m\n');
  console.log('  \x1b[97m  •\x1b[0m Claude Code logs   \x1b[90m~/.claude/\x1b[0m');
  console.log('  \x1b[97m  •\x1b[0m Cursor logs        \x1b[90m~/Library/Application Support/Cursor/logs/\x1b[0m');
  console.log('  \x1b[97m  •\x1b[0m PM2 logs           \x1b[90m~/.pm2/logs/\x1b[0m');
  console.log('');
  console.log('  \x1b[90mOr run with --demo to see a sample report.\x1b[0m');
  console.log('');
}

function printHelp() {
  console.log(BANNER);
  console.log('  \x1b[1m\x1b[97mUSAGE\x1b[0m\n');
  console.log('    \x1b[92m$\x1b[0m waste-scan              \x1b[90m# Auto-discover all log sources\x1b[0m');
  console.log('    \x1b[92m$\x1b[0m waste-scan ~/.claude/   \x1b[90m# Scan a specific directory\x1b[0m');
  console.log('    \x1b[92m$\x1b[0m waste-scan --demo       \x1b[90m# Run with sample data\x1b[0m');
  console.log('');
  console.log('  \x1b[1m\x1b[97mFLAGS\x1b[0m\n');
  console.log('    --demo       Run with sample data');
  console.log('    --json       Output raw JSON (for piping)');
  console.log('    --sources    Show detected log sources');
  console.log('    --help, -h   Show this help');
  console.log('');
  console.log('  \x1b[1m\x1b[97mLOG SOURCES\x1b[0m\n');
  console.log('    Claude Code  \x1b[90m~/.claude/ (JSONL conversations + debug logs)\x1b[0m');
  console.log('    Cursor       \x1b[90m~/Library/Application Support/Cursor/logs/\x1b[0m');
  console.log('    PM2          \x1b[90m~/.pm2/logs/\x1b[0m');
  console.log('');
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
    period: 'Last 7 days (demo)',
    sources: [
      { name: 'Claude Code', calls: 623, tokens: 9_345_000, cost: 108.50, sessions: 12 },
      { name: 'Cursor', calls: 187, tokens: 2_805_000, cost: 28.10, sessions: 5 },
      { name: 'PM2', calls: 37, tokens: 300_000, cost: 5.78, sessions: 3 },
    ],
  };
}

main().catch(err => {
  console.error(`\n  \x1b[91m✗\x1b[0m Scanner error: ${err.message}`);
  process.exit(1);
});
