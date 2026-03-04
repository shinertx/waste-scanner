# Waste Scanner — Find Your AI Agent's Hidden Costs

Free CLI tool that scans your AI agent logs and shows you exactly how much money you're wasting on duplicate reads, infinite loops, and overkill models.

## Quick Start

```bash
npx @jockeyvc/waste-scan
```

That's it. No config needed. The scanner auto-discovers your logs.

## What It Scans

| Source | Location | What It Finds |
|---|---|---|
| **Claude Code** | `~/.claude/` | Token usage, duplicate file reads, error loops, overkill model usage |
| **Cursor** | `~/Library/Application Support/Cursor/logs/` | Extension errors, MCP activity, retry patterns |
| **PM2** | `~/.pm2/logs/` | API call patterns, crash-restart loops, rate limits |

## What It Finds

| Category | Description |
|---|---|
| 📄 **Duplicate Reads** | Same codebase re-read by the agent every message |
| 🔄 **Infinite Loops** | Agent stuck retrying the same failing action |
| 🧠 **Overkill Model** | Flagship model used for simple tasks |
| 📦 **Stale Context** | Unchanged conversation history resent |

## Usage

```bash
# Auto-discover all log sources
npx @jockeyvc/waste-scan

# Scan a specific directory
npx @jockeyvc/waste-scan ~/.claude/

# Run demo with sample data
npx @jockeyvc/waste-scan --demo

# Output as JSON (for piping)
npx @jockeyvc/waste-scan --json

# Show detected log sources
npx @jockeyvc/waste-scan --sources
```

## Example Output

```
  ══════════════════════════════════════════════════════════════
         📊  YOUR AI AGENT GRIEF REPORT
                 All time

  ══════════════════════════════════════════════════════════════

    Total API Calls          847
    Total Tokens             12.5M tokens
    Total Spend              $142.38

    💸 WASTED:  $89.12  (62.6%)
     [██████████████████░░░░░░░░░░░░]

  ──────────────────────────────────────────────────────────────
    WASTE BREAKDOWN
  ──────────────────────────────────────────────────────────────

    📄  Duplicate Codebase Reads
       312 calls  •  6.2M tokens  •  $52.40 wasted
       ↳ Same file re-read by agent

    🔄  Infinite Retry Loops
       48 calls  •  1.9M tokens  •  $18.72 wasted
       ↳ Stuck retrying same error

  ──────────────────────────────────────────────────────────────
    💡 RECOMMENDATIONS
  ──────────────────────────────────────────────────────────────

    ✓  Install Agentic Firewall
       Save $52.40/week — Auto-caches duplicate codebase reads
```

## Fix What It Finds

The [Agentic Firewall](https://jockeyvc.com) fixes everything the scanner detects — automatically.

```bash
npx @jockeyvc/agentic-firewall install
```

## License

MIT — Free forever.
