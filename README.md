# Waste Scanner — Find Your AI Agent's Hidden Costs

Free CLI tool that scans your AI agent logs and shows you exactly how much money you're wasting.

## Quick Start

```bash
npx @jockeyvc/waste-scan --demo
```

## What It Finds

| Category | Description |
|---|---|
| 📄 **Duplicate Reads** | Same codebase re-read by the agent every message |
| 🔄 **Infinite Loops** | Agent stuck retrying the same failing action |
| 🧠 **Overkill Model** | Flagship model used for simple tasks |
| 📦 **Stale Context** | Unchanged conversation history resent |

## Usage

```bash
# Scan current directory
npx @jockeyvc/waste-scan

# Scan a specific directory
npx @jockeyvc/waste-scan ~/.claude/

# Run demo with sample data
npx @jockeyvc/waste-scan --demo
```

## Fix What It Finds

The [Agentic Firewall](https://jockeyvc.com) fixes everything the scanner detects — automatically.

```bash
npx @jockeyvc/agentic-firewall install
```

## License

MIT — Free forever.
