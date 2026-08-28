#!/usr/bin/env node
/**
 * Example: Generate reports from existing benchmark JSON
 * 
 * Usage:
 *   node scripts/generate-report.js benchmark-report.json html --charts
 *   node scripts/generate-report.js benchmark-report.json markdown
 *   node scripts/generate-report.js benchmark-report.json csv --output data/
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadReportingModules() {
  const sandbox = {
    console,
    module: { exports: {} },
    exports: {},
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
    Set,
    JSON,
    require: (name) => {
      if (name === 'fs') return fs;
      if (name === 'path') return path;
      throw new Error(`Module not available: ${name}`);
    }
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const scripts = [
    'src/renderer/js/systems/report-generator.js',
    'src/renderer/js/systems/benchmark-analysis.js',
    'src/renderer/js/systems/visualizer.js'
  ];

  for (const script of scripts) {
    const code = fs.readFileSync(path.join(root, script), 'utf8');
    vm.runInContext(code, sandbox, { filename: script });
  }

  return {
    ReportGenerator: sandbox.ReportGenerator,
    BenchmarkComparator: sandbox.BenchmarkComparator,
    BatchAnalyzer: sandbox.BatchAnalyzer,
    BenchmarkVisualizer: sandbox.BenchmarkVisualizer
  };
}

function parseArgs(argv) {
  const args = {
    inputFile: null,
    format: 'html',
    output: null,
    charts: false,
    terminal: false,
    compare: []
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (!args.inputFile) {
      args.inputFile = arg;
    } else if (['html', 'markdown', 'md', 'csv', 'json'].includes(arg.toLowerCase())) {
      args.format = arg.toLowerCase();
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg === '--charts') {
      args.charts = true;
    } else if (arg === '--terminal') {
      args.terminal = true;
    } else if (arg === '--compare' && argv[i + 1]) {
      args.compare.push(argv[++i]);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.inputFile) {
    console.error('Usage: node generate-report.js <benchmark-report.json> [format] [options]');
    console.error('');
    console.error('Formats: html, markdown, csv, json');
    console.error('Options:');
    console.error('  --output <path>    Output file path');
    console.error('  --charts           Include charts (HTML only)');
    console.error('  --terminal         Show terminal charts');
    console.error('  --compare <file>   Compare with another report');
    process.exit(1);
  }

  const modules = loadReportingModules();
  const { ReportGenerator, BenchmarkComparator, BenchmarkVisualizer } = modules;

  // Load benchmark result
  const result = JSON.parse(fs.readFileSync(args.inputFile, 'utf8'));

  // Handle comparison mode
  if (args.compare.length > 0) {
    console.log('Comparison mode...');
    const comparator = new BenchmarkComparator();
    comparator.addResult(result, path.basename(args.inputFile));

    for (const compareFile of args.compare) {
      const compareResult = JSON.parse(fs.readFileSync(compareFile, 'utf8'));
      comparator.addResult(compareResult, path.basename(compareFile));
    }

    const comparison = comparator.compare();
    const report = comparator.generateReport(args.format);
    
    const outputPath = args.output || `comparison-report.${args.format === 'html' ? 'html' : 'md'}`;
    fs.writeFileSync(outputPath, report);
    console.log(`Comparison report saved to: ${outputPath}`);
    
    // Show summary
    console.log('\n=== Comparison Summary ===');
    console.log(`Total runs: ${comparison.summary.totalRuns}`);
    console.log('\nWin rates:');
    for (const [agent, stats] of Object.entries(comparison.winRates)) {
      console.log(`  ${agent}: ${stats.wins}/${stats.total} (${stats.rate})`);
    }
    
    return;
  }

  // Show terminal charts if requested
  if (args.terminal) {
    console.log('Generating terminal charts...\n');
    const charts = BenchmarkVisualizer.generateTerminalCharts(result, { width: 70, height: 15 });
    if (charts.scoreChart) console.log(charts.scoreChart);
    if (charts.finalComparison) console.log(charts.finalComparison);
  }

  // Generate report in specified format
  console.log(`Generating ${args.format.toUpperCase()} report...`);
  
  const options = {
    includeCharts: args.charts
  };

  const report = ReportGenerator.generate(result, args.format, options);

  // Determine output path
  let outputPath = args.output;
  if (!outputPath) {
    const ext = args.format === 'html' ? 'html' : 
                args.format === 'csv' ? 'csv' : 
                args.format === 'json' ? 'json' : 'md';
    outputPath = args.inputFile.replace('.json', `.${ext}`);
  }

  // Save report(s)
  if (args.format === 'csv' && typeof report === 'object') {
    // Multiple CSV files
    const base = outputPath.replace('.csv', '');
    fs.writeFileSync(`${base}-daily.csv`, report.daily);
    fs.writeFileSync(`${base}-final.csv`, report.final);
    if (report.events) fs.writeFileSync(`${base}-events.csv`, report.events);
    console.log(`CSV reports saved to: ${base}-*.csv`);
  } else {
    fs.writeFileSync(outputPath, report);
    console.log(`Report saved to: ${outputPath}`);
  }

  // Show summary
  console.log('\n=== Benchmark Summary ===');
  console.log(`Seed: ${result.seed}`);
  console.log(`Days: ${result.daysSimulated}`);
  console.log(`Winner: ${result.outcome?.winner || 'N/A'} (${result.outcome?.reason || 'N/A'})`);
  if (result.outcome?.margin !== undefined) {
    console.log(`Margin: ${result.outcome.margin.toFixed(1)}`);
  }
  
  if (result.final) {
    console.log('\nFinal Scores:');
    for (const village of result.final) {
      console.log(`  ${village.villageName}: ${village.compositeScore} (pop: ${village.population})`);
    }
  }
}

main();
