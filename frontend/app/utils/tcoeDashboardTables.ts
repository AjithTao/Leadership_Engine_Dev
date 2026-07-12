export type TcoeValueMode = 'percent' | 'ratio' | 'ratio_percent' | 'defect_inflow';

export interface TcoeTableRow {
  label: string;
  counts: number[];
  previous: number;
  current: number;
  progress: number;
  comment: string;
  mode: TcoeValueMode;
  isGrandTotal?: boolean;
  lowerIsBetter?: boolean;
  previousNumerator?: number;
  previousDenominator?: number;
  currentNumerator?: number;
  currentDenominator?: number;
  previousCy25?: number;
  previousCy26?: number;
  currentCy25?: number;
  currentCy26?: number;
  source?: any;
}

export interface TcoeTableSpec {
  metricKey: string;
  title: string;
  countHeaders: string[];
  rows: TcoeTableRow[];
  mode: TcoeValueMode;
  aiInsight?: QcoeAIInsight | null;
}

export interface QcoePortfolioInsight {
  project_names: string[];
  root_causes: string[];
  action_items: string[];
}

export interface QcoeAIInsight {
  status: 'available' | 'unavailable';
  export_comments: {
    issue_portfolio_recommendation: string;
    best_portfolio_summary: string;
    overall_recommendation: string;
  } | null;
  portfolios: Record<string, QcoePortfolioInsight>;
}

export const TCOE_METRIC_ORDER = [
  'test_coverage',
  'test_review_status',
  'test_story_ratio',
  'bug_ratio',
  'defect_leakage',
  'overall_automation',
  'regression_automation',
] as const;

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const pct = (numerator: number, denominator: number): number =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

const roundTo = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const defectInflow = (cy25: number, cy26: number): number => {
  if (cy25 > 0) return ((cy26 - cy25) / cy25) * 100;
  return cy26 > 0 ? 100 : 0;
};

const rowLabel = (row: any): string =>
  row?.portfolio_display || row?.portfolio || row?.project_label || 'Unknown';

const rowComment = (row: any): string =>
  String(row?.ai_analysis || row?.ai_insights || row?.comment || '').replace(/\*\*(.*?)\*\*/g, '$1');

const piLabels = (rows: any[]) => {
  const context = rows.find(Boolean)?.pi_context || rows.find(Boolean)?.period2?.pi_context || {};
  const raw = String(context.value || '');
  const match = raw.match(/(PI\d+)_?(CY\d+)/i);
  const pi = String(context.pi || match?.[1] || '').toUpperCase();
  const year = String(context.year || match?.[2] || '').toUpperCase();
  return {
    compact: year && pi ? `${year}${pi}` : 'Selected PI',
    spaced: year && pi ? `${year} ${pi}` : 'Selected PI',
  };
};

const progressValue = (row: any, current: number, previous: number): number =>
  toNumber(row?.progress?.wow_progress_pct ?? row?.progress?.percentage_change ?? row?.comparison?.leakage_change ?? (current - previous));

const buildGrandTotal = (rows: TcoeTableRow[], mode: TcoeValueMode): TcoeTableRow => {
  const countLength = rows[0]?.counts?.length || 2;
  const counts = Array.from({ length: countLength }, (_, idx) =>
    rows.reduce((sum, row) => sum + toNumber(row.counts[idx]), 0)
  );
  const previousNumerator = rows.reduce((sum, row) => sum + toNumber(row.previousNumerator), 0);
  const previousDenominator = rows.reduce((sum, row) => sum + toNumber(row.previousDenominator), 0);
  const currentNumerator = rows.reduce((sum, row) => sum + toNumber(row.currentNumerator), 0);
  const currentDenominator = rows.reduce((sum, row) => sum + toNumber(row.currentDenominator), 0);
  const previousCy25 = rows.reduce((sum, row) => sum + toNumber(row.previousCy25), 0);
  const previousCy26 = rows.reduce((sum, row) => sum + toNumber(row.previousCy26), 0);
  const currentCy25 = rows.reduce((sum, row) => sum + toNumber(row.currentCy25), 0);
  const currentCy26 = rows.reduce((sum, row) => sum + toNumber(row.currentCy26), 0);

  const previous = mode === 'ratio'
    ? (previousDenominator > 0 ? previousNumerator / previousDenominator : 0)
    : mode === 'defect_inflow'
    ? defectInflow(previousCy25, previousCy26)
    : pct(previousNumerator, previousDenominator);
  const current = mode === 'ratio'
    ? (currentDenominator > 0 ? currentNumerator / currentDenominator : 0)
    : mode === 'defect_inflow'
    ? defectInflow(currentCy25, currentCy26)
    : pct(currentNumerator, currentDenominator);

  return {
    label: 'Grand Total',
    counts,
    previous,
    current,
    progress: mode === 'ratio' ? (current - previous) * 100 : current - previous,
    comment: '',
    mode,
    isGrandTotal: true,
    lowerIsBetter: rows[0]?.lowerIsBetter,
  };
};

const withGrandTotal = (rows: TcoeTableRow[], mode: TcoeValueMode): TcoeTableRow[] =>
  rows.length ? [...rows, buildGrandTotal(rows, mode)] : rows;

const automationRows = (metricKey: string, rows: any[], tableKey: 'table_a' | 'table_b'): TcoeTableRow[] =>
  rows.map((row) => {
    const table = row?.[tableKey] || {};
    const p1 = table.period1 || row?.period1 || {};
    const p2 = table.period2 || table.period || row?.period2 || row?.period || {};
    const automated2 = toNumber(p2.automated ?? p2.automated_count);
    const requires2 = toNumber(p2.requires_automation ?? p2.manual_count);
    const notRequired2 = toNumber(p2.automation_not_required);
    const automated1 = toNumber(p1.automated ?? p1.automated_count);
    const requires1 = toNumber(p1.requires_automation ?? p1.manual_count);
    const notRequired1 = toNumber(p1.automation_not_required);
    const currentDenominator = tableKey === 'table_b'
      ? toNumber(p2.automatable ?? (automated2 + requires2))
      : toNumber(p2.total ?? (automated2 + requires2 + notRequired2));
    const previousDenominator = tableKey === 'table_b'
      ? toNumber(p1.automatable ?? (automated1 + requires1))
      : toNumber(p1.total ?? (automated1 + requires1 + notRequired1));
    const current = toNumber(p2.automation_percentage ?? pct(automated2, currentDenominator));
    const previous = toNumber(p1.automation_percentage ?? pct(automated1, previousDenominator));

    return {
      label: rowLabel(row),
      counts: tableKey === 'table_b' ? [automated2, requires2] : [automated2, requires2, notRequired2],
      previous,
      current,
      progress: toNumber(table.progress?.wow_progress_pct ?? table.progress?.percentage_change ?? progressValue(row, current, previous)),
      comment: rowComment(row),
      mode: 'percent',
      previousNumerator: automated1,
      previousDenominator,
      currentNumerator: automated2,
      currentDenominator,
      source: row,
    };
  });

const coverageRows = (rows: any[], tableKey: 'table_a' | 'table_b'): TcoeTableRow[] =>
  rows.map((row) => {
    const table = row?.[tableKey] || {};
    const p1 = table.period1 || row?.period1 || {};
    const p2 = table.period2 || table.period || row?.period2 || row?.period || {};
    const currentStories = toNumber(tableKey === 'table_b' ? (p2.cumulative_dev_stories ?? p2.total_stories) : (p2.dev_stories ?? p2.total_stories));
    const currentTests = toNumber(tableKey === 'table_b' ? (p2.cumulative_tests_mapped ?? p2.total_test_cases) : (p2.test_cases_created ?? p2.total_test_cases));
    const previousStories = toNumber(tableKey === 'table_b' ? (p1.cumulative_dev_stories ?? p1.total_stories) : (p1.dev_stories ?? p1.total_stories));
    const previousWithTests = toNumber(p1.stories_with_tests);
    const currentWithTests = toNumber(p2.stories_with_tests);
    const previous = toNumber(p1.coverage_percentage ?? pct(previousWithTests, previousStories));
    const current = toNumber(p2.coverage_percentage ?? pct(currentWithTests, currentStories));

    return {
      label: rowLabel(row),
      counts: [currentStories, currentTests],
      previous,
      current,
      progress: toNumber(table.progress?.wow_progress_pct ?? table.progress?.percentage_change ?? progressValue(row, current, previous)),
      comment: rowComment(row),
      mode: 'percent',
      previousNumerator: previousWithTests,
      previousDenominator: previousStories,
      currentNumerator: currentWithTests,
      currentDenominator: currentStories,
      source: row,
    };
  });

const singleRows = (metricKey: string, rows: any[]): TcoeTableRow[] =>
  rows.map((row) => {
    const p1 = row?.period1 || row?.previous_week || {};
    const p2 = row?.period2 || row?.period || row?.current_week || {};

    if (metricKey === 'test_story_ratio') {
      const previous = toNumber(p1.ratio);
      const current = toNumber(p2.ratio);
      return {
        label: rowLabel(row),
        counts: [toNumber(p2.total_test_cases), toNumber(p2.total_stories)],
        previous,
        current,
        progress: toNumber(row?.progress?.wow_progress_pct ?? ((current - previous) * 100)),
        comment: rowComment(row),
        mode: 'ratio',
        previousNumerator: toNumber(p1.total_test_cases),
        previousDenominator: toNumber(p1.total_stories),
        currentNumerator: toNumber(p2.total_test_cases),
        currentDenominator: toNumber(p2.total_stories),
        source: row,
      };
    }

    if (metricKey === 'bug_ratio') {
      const previousBugs = toNumber(p1.bugs_found);
      const previousTests = toNumber(p1.test_cases_executed);
      const currentBugs = toNumber(p2.bugs_found);
      const currentTests = toNumber(p2.test_cases_executed);
      const previous = previousTests > 0 ? pct(previousBugs, previousTests) : toNumber(p1.ratio) * 100;
      const current = currentTests > 0 ? pct(currentBugs, currentTests) : toNumber(p2.ratio) * 100;
      return {
        label: rowLabel(row),
        counts: [currentTests, currentBugs],
        previous,
        current,
        progress: toNumber(row?.progress?.wow_progress_pct ?? (current - previous)),
        comment: rowComment(row),
        mode: 'ratio_percent',
        lowerIsBetter: true,
        previousNumerator: previousBugs,
        previousDenominator: previousTests,
        currentNumerator: currentBugs,
        currentDenominator: currentTests,
        source: row,
      };
    }

    if (metricKey === 'test_review_status') {
      const previousTotal = toNumber(p1.reviewed_yes) + toNumber(p1.reviewed_no) + toNumber(p1.not_set);
      const currentTotal = toNumber(p2.reviewed_yes) + toNumber(p2.reviewed_no) + toNumber(p2.not_set);
      const previous = toNumber(p1.review_percentage ?? pct(toNumber(p1.reviewed_yes), previousTotal));
      const current = toNumber(p2.review_percentage ?? pct(toNumber(p2.reviewed_yes), currentTotal));
      return {
        label: rowLabel(row),
        counts: [toNumber(p2.reviewed_yes), currentTotal || toNumber(row?.total_stories)],
        previous,
        current,
        progress: progressValue(row, current, previous),
        comment: rowComment(row),
        mode: 'percent',
        previousNumerator: toNumber(p1.reviewed_yes),
        previousDenominator: previousTotal,
        currentNumerator: toNumber(p2.reviewed_yes),
        currentDenominator: currentTotal || toNumber(row?.total_stories),
        source: row,
      };
    }

    const previousCy25 = toNumber(p1.cy25_defects ?? p1.bugs_count);
    const previousCy26 = toNumber(p1.cy26_defects ?? p1.defects_count);
    const currentCy25 = toNumber(p2.cy25_defects ?? p2.bugs_count);
    const currentCy26 = toNumber(p2.cy26_defects ?? p2.defects_count);
    const previous = toNumber(p1.defect_inflow_percentage ?? p1.leakage_percentage ?? defectInflow(previousCy25, previousCy26));
    const current = toNumber(p2.defect_inflow_percentage ?? p2.leakage_percentage ?? defectInflow(currentCy25, currentCy26));

    return {
      label: rowLabel(row),
      counts: [currentCy25, currentCy26],
      previous,
      current,
      progress: progressValue(row, current, previous),
      comment: rowComment(row),
      mode: 'defect_inflow',
      lowerIsBetter: true,
      previousCy25,
      previousCy26,
      currentCy25,
      currentCy26,
      source: row,
    };
  });

export function buildTcoeTableSpecs(metricKey: string, rows: any[], aiInsight?: QcoeAIInsight | null): TcoeTableSpec[] {
  const dataRows = rows.filter((row) => row?.portfolio !== 'Grand Total' && row?.portfolio_display !== 'Grand Total');
  const rowsForTables = dataRows.length ? dataRows : rows;
  const pi = piLabels(rowsForTables);

  if (metricKey === 'test_coverage') {
    return [
      {
        metricKey,
        title: 'Stories to Test Cases Mapping - Every story should have at least 1 test case mapped to ensure optimal coverage',
        countHeaders: [`# of Dev Stories in ${pi.compact}`, `# Test Cases Created in ${pi.compact} (Story + Bugs + Defects)`],
        rows: withGrandTotal(coverageRows(rowsForTables, 'table_a'), 'percent'),
        mode: 'percent',
        aiInsight,
      },
      {
        metricKey,
        title: rowsForTables[0]?.table_b?.title || 'Stories to Test Cases Mapping - Cumulative (CY24+CY25+CY26)',
        countHeaders: ['Cumulative # of Dev Stories (CY24+CY25+CY26)', 'Cumulative # of Tests Mapped (Story + Bugs + Defects)'],
        rows: withGrandTotal(coverageRows(rowsForTables, 'table_b'), 'percent'),
        mode: 'percent',
        aiInsight,
      },
    ];
  }

  if (metricKey === 'overall_automation' || metricKey === 'regression_automation') {
    const isOverall = metricKey === 'overall_automation';
    return [
      {
        metricKey,
        title: rowsForTables[0]?.table_a?.title || `${isOverall ? 'Overall' : 'Regression'} Automation Status - Automated test cases against overall volume`,
        countHeaders: ['Automated', 'Requires Automation', 'Automation Not Required'],
        rows: withGrandTotal(automationRows(metricKey, rowsForTables, 'table_a'), 'percent'),
        mode: 'percent',
        aiInsight,
      },
      {
        metricKey,
        title: rowsForTables[0]?.table_b?.title || `${isOverall ? 'Overall' : 'Regression'} Automation Status - Automated test cases against automatable volume`,
        countHeaders: ['Automated', 'Requires Automation'],
        rows: withGrandTotal(automationRows(metricKey, rowsForTables, 'table_b'), 'percent'),
        mode: 'percent',
        aiInsight,
      },
    ];
  }

  const countHeaders = metricKey === 'test_story_ratio'
    ? [`# Test Cases Created in ${pi.spaced}`, `# of Closed Dev Stories in ${pi.spaced}`]
    : metricKey === 'bug_ratio'
    ? [`Test Cases (Stories / Bugs / Defects with Tests + Test only stories) in ${pi.spaced}`, `Bugs Written in ${pi.spaced}`]
    : metricKey === 'test_review_status'
    ? ['# of Closed Dev Stories with Test Cases Review Filled', `# of Closed Dev Stories in ${pi.compact}`]
    : ['CY25 Defects', 'CY26 Defects'];
  const mode: TcoeValueMode = metricKey === 'test_story_ratio'
    ? 'ratio'
    : metricKey === 'bug_ratio'
    ? 'ratio_percent'
    : metricKey === 'defect_leakage'
    ? 'defect_inflow'
    : 'percent';
  const title = metricKey === 'test_story_ratio'
    ? 'Test : Story Ratio - Total # of Tests Created per closed Dev story'
    : metricKey === 'bug_ratio'
    ? 'Bugs / Test Case - Quality of test cases and code quality view'
    : metricKey === 'test_review_status'
    ? 'Test Cases Review Status - Closed Dev Stories with Review Filled'
    : 'Weekly Defect Inflow - CY26 defects compared with CY25';

  return [
    {
      metricKey,
      title,
      countHeaders,
      rows: withGrandTotal(singleRows(metricKey, rowsForTables), mode),
      mode,
      aiInsight,
    },
  ];
}

export function formatTcoeNumber(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0';
  return Math.round(value).toString();
}

export function formatTcoePercentage(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0.0%';
  return `${roundTo(Number(value), 1).toFixed(1)}%`;
}

export function formatTcoeRatio(value?: number | null, decimals = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return Number(0).toFixed(decimals);
  return Number(value).toFixed(decimals);
}

export function formatTcoeValue(value: number, mode: TcoeValueMode): string {
  if (mode === 'ratio') return formatTcoeRatio(value, 2);
  return formatTcoePercentage(value);
}

export function formatTcoeChange(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0.0%';
  const numeric = roundTo(Number(value), 1);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}
