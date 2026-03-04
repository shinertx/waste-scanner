#!/usr/bin/env node

/**
 * Waste Scanner — Test Suite
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \x1b[92m✓\x1b[0m ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \x1b[91m✗\x1b[0m ${name}`);
        console.log(`    \x1b[90m${err.message}\x1b[0m`);
        failed++;
    }
}

console.log('\n  \x1b[1mWaste Scanner Tests\x1b[0m\n');

// ─── Parser Module Tests ────────────────────────

test('parsers/index exports discoverSources and scanAllSources', () => {
    const parsers = require('../src/parsers');
    assert.strictEqual(typeof parsers.discoverSources, 'function');
    assert.strictEqual(typeof parsers.scanAllSources, 'function');
    assert.ok(Array.isArray(parsers.ALL_PARSERS));
    assert.strictEqual(parsers.ALL_PARSERS.length, 3);
});

test('each parser has scan() and isAvailable()', () => {
    const claude = require('../src/parsers/claude');
    const cursor = require('../src/parsers/cursor');
    const pm2 = require('../src/parsers/pm2');

    for (const parser of [claude, cursor, pm2]) {
        assert.strictEqual(typeof parser.scan, 'function');
        assert.strictEqual(typeof parser.isAvailable, 'function');
    }
});

test('claude parser isAvailable returns boolean', () => {
    const claude = require('../src/parsers/claude');
    assert.strictEqual(typeof claude.isAvailable(), 'boolean');
});

test('cursor parser isAvailable returns boolean', () => {
    const cursor = require('../src/parsers/cursor');
    assert.strictEqual(typeof cursor.isAvailable(), 'boolean');
});

test('pm2 parser isAvailable returns boolean', () => {
    const pm2 = require('../src/parsers/pm2');
    assert.strictEqual(typeof pm2.isAvailable(), 'boolean');
});

// ─── Claude JSONL Parser Tests ──────────────────

test('claude parser handles mock JSONL data', () => {
    // Create a temp JSONL file to parse
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waste-scanner-test-'));
    const projectDir = path.join(tmpDir, 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    const lines = [
        JSON.stringify({
            type: 'assistant',
            message: {
                model: 'claude-sonnet-4-6',
                role: 'assistant',
                content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/foo/bar.js' } }],
                usage: { input_tokens: 5000, output_tokens: 200, cache_creation_input_tokens: 1000, cache_read_input_tokens: 3000 },
            },
            timestamp: '2026-03-01T00:00:00Z',
        }),
        JSON.stringify({
            type: 'assistant',
            message: {
                model: 'claude-sonnet-4-6',
                role: 'assistant',
                content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/foo/bar.js' } }],
                usage: { input_tokens: 5000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000 },
            },
            timestamp: '2026-03-01T00:01:00Z',
        }),
    ].join('\n');

    fs.writeFileSync(path.join(projectDir, 'test-session.jsonl'), lines);

    // Override internal dir via module export
    const claude = require('../src/parsers/claude');
    const original = claude._claudeDir;
    claude._claudeDir = tmpDir;

    try {
        const result = claude.scan();
        assert.strictEqual(result.source, 'Claude Code');
        assert.strictEqual(result.totalCalls, 2);
        assert.ok(result.totalTokens > 0, 'should have non-zero tokens');
        assert.ok(result.totalCost > 0, 'should have non-zero cost');
        assert.ok(result.breakdown.duplicateReads.calls >= 1, 'should detect duplicate read');
    } finally {
        claude._claudeDir = original;
        fs.rmSync(tmpDir, { recursive: true });
    }
});

// ─── Scanner Tests ──────────────────────────────

test('scanner exports scanAll and scanDirectory', () => {
    const scanner = require('../src/scanner');
    assert.strictEqual(typeof scanner.scanAll, 'function');
    assert.strictEqual(typeof scanner.scanDirectory, 'function');
});

test('scanDirectory returns proper results shape', async () => {
    const scanner = require('../src/scanner');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waste-scanner-empty-'));

    try {
        const results = await scanner.scanDirectory(tmpDir);
        assert.strictEqual(typeof results.totalCalls, 'number');
        assert.strictEqual(typeof results.totalTokens, 'number');
        assert.strictEqual(typeof results.totalCost, 'number');
        assert.ok(results.breakdown.duplicateReads !== undefined);
        assert.ok(results.breakdown.infiniteLoops !== undefined);
        assert.ok(results.breakdown.overkillModel !== undefined);
        assert.ok(results.breakdown.staleContext !== undefined);
        assert.ok(Array.isArray(results.recommendations));
    } finally {
        fs.rmSync(tmpDir, { recursive: true });
    }
});

// ─── Report Tests ───────────────────────────────

test('report generates without errors', () => {
    const { generateReport } = require('../src/report');
    const log = console.log;
    const output = [];
    console.log = (...args) => output.push(args.join(' '));

    try {
        generateReport({
            totalCalls: 100,
            totalTokens: 1_000_000,
            totalCost: 10.50,
            wastedCost: 5.25,
            wastedPercent: 50,
            breakdown: {
                duplicateReads: { calls: 50, tokens: 500_000, cost: 3.00, description: 'test' },
                infiniteLoops: { calls: 10, tokens: 100_000, cost: 1.25, description: 'test' },
                overkillModel: { calls: 5, tokens: 50_000, cost: 0.75, description: 'test' },
                staleContext: { calls: 3, tokens: 30_000, cost: 0.25, description: 'test' },
            },
            recommendations: [
                { action: 'Test Action', savings: '$3.00/week', reason: 'test reason' },
            ],
            period: 'Test period',
            sources: [
                { name: 'Claude Code', calls: 80, tokens: 800_000, cost: 8.40, sessions: 3 },
            ],
        });

        assert.ok(output.length > 10, `should produce output lines, got ${output.length}`);
        const fullOutput = output.join('\n');
        assert.ok(fullOutput.includes('GRIEF REPORT'), 'should include GRIEF REPORT');
        assert.ok(fullOutput.includes('WASTE BREAKDOWN'), 'should include WASTE BREAKDOWN');
        assert.ok(fullOutput.includes('RECOMMENDATIONS'), 'should include RECOMMENDATIONS');
    } finally {
        console.log = log;
    }
});

test('report handles zero-waste data', () => {
    const { generateReport } = require('../src/report');
    const log = console.log;
    console.log = () => { };

    try {
        // Should not throw
        generateReport({
            totalCalls: 10,
            totalTokens: 10_000,
            totalCost: 0.50,
            wastedCost: 0,
            wastedPercent: 0,
            breakdown: {
                duplicateReads: { calls: 0, tokens: 0, cost: 0, description: 'test' },
                infiniteLoops: { calls: 0, tokens: 0, cost: 0, description: 'test' },
                overkillModel: { calls: 0, tokens: 0, cost: 0, description: 'test' },
                staleContext: { calls: 0, tokens: 0, cost: 0, description: 'test' },
            },
            recommendations: [],
            period: 'Test',
            sources: [],
        });
    } finally {
        console.log = log;
    }
});

// ─── Summary ────────────────────────────────────
console.log('');
console.log(`  \x1b[1m${passed} passed\x1b[0m, ${failed > 0 ? `\x1b[91m${failed} failed\x1b[0m` : `\x1b[92m${failed} failed\x1b[0m`}`);
console.log('');

if (failed > 0) process.exit(1);
