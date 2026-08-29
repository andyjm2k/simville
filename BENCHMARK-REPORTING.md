# Benchmark Reporting & Visualization

Complete guide to report generation, visualization, and analysis features for the Simville benchmark harness.

## Quick Start

```bash
# Generate HTML report with charts
npm run benchmark -- --days 10 --report-format html --charts

# Generate Markdown summary
npm run benchmark -- --days 10 --report-format markdown --report-output report.md

# Show ASCII charts in terminal
npm run benchmark -- --days 10 --terminal-charts

# Generate CSV for external analysis
npm run benchmark -- --days 10 --report-format csv

# Batch with comparison analysis
npm run benchmark -- --sweep config.json --compare --report-format markdown
```

## Report Formats

### 1. HTML Reports

Rich, interactive reports with embedded charts.

**Generate:**
```bash
npm run benchmark -- --config benchmark.json --report-format html --charts
```

**Features:**
- Interactive Chart.js visualizations
- Score trajectory over time
- Population and resource charts
- Final state comparison tables
- Agent performance metrics
- Event timeline
- Responsive design for all screen sizes

**Output:** `benchmark-report.html` (or custom with `--report-output`)

**Example structure:**
- Summary section with key metrics
- Outcome (winner, reason, margin)
- Agent details with performance stats
- Interactive charts (score, population, resources)
- Daily progress table
- Key events timeline
- Final state comparison

### 2. Markdown Reports

Documentation-friendly reports for GitHub, wikis, or archiving.

**Generate:**
```bash
npm run benchmark -- --config benchmark.json --report-format markdown
```

**Features:**
- GitHub-flavored markdown
- Tables for data comparison
- Agent summaries
- Daily progress (sampled if > 20 days)
- Perfect for embedding in documentation

**Output:** `benchmark-report.md`

**Use cases:**
- Include in GitHub PRs for benchmark results
- Add to project documentation
- Archive historical benchmark data
- Share results in readable format

### 3. CSV Exports

Data export for external analysis tools (Excel, R, Python, etc).

**Generate:**
```bash
npm run benchmark -- --config benchmark.json --report-format csv
```

**Generates three files:**
- `benchmark-report-daily.csv` - Day-by-day metrics
- `benchmark-report-final.csv` - Final state for each agent
- `benchmark-report-events.csv` - Event log

**Columns in daily.csv:**
- `day` - In-game day number
- `{village}_population` - Population count
- `{village}_structures` - Structure count  
- `{village}_resourceScore` - Weighted resource score
- `{village}_compositeScore` - Overall composite score

**Use with:**
- Excel/Google Sheets for pivot tables
- Python pandas: `pd.read_csv('report-daily.csv')`
- R: `data <- read.csv('report-daily.csv')`
- Tableau, PowerBI, or other BI tools

### 4. JSON Reports (Default)

Complete data dump for programmatic access.

**Output:** `benchmark-report.json`

**Structure:**
```json
{
  "version": "1.1.0",
  "mode": "llm_vs_opponent",
  "seed": 4242,
  "targetDays": 30,
  "daysSimulated": 30,
  "ticksExecuted": 360,
  "durationMs": 45000,
  "outcome": {
    "winner": "A",
    "reason": "composite_score",
    "margin": 123.4
  },
  "agents": [...],
  "dailySnapshots": [...],
  "final": [...],
  "benchmarkEvents": [...]
}
```

## Visualizations

### Terminal Charts (ASCII)

Real-time charts displayed in the terminal.

**Enable:**
```bash
npm run benchmark -- --config benchmark.json --terminal-charts
```

**Features:**
- Score trajectory line chart
- Final comparison bar chart
- Works in any terminal
- No external dependencies

**Example output:**
```
Composite Score Over Time
============================================================
  450 │                                              ●●●●
  400 │                                        ●●●●●●
  350 │                                  ●●●●●●
  300 │                            ●●●●●●
  250 │                      ●●●●●●            ■■■■■
  200 │                ●●●●●●                  ■■■
  150 │          ●●●●●●                        ■■
  100 │    ●●●●●●                              ■
   50 │ ●●●                                    
       └────────────────────────────────────────────────
        Day 1                                    Day 30

Legend:
  ● = Village A (LLM)
  ■ = Village B (Baseline)
```

### HTML Charts (Interactive)

Embedded Chart.js visualizations with zoom, pan, and tooltips.

**Charts included:**
1. **Score Trajectory** - Line chart showing composite score evolution
2. **Population Growth** - Track population changes over time
3. **Resource Accumulation** - Weighted resource scores
4. **Final Comparison** - Grouped bar chart of all metrics

**Enable:** Add `--charts` flag when generating HTML reports

### Chart Data Export

Export chart data for external visualization tools.

**Formats supported:**
- Chart.js (JavaScript)
- Plotly (Python, JavaScript, R)
- Matplotlib (Python)
- CSV (any tool)

**Usage in code:**
```javascript
const { BenchmarkVisualizer } = require('./visualizer');
const result = require('./benchmark-report.json');

// Export for Chart.js
const chartData = BenchmarkVisualizer.exportChartJSData(result);

// Export for Plotly
const plotlyData = BenchmarkVisualizer.exportForExternalTool(result, 'plotly');

// Export for matplotlib
const mplData = BenchmarkVisualizer.exportForExternalTool(result, 'matplotlib');
```

**Python example:**
```python
import json
import matplotlib.pyplot as plt

with open('benchmark-report.json') as f:
    data = json.load(f)

# Extract score data
days = [s['day'] for s in data['dailySnapshots']]
scores_a = [s['villages'][0]['compositeScore'] for s in data['dailySnapshots']]
scores_b = [s['villages'][1]['compositeScore'] for s in data['dailySnapshots']]

plt.plot(days, scores_a, label='Agent A')
plt.plot(days, scores_b, label='Agent B')
plt.xlabel('Days')
plt.ylabel('Composite Score')
plt.legend()
plt.show()
```

## Comparison & Analysis

### Compare Multiple Runs

Aggregate statistics across multiple benchmark runs.

**For batch/sweep:**
```bash
npm run benchmark -- --sweep config.json --compare --report-format markdown
```

**Generates:**
- Win rate statistics
- Performance metric distributions (mean, min, max, stddev)
- Agent efficiency analysis
- Score trajectory comparisons

**Output:** `batch-analysis.json` + `batch-analysis.md`

**Analysis includes:**
- **Win Rates** - Percentage of wins per agent
- **Performance Metrics** - Score, population, resources stats
- **Trajectory Analysis** - Average score evolution
- **Agent Analysis** - API calls, latency, failure rates

### Group Analysis

Analyze results grouped by parameters.

**Config:**
```json
{
  "groupBy": "metadata.sweep.agentA.temperature",
  "baseConfig": {...},
  "sweep": {
    "agentA.temperature": [0.2, 0.4, 0.6, 0.8]
  }
}
```

**Generates comparison for each group:**
- Temperature 0.2 vs 0.4 vs 0.6 vs 0.8
- Win rates per group
- Performance metrics per group

### Statistical Comparison

**Metrics calculated:**
- **Mean** - Average value across runs
- **Min/Max** - Range of values
- **Standard Deviation** - Variability
- **Win Rate** - Percentage of victories
- **Success Rate** - Completed vs failed runs

**Example output:**
```markdown
## Performance Metrics

### Agent A (gpt-4o-mini)

**Composite Score:**
- Mean: 345.2
- Min: 298.5
- Max: 412.7
- StdDev: 28.3

**Population:**
- Mean: 18.4
- Min: 15
- Max: 22
```

## CLI Reference

### Single Run Options

```bash
--report-format <format>   # html, markdown, csv, json
--report-output <file>     # Custom output path
--charts                   # Include interactive charts (HTML only)
--terminal-charts          # Show ASCII charts in terminal
```

### Batch/Sweep Options

```bash
--compare                  # Generate comparison analysis
--report-format <format>   # Format for analysis reports
```

### Examples

**Comprehensive single run report:**
```bash
npm run benchmark -- \
  --config benchmark.json \
  --report-format html \
  --charts \
  --terminal-charts \
  --report-output reports/run-001.html
```

**Batch with full analysis:**
```bash
npm run benchmark -- \
  --batch batch-config.json \
  --parallel 4 \
  --compare \
  --report-format markdown \
  --verbose
```

**CSV for data science:**
```bash
npm run benchmark -- \
  --sweep temp-sweep.json \
  --parallel 4 \
  --report-format csv \
  --report-output data/temp-sweep.csv
```

## Advanced Usage

### Custom Report Generation (Code)

```javascript
const { ReportGenerator } = require('./report-generator');
const result = require('./benchmark-report.json');

// Generate HTML with options
const html = ReportGenerator.generate(result, 'html', {
  title: 'My Custom Benchmark',
  includeCharts: true
});

ReportGenerator.save(html, 'custom-report.html');

// Generate multiple CSV files
const csv = ReportGenerator.generate(result, 'csv', {
  format: 'all'
});

ReportGenerator.save(csv.daily, 'daily.csv');
ReportGenerator.save(csv.final, 'final.csv');
ReportGenerator.save(csv.events, 'events.csv');
```

### Comparison Analysis (Code)

```javascript
const { BenchmarkComparator } = require('./benchmark-analysis');

const comparator = new BenchmarkComparator();
comparator.addResult(result1, 'Run 1');
comparator.addResult(result2, 'Run 2');
comparator.addResult(result3, 'Run 3');

const comparison = comparator.compare();

// Generate reports
const markdown = comparator.generateReport('markdown');
const html = comparator.generateReport('html');
const json = comparator.generateReport('json');
```

### Batch Analysis (Code)

```javascript
const { BatchAnalyzer } = require('./benchmark-analysis');
const batchResult = require('./batch-report.json');

// Analyze batch with grouping
const analysis = BatchAnalyzer.analyze(batchResult, {
  groupBy: 'config.agentA.temperature'
});

// Generate report
const mdReport = BatchAnalyzer.generateReport(batchResult, 'markdown', {
  groupBy: 'config.agentA.temperature'
});
```

## Report Examples

### Example 1: Model Comparison

**Goal:** Compare gpt-4o-mini vs gpt-4o

```bash
# Run batch comparison
npm run benchmark -- --batch model-comparison.json --compare

# Generate HTML report
npm run benchmark -- \
  --batch model-comparison.json \
  --report-format html \
  --charts \
  --compare
```

**Result:** Comparison report showing win rates, performance, and efficiency differences.

### Example 2: Temperature Sweep

**Goal:** Find optimal temperature for decision-making

```bash
# Run sweep
npm run benchmark -- --sweep temp-sweep.json --parallel 4 --compare

# Generate analysis
npm run benchmark -- \
  --sweep temp-sweep.json \
  --parallel 4 \
  --compare \
  --report-format markdown \
  --report-output analysis/temperature-study.md
```

**Result:** Grouped analysis showing optimal temperature range.

### Example 3: Progress Tracking

**Goal:** Monitor a long-running benchmark

```bash
# Run with terminal charts
npm run benchmark -- \
  --days 100 \
  --terminal-charts \
  --verbose \
  --report-format html \
  --charts
```

**Result:** Real-time ASCII charts + final HTML report with full history.

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run Benchmark
  run: |
    npm run benchmark -- \
      --config benchmark.json \
      --report-format markdown \
      --report-output benchmark-report.md

- name: Comment PR with Results
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require('fs');
      const report = fs.readFileSync('benchmark-report.md', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: report
      });
```

### Archive Reports

```bash
# Create timestamped reports
timestamp=$(date +%Y%m%d-%H%M%S)
npm run benchmark -- \
  --config benchmark.json \
  --report-format html \
  --charts \
  --report-output "reports/benchmark-${timestamp}.html"
```

## Best Practices

### Report Organization

```
reports/
├── single-runs/
│   ├── 2024-01-15-gpt4o-mini.html
│   └── 2024-01-15-gpt4o.html
├── batches/
│   ├── model-comparison-2024-01-15/
│   │   ├── batch-report.json
│   │   ├── batch-analysis.md
│   │   └── run-*.json
│   └── temp-sweep-2024-01-16/
│       └── ...
└── data/
    ├── daily-metrics.csv
    └── final-states.csv
```

### Report Naming

- Include date: `report-2024-01-15.html`
- Include config identifier: `gpt4o-temp0.4-seed42.html`
- Use descriptive names: `model-comparison-analysis.md`

### Performance Tips

- Use `--silent` for automated runs to reduce overhead
- Generate heavy reports (HTML with charts) only when needed
- Use CSV for large datasets and batch processing
- Keep JSON for complete data archival

### Sharing Reports

- **HTML**: Self-contained, share via file or host statically
- **Markdown**: Include in GitHub repos, wikis, PRs
- **CSV**: Share via Google Sheets, analyze collaboratively
- **JSON**: For programmatic access and re-analysis

## Troubleshooting

### "Chart.js not loading"

HTML charts require internet connection to load Chart.js CDN. For offline use, download Chart.js and update the HTML template.

### "Memory error with large reports"

For runs > 100 days or large batches:
- Use CSV format instead of HTML
- Sample daily snapshots (reduce frequency)
- Generate reports incrementally

### "Terminal charts not displaying"

- Ensure terminal supports UTF-8
- Adjust chart width/height: `--terminal-charts` with smaller window
- Some symbols may not render in basic terminals

### "CSV files not opening"

- Check file encoding (should be UTF-8)
- Verify delimiter is comma
- Try opening in text editor first to inspect format

## Future Enhancements

Planned features:
- PDF report generation
- Real-time dashboard (web server)
- Heatmap visualizations for resource efficiency
- Animated GIF/video generation from snapshots
- Integration with external monitoring tools (Grafana, etc)
