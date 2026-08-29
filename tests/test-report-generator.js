/**
 * Unit tests for ReportGenerator (HTML, Markdown, CSV)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadScript(relPath, sandbox) {
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  const code = fs.readFileSync(path.join(root, relPath), 'utf8') +
    `;if (typeof ReportGenerator !== 'undefined') globalThis.ReportGenerator = ReportGenerator;
     ;if (typeof HTMLReportGenerator !== 'undefined') globalThis.HTMLReportGenerator = HTMLReportGenerator;
     ;if (typeof MarkdownReportGenerator !== 'undefined') globalThis.MarkdownReportGenerator = MarkdownReportGenerator;
     ;if (typeof CSVReportGenerator !== 'undefined') globalThis.CSVReportGenerator = CSVReportGenerator;
     ;if (typeof module !== 'undefined' && module.exports) {
       Object.assign(globalThis, module.exports);
     }`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  Math, Date, Object, Array, String, Number, Boolean, Map, Set, JSON,
  require: (name) => {
    if (name === 'fs') return fs;
    if (name === 'path') return path;
    throw new Error(`Module not available: ${name}`);
  }
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript('src/renderer/js/systems/report-generator.js', sandbox);

const { ReportGenerator, HTMLReportGenerator, MarkdownReportGenerator, CSVReportGenerator } = sandbox;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// Mock benchmark result for testing
const mockResult = {
  version: '1.0.0',
  mode: 'llm_vs_opponent',
  seed: 4242,
  targetDays: 30,
  daysSimulated: 30,
  ticksExecuted: 360,
  durationMs: 45000,
  outcome: {
    winner: 'A',
    reason: 'composite_score',
    margin: 123.4,
    winnerName: 'Village A'
  },
  agents: [
    { slot: 'A', type: 'llm', name: 'gpt-4o-mini', model: 'gpt-4o-mini' },
    { slot: 'B', type: 'baseline', name: 'heuristic' }
  ],
  final: [
    {
      villageId: 'v1',
      villageName: 'Village A',
      agent: { slot: 'A', type: 'llm', name: 'gpt-4o-mini' },
      population: 20,
      structures: 5,
      strength: 100,
      resources: { food: 50, wood: 30 },
      resourceScore: 150,
      compositeScore: 400,
      agentStats: { calls: 50, failures: 2, totalLatencyMs: 10000, actionsApplied: 100 }
    },
    {
      villageId: 'v2',
      villageName: 'Village B',
      agent: { slot: 'B', type: 'baseline', name: 'heuristic' },
      population: 15,
      structures: 3,
      strength: 75,
      resources: { food: 30, wood: 20 },
      resourceScore: 100,
      compositeScore: 276.6,
      agentStats: {}
    }
  ],
  dailySnapshots: [
    {
      day: 1,
      villages: [
        { villageId: 'v1', name: 'Village A', slot: 'A', population: 5, resourceScore: 20, compositeScore: 50 },
        { villageId: 'v2', name: 'Village B', slot: 'B', population: 5, resourceScore: 20, compositeScore: 50 }
      ]
    },
    {
      day: 30,
      villages: [
        { villageId: 'v1', name: 'Village A', slot: 'A', population: 20, resourceScore: 150, compositeScore: 400 },
        { villageId: 'v2', name: 'Village B', slot: 'B', population: 15, resourceScore: 100, compositeScore: 276.6 }
      ]
    }
  ],
  benchmarkEvents: [
    { day: 10, type: 'raid', data: { attacker: 'v1', defender: 'v2' } }
  ]
};

console.log('\nReportGenerator');

test('formatDuration handles various durations', () => {
  assert.strictEqual(ReportGenerator.formatDuration(5000), '5s');
  assert.strictEqual(ReportGenerator.formatDuration(90000), '1m 30s');
  const result = ReportGenerator.formatDuration(3700000);
  assert.ok(result.includes('1h') && result.includes('1m'));
});

test('formatDuration returns N/A for invalid input', () => {
  assert.strictEqual(ReportGenerator.formatDuration(null), 'N/A');
  assert.strictEqual(ReportGenerator.formatDuration(-100), 'N/A');
});

test('formatTimestamp returns ISO-like format', () => {
  const ts = ReportGenerator.formatTimestamp(Date.now());
  assert.ok(ts.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/));
});

test('generate delegates to correct generator', () => {
  const html = ReportGenerator.generate(mockResult, 'html', {});
  assert.ok(html.includes('<!DOCTYPE html>'));
  
  const md = ReportGenerator.generate(mockResult, 'markdown', {});
  assert.ok(md.includes('# '));
  
  const csv = ReportGenerator.generate(mockResult, 'csv', {});
  assert.ok(typeof csv === 'string' || typeof csv === 'object');
  
  const json = ReportGenerator.generate(mockResult, 'json', {});
  assert.ok(json.includes('"seed"'));
});

test('generate throws for unsupported format', () => {
  let thrown = false;
  try {
    ReportGenerator.generate(mockResult, 'invalid', {});
  } catch (err) {
    thrown = true;
    assert.ok(err.message.includes('Unsupported format'));
  }
  assert.ok(thrown);
});

console.log('\nHTMLReportGenerator');

test('generate returns valid HTML', () => {
  const html = HTMLReportGenerator.generate(mockResult);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('<html'));
  assert.ok(html.includes('</html>'));
});

test('generate includes title', () => {
  const html = HTMLReportGenerator.generate(mockResult, { title: 'Custom Title' });
  assert.ok(html.includes('Custom Title'));
});

test('generate includes summary section', () => {
  const html = HTMLReportGenerator.generate(mockResult);
  assert.ok(html.includes('Summary'));
  assert.ok(html.includes('4242')); // seed
  assert.ok(html.includes('30')); // days
});

test('generate includes outcome section', () => {
  const html = HTMLReportGenerator.generate(mockResult);
  assert.ok(html.includes('Outcome'));
  assert.ok(html.includes('Village A')); // winner name
  assert.ok(html.includes('123.4')); // margin
});

test('generate includes agents section', () => {
  const html = HTMLReportGenerator.generate(mockResult);
  assert.ok(html.includes('Agents'));
  assert.ok(html.includes('gpt-4o-mini'));
  assert.ok(html.includes('heuristic'));
});

test('generate includes charts when enabled', () => {
  const html = HTMLReportGenerator.generate(mockResult, { includeCharts: true });
  assert.ok(html.includes('chart.js'));
  assert.ok(html.includes('canvas'));
  assert.ok(html.includes('scoreChart'));
});

test('generate excludes charts when disabled', () => {
  const html = HTMLReportGenerator.generate(mockResult, { includeCharts: false });
  assert.ok(!html.includes('chart.js'));
});

console.log('\nMarkdownReportGenerator');

test('generate returns valid markdown', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('# '));
  assert.ok(md.includes('## '));
  assert.ok(md.includes('| '));
});

test('generate includes summary table', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Summary'));
  assert.ok(md.includes('| Seed'));
  assert.ok(md.includes('| 4242'));
});

test('generate includes outcome', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Outcome'));
  assert.ok(md.includes('**Winner:**'));
  assert.ok(md.includes('Village A'));
});

test('generate includes agents section', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Agents'));
  assert.ok(md.includes('### Agent A'));
  assert.ok(md.includes('gpt-4o-mini'));
});

test('generate includes final state table', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Final State Comparison'));
  assert.ok(md.includes('| Village A'));
  assert.ok(md.includes('| 20 |')); // population
});

test('generate includes daily progress', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Daily Progress'));
  assert.ok(md.includes('| Day |'));
});

test('generate includes events', () => {
  const md = MarkdownReportGenerator.generate(mockResult);
  assert.ok(md.includes('## Key Events'));
  assert.ok(md.includes('Day 10'));
  assert.ok(md.includes('raid'));
});

console.log('\nCSVReportGenerator');

test('generateDailyCSV includes headers', () => {
  const csv = CSVReportGenerator.generateDailyCSV(mockResult);
  assert.ok(csv.includes('day'));
  assert.ok(csv.includes('Village A_population'));
  assert.ok(csv.includes('Village B_compositeScore'));
});

test('generateDailyCSV includes data rows', () => {
  const csv = CSVReportGenerator.generateDailyCSV(mockResult);
  const lines = csv.split('\n');
  assert.ok(lines.length > 2); // Header + at least 1 data row
  assert.ok(lines[1].includes('1')); // Day 1
  assert.ok(lines[1].includes('5')); // Population
});

test('generateFinalCSV includes headers', () => {
  const csv = CSVReportGenerator.generateFinalCSV(mockResult);
  assert.ok(csv.includes('village,agent_type'));
  assert.ok(csv.includes('population,structures'));
  assert.ok(csv.includes('api_calls,failures'));
});

test('generateFinalCSV includes village data', () => {
  const csv = CSVReportGenerator.generateFinalCSV(mockResult);
  assert.ok(csv.includes('Village A'));
  assert.ok(csv.includes('llm'));
  assert.ok(csv.includes('20')); // population
  assert.ok(csv.includes('50')); // API calls
});

test('generateEventsCSV includes events', () => {
  const csv = CSVReportGenerator.generateEventsCSV(mockResult);
  assert.ok(csv.includes('day,type,data'));
  assert.ok(csv.includes('10,raid'));
});

test('generate with all format returns object', () => {
  const result = CSVReportGenerator.generate(mockResult, { format: 'all' });
  assert.ok(typeof result === 'object');
  assert.ok(result.daily);
  assert.ok(result.final);
  assert.ok(result.events);
});

test('generateDailyCSV handles empty snapshots', () => {
  const emptyResult = { dailySnapshots: [] };
  const csv = CSVReportGenerator.generateDailyCSV(emptyResult);
  assert.ok(csv.includes('No daily snapshot data'));
});

test('generateFinalCSV handles empty final state', () => {
  const emptyResult = { final: [] };
  const csv = CSVReportGenerator.generateFinalCSV(emptyResult);
  assert.ok(csv.includes('No final state data'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
