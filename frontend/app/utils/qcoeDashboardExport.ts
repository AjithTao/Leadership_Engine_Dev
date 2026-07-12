import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { buildQcoeSummaryComments } from './qcoeInsights';
import {
  TcoeTableRow,
  TcoeTableSpec,
  formatTcoeChange,
  formatTcoeNumber,
  formatTcoeValue,
} from './tcoeDashboardTables';

export interface QcoeExportMetric {
  label: string;
  tables: TcoeTableSpec[];
}

export interface QcoeExportReport {
  generatedAt: Date;
  currentWeek: string;
  previousWeek: string;
  metrics: QcoeExportMetric[];
}

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const REGULAR_ROWS_PER_PAGE = 10;
const CELL_BORDER = '1.5px solid #7f8fa6';

const week = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const statusStyle = (row: TcoeTableRow, value: number, progress = false) => {
  const good = progress
    ? (row.lowerIsBetter ? value < 0 : value > 0)
    : row.mode === 'ratio'
      ? value >= 2
      : row.lowerIsBetter
        ? value <= 5
        : value >= 90;
  const risk = progress
    ? (row.lowerIsBetter ? value > 0 : value < 0)
    : row.mode === 'ratio'
      ? value < 1
      : row.lowerIsBetter
        ? value > 10
        : value < 70;

  if (good) return { background: '#e8f5e9', color: '#237a3b' };
  if (risk) return { background: '#ffebee', color: '#b4232c' };
  return { background: '#fff3e0', color: '#9a6700' };
};

const setStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
  Object.assign(element.style, styles);
};

const addCell = (row: HTMLTableRowElement, value: string, styles: Partial<CSSStyleDeclaration> = {}) => {
  const cell = document.createElement('td');
  cell.textContent = value;
  setStyles(cell, {
    border: CELL_BORDER,
    padding: '8px 9px',
    fontSize: '11px',
    lineHeight: '1.25',
    verticalAlign: 'middle',
    color: '#172033',
    ...styles,
  });
  row.appendChild(cell);
  return cell;
};

const splitRows = (rows: TcoeTableRow[]) => {
  const total = rows.find((row) => row.isGrandTotal);
  const regular = rows.filter((row) => !row.isGrandTotal);
  const chunks: TcoeTableRow[][] = [];

  // A standard QCOE table is one page: 10 portfolios plus Grand Total.
  // Larger datasets are balanced so the final page is not an orphan row.
  const pageCount = Math.max(1, Math.ceil(regular.length / REGULAR_ROWS_PER_PAGE));
  const baseSize = Math.floor(regular.length / pageCount);
  const remainder = regular.length % pageCount;
  let offset = 0;
  for (let page = 0; page < pageCount; page += 1) {
    const size = baseSize + (page < remainder ? 1 : 0);
    chunks.push(regular.slice(offset, offset + size));
    offset += size;
  }

  if (total) {
    chunks[chunks.length - 1].push(total);
  }
  return chunks;
};

const createReportPage = (
  report: QcoeExportReport,
  metricLabel: string,
  spec: TcoeTableSpec,
  rows: TcoeTableRow[],
  continuation: boolean,
) => {
  const page = document.createElement('section');
  setStyles(page, {
    width: `${PAGE_WIDTH}px`,
    height: `${PAGE_HEIGHT}px`,
    boxSizing: 'border-box',
    padding: '28px 32px 24px',
    background: '#ffffff',
    color: '#172033',
    fontFamily: 'Arial, Helvetica, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  });

  const header = document.createElement('header');
  setStyles(header, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: '10px',
    marginBottom: '14px',
    borderBottom: '3px solid #1b7f8f',
  });
  const heading = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = 'QCOE Metrics';
  setStyles(title, { fontSize: '22px', lineHeight: '1', fontWeight: '700', color: '#172033' });
  const comparison = document.createElement('div');
  comparison.textContent = `Current week ending ${week(report.currentWeek)} compared with ${week(report.previousWeek)}`;
  setStyles(comparison, { marginTop: '7px', fontSize: '11px', color: '#526176' });
  heading.append(title, comparison);
  const generated = document.createElement('div');
  generated.textContent = `Generated: ${report.generatedAt.toLocaleString('en-US')}`;
  setStyles(generated, { fontSize: '10px', color: '#667085', textAlign: 'right' });
  header.append(heading, generated);
  page.appendChild(header);

  const metricHeading = document.createElement('div');
  metricHeading.textContent = `${metricLabel}${continuation ? ' (continued)' : ''}`;
  setStyles(metricHeading, { fontSize: '14px', fontWeight: '700', marginBottom: '7px', color: '#1b5965' });
  page.appendChild(metricHeading);

  const table = document.createElement('table');
  setStyles(table, {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    border: CELL_BORDER,
  });
  const headers = [
    'Portfolio',
    ...spec.countHeaders,
    `Week ending ${week(report.previousWeek)}`,
    `Week ending ${week(report.currentWeek)}`,
    'WoW Progress',
    'Comments',
  ];
  const colgroup = document.createElement('colgroup');
  headers.forEach((_, index) => {
    const col = document.createElement('col');
    col.style.width = index === 0 ? '17%' : index === headers.length - 1 ? '29%' : `${54 / (headers.length - 2)}%`;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const tableTitleRow = document.createElement('tr');
  const tableTitle = document.createElement('th');
  tableTitle.colSpan = headers.length;
  tableTitle.textContent = spec.title;
  setStyles(tableTitle, {
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: '11px',
    lineHeight: '1.25',
    color: '#172033',
    background: '#edf2f7',
    border: CELL_BORDER,
  });
  tableTitleRow.appendChild(tableTitle);
  thead.appendChild(tableTitleRow);
  const headerRow = document.createElement('tr');
  headers.forEach((headerText, index) => {
    const cell = document.createElement('th');
    cell.textContent = headerText;
    setStyles(cell, {
      padding: '7px 6px',
      fontSize: '9px',
      lineHeight: '1.2',
      fontWeight: '700',
      textAlign: index === 0 || index === headers.length - 1 ? 'left' : 'center',
      verticalAlign: 'middle',
      color: '#172033',
      background: '#b4c6e7',
      border: CELL_BORDER,
    });
    headerRow.appendChild(cell);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const summaryComments = buildQcoeSummaryComments({ ...spec, rows: spec.rows });
  const regularRows = rows.filter((row) => !row.isGrandTotal);
  rows.forEach((dataRow, rowIndex) => {
    const tr = document.createElement('tr');
    const total = Boolean(dataRow.isGrandTotal);
    setStyles(tr, { background: total ? '#b4c6e7' : rowIndex % 2 ? '#f7f9fc' : '#ffffff' });
    addCell(tr, dataRow.label, { fontWeight: total ? '700' : '600', whiteSpace: 'normal' });
    dataRow.counts.forEach((value) => addCell(tr, formatTcoeNumber(value), { textAlign: 'center', fontWeight: total ? '700' : '400' }));
    addCell(tr, formatTcoeValue(dataRow.previous, dataRow.mode), { textAlign: 'center', fontWeight: '700', ...statusStyle(dataRow, dataRow.previous) });
    addCell(tr, formatTcoeValue(dataRow.current, dataRow.mode), { textAlign: 'center', fontWeight: '700', ...statusStyle(dataRow, dataRow.current) });
    addCell(tr, formatTcoeChange(dataRow.progress), { textAlign: 'center', fontWeight: '700', ...statusStyle(dataRow, dataRow.progress, true) });

    if (!total && regularRows[0] === dataRow) {
      const commentCell = addCell(tr, '', {
        verticalAlign: 'middle',
        background: '#ffffff',
        padding: '0',
        border: CELL_BORDER,
        position: 'relative',
      });
      commentCell.rowSpan = regularRows.length;
      const commentPanel = document.createElement('div');
      setStyles(commentPanel, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        boxSizing: 'border-box',
        background: '#ffffff',
        overflow: 'hidden',
      });
      const list = document.createElement('ul');
      setStyles(list, { width: '100%', margin: '0', paddingLeft: '17px', fontSize: '10px', lineHeight: '1.35', color: '#253247' });
      summaryComments.slice(0, 3).forEach((comment) => {
        const item = document.createElement('li');
        item.textContent = comment;
        item.style.marginBottom = '8px';
        list.appendChild(item);
      });
      commentPanel.appendChild(list);
      commentCell.appendChild(commentPanel);
    }
    if (total) addCell(tr, '', { background: '#b4c6e7', border: CELL_BORDER });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  page.appendChild(table);

  const footer = document.createElement('footer');
  footer.className = 'qcoe-export-page-footer';
  setStyles(footer, { marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #d0d5dd', fontSize: '9px', color: '#667085', textAlign: 'right' });
  page.appendChild(footer);
  return page;
};

const buildPages = (report: QcoeExportReport) => {
  const pages: HTMLElement[] = [];
  report.metrics.forEach((metric) => {
    metric.tables.forEach((spec) => {
      splitRows(spec.rows).forEach((rows, index) => {
        pages.push(createReportPage(report, metric.label, spec, rows, index > 0));
      });
    });
  });
  pages.forEach((page, index) => {
    const footer = page.querySelector<HTMLElement>('.qcoe-export-page-footer');
    if (footer) footer.textContent = `Page ${index + 1} of ${pages.length}`;
  });
  return pages;
};

interface RenderedReportPage {
  canvas: HTMLCanvasElement;
  compactHeight: number;
}

const renderPages = async (report: QcoeExportReport): Promise<RenderedReportPage[]> => {
  if (!report.metrics.length) throw new Error('No completed metrics are currently available to export.');
  const host = document.createElement('div');
  setStyles(host, { position: 'fixed', left: '-20000px', top: '0', zIndex: '-1', background: '#ffffff' });
  const pages = buildPages(report);
  pages.forEach((page) => host.appendChild(page));
  document.body.appendChild(host);
  try {
    return await Promise.all(pages.map(async (page) => {
      const pageRect = page.getBoundingClientRect();
      const tableBottom = page.querySelector('table')?.getBoundingClientRect().bottom || pageRect.bottom;
      const compactCssHeight = Math.min(PAGE_HEIGHT, Math.ceil(tableBottom - pageRect.top + 24));
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        windowWidth: PAGE_WIDTH,
        windowHeight: PAGE_HEIGHT,
        logging: false,
      });
      return {
        canvas,
        compactHeight: Math.min(canvas.height, Math.ceil(compactCssHeight * (canvas.width / PAGE_WIDTH))),
      };
    }));
  } finally {
    host.remove();
  }
};

export const exportQcoeDashboardPDF = async (report: QcoeExportReport, filename: string) => {
  const pages = await renderPages(report);
  const pdf = new jsPDF('l', 'mm', 'a4');
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pages.forEach(({ canvas }, index) => {
    if (index > 0) pdf.addPage('a4', 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, width, height, undefined, 'FAST');
  });
  pdf.save(filename);
};

export const exportQcoeDashboardJPG = async (report: QcoeExportReport, filenameStem: string) => {
  const pages = await renderPages(report);
  const image = document.createElement('canvas');
  image.width = pages[0].canvas.width;
  image.height = pages.reduce((height, page) => height + page.compactHeight, 0);
  const context = image.getContext('2d');
  if (!context) throw new Error('Unable to create the QCOE image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, image.width, image.height);
  let y = 0;
  pages.forEach(({ canvas, compactHeight }) => {
    context.drawImage(canvas, 0, 0, canvas.width, compactHeight, 0, y, canvas.width, compactHeight);
    y += compactHeight;
  });
  const link = document.createElement('a');
  link.download = `${filenameStem}.jpg`;
  link.href = image.toDataURL('image/jpeg', 0.96);
  document.body.appendChild(link);
  link.click();
  link.remove();
};
