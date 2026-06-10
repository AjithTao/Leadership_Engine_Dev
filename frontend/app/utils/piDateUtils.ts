export interface PIContext {
  year: string;
  pi: string;
  value: string;
  label: string;
  startDate: string;
  endDate: string;
  reportStartDate?: string;
  reportEndDate?: string;
}

export interface PIDateWindow {
  piContext: PIContext;
  cyYear: string;
  piNumber: string;
  piStartDate: string;
  reportDate: string;
  dateFrom: string;
  dateTo: string;
  headerTitle: string;
}

type DateInput = string | Date;

// Reporting windows follow fixed calendar-quarter PI dates.
// Update this list when the official TCOE/QCOE PI calendar changes.
export const PI_DATE_RANGES: PIContext[] = [
  {
    year: 'CY25',
    pi: 'PI1',
    value: 'PI1_CY25',
    label: 'PI 1 - CY25 (Jan 01 - Mar 31, 2025)',
    startDate: '2025-01-01',
    endDate: '2025-03-31',
  },
  {
    year: 'CY25',
    pi: 'PI2',
    value: 'PI2_CY25',
    label: 'PI 2 - CY25 (Apr 01 - Jun 30, 2025)',
    startDate: '2025-04-01',
    endDate: '2025-06-30',
  },
  {
    year: 'CY25',
    pi: 'PI3',
    value: 'PI3_CY25',
    label: 'PI 3 - CY25 (Jul 01 - Sep 30, 2025)',
    startDate: '2025-07-01',
    endDate: '2025-09-30',
  },
  {
    year: 'CY25',
    pi: 'PI4',
    value: 'PI4_CY25',
    label: 'PI 4 - CY25 (Oct 01 - Dec 31, 2025)',
    startDate: '2025-10-01',
    endDate: '2025-12-31',
  },
  {
    year: 'CY26',
    pi: 'PI1',
    value: 'PI1_CY26',
    label: 'PI 1 - CY26 (Jan 01 - Mar 31, 2026)',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  },
  {
    year: 'CY26',
    pi: 'PI2',
    value: 'PI2_CY26',
    label: 'PI 2 - CY26 (Apr 01 - Jun 30, 2026)',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
  },
  {
    year: 'CY26',
    pi: 'PI3',
    value: 'PI3_CY26',
    label: 'PI 3 - CY26 (Jul 01 - Sep 30, 2026)',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
  },
  {
    year: 'CY26',
    pi: 'PI4',
    value: 'PI4_CY26',
    label: 'PI 4 - CY26 (Oct 01 - Dec 31, 2026)',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
  },
];

export function normalizeISODate(date: DateInput): string {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid report date');
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const value = String(date || '').trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid report date: ${value || '(blank)'}`);
  }
  return normalizeISODate(parsed);
}

export function getPIByDate(date: DateInput): PIContext | null {
  const reportDate = normalizeISODate(date);
  return PI_DATE_RANGES.find((range) => (
    (range.reportStartDate || range.startDate) <= reportDate
    && reportDate <= (range.reportEndDate || range.endDate)
  )) || null;
}

export function formatPICompact(piContext?: PIContext | null): string {
  return piContext ? `${piContext.year}${piContext.pi}` : 'selected PI';
}

export function formatPISpaced(piContext?: PIContext | null): string {
  return piContext ? `${piContext.year} ${piContext.pi}` : 'selected PI';
}

export function buildPIDateWindow(reportDateInput: DateInput): PIDateWindow {
  const reportDate = normalizeISODate(reportDateInput);
  const piContext = getPIByDate(reportDate);

  if (!piContext) {
    throw new Error(`No PI date range configured for ${reportDate}. Add this date to PI_DATE_RANGES.`);
  }

  return {
    piContext,
    cyYear: piContext.year,
    piNumber: piContext.pi,
    piStartDate: piContext.startDate,
    reportDate,
    dateFrom: piContext.startDate,
    dateTo: reportDate,
    headerTitle: `${piContext.year} - ${piContext.pi} Weekly Quality Metrics`,
  };
}

export function buildMetricHeader(reportDate: DateInput): string {
  return buildPIDateWindow(reportDate).headerTitle;
}

export function buildJQLDateClause(
  metricType: string,
  piStartDateInput: DateInput,
  reportDateInput: DateInput,
): string {
  const piStartDate = normalizeISODate(piStartDateInput);
  const reportDate = normalizeISODate(reportDateInput);
  const normalizedMetric = metricType.toLowerCase();
  const resolvedMetrics = new Set(['resolved', 'closed', 'closed_dev_stories', 'test_review_status']);
  const updatedMetrics = new Set(['updated', 'defect_leakage', 'defect_inflow', 'test_execution']);
  const fieldName = resolvedMetrics.has(normalizedMetric)
    ? 'resolved'
    : updatedMetrics.has(normalizedMetric)
    ? 'updatedDate'
    : 'createdDate';

  return `${fieldName} >= "${piStartDate}" AND ${fieldName} <= "${reportDate} 23:59"`;
}

export function compareMetricByDate(currentDate: DateInput, previousDate: DateInput) {
  const current = buildPIDateWindow(currentDate);
  const previous = buildPIDateWindow(previousDate);
  const isDifferentPI = current.piContext.value !== previous.piContext.value;

  return {
    current,
    previous,
    isDifferentPI,
    comparisonNote: isDifferentPI
      ? `Previous comparison date belongs to ${formatPISpaced(previous.piContext)}; current report date belongs to ${formatPISpaced(current.piContext)}. Each period uses its own PI start date.`
      : null,
  };
}
