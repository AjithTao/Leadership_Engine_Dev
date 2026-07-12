'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TcoeTableRow, TcoeTableSpec, formatTcoeChange, formatTcoeNumber, formatTcoeValue } from '../utils/tcoeDashboardTables';
import { buildQcoePortfolioAnalysis, buildQcoeSummaryComments } from '../utils/qcoeInsights';

const week = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
};

export function QcoeMetricTable({ spec, previousWeek, currentWeek, portfolioFilter }: {
  spec: TcoeTableSpec;
  previousWeek: string;
  currentWeek: string;
  portfolioFilter?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = portfolioFilter
    ? spec.rows.filter((row) => row.isGrandTotal || row.label.toLowerCase().includes(portfolioFilter.toLowerCase()))
    : spec.rows;
  const comments = useMemo(() => buildQcoeSummaryComments({ ...spec, rows }), [spec, rows]);
  const regularRows = rows.filter((row) => !row.isGrandTotal);
  const commentRowSpan = regularRows.length + regularRows.filter((row) => expanded.has(row.label)).length;
  const headers = ['Portfolio', ...spec.countHeaders, `Week ending ${week(previousWeek)}`, `Week ending ${week(currentWeek)}`, 'WoW Progress', 'Comments'];

  const tone = (row: TcoeTableRow, value: number, progress = false) => {
    const good = progress ? (row.lowerIsBetter ? value < 0 : value > 0) : (row.lowerIsBetter ? value <= 5 : value >= 90);
    const risk = progress ? (row.lowerIsBetter ? value > 0 : value < 0) : (row.lowerIsBetter ? value > 10 : value < 70);
    return good ? { background: 'var(--green-bg)', color: 'var(--green)' }
      : risk ? { background: 'var(--red-bg)', color: 'var(--red)' }
      : { background: 'var(--amber-bg)', color: 'var(--amber)' };
  };

  return (
    <div className="qcoe-metric-table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)' }}>
      <table className="qcoe-metric-table" style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr><th colSpan={headers.length} style={{ padding: '12px 14px', textAlign: 'left', background: 'var(--bg-active)', border: '1px solid var(--border)', fontWeight: 800 }}>{spec.title}</th></tr>
          <tr>
            {headers.map((header, index) => <th key={`${header}-${index}`} style={{ padding: '10px 9px', textAlign: index === 0 || index === headers.length - 1 ? 'left' : 'center', background: '#b4c6e7', color: '#172033', border: '1px solid #98a8c2', fontWeight: 800, minWidth: index === headers.length - 1 ? 330 : undefined }}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isOpen = expanded.has(row.label);
            const analysis = !row.isGrandTotal ? buildQcoePortfolioAnalysis(spec, row) : null;
            const firstRegular = !row.isGrandTotal && regularRows[0]?.label === row.label;
            return (
              <React.Fragment key={`${spec.title}-${row.label}-${rowIndex}`}>
                <tr style={{ background: row.isGrandTotal ? '#b4c6e7' : rowIndex % 2 ? 'var(--bg-surface)' : 'var(--bg-card)', fontWeight: row.isGrandTotal ? 800 : 600 }}>
                  <td style={{ padding: '9px 10px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {!row.isGrandTotal && <button type="button" data-html2canvas-ignore="true" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${row.label} analysis`} onClick={() => setExpanded((current) => { const next = new Set(current); next.has(row.label) ? next.delete(row.label) : next.add(row.label); return next; })} style={{ border: 0, padding: 0, marginRight: 5, background: 'transparent', color: 'inherit', cursor: 'pointer', verticalAlign: 'middle' }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>}
                    {row.label}
                  </td>
                  {row.counts.map((value, index) => <td key={index} style={{ padding: '9px', textAlign: 'center', border: '1px solid var(--border)' }}>{formatTcoeNumber(value)}</td>)}
                  <td style={{ padding: '9px', textAlign: 'center', border: '1px solid var(--border)', ...tone(row, row.previous) }}>{formatTcoeValue(row.previous, row.mode)}</td>
                  <td style={{ padding: '9px', textAlign: 'center', border: '1px solid var(--border)', ...tone(row, row.current) }}>{formatTcoeValue(row.current, row.mode)}</td>
                  <td style={{ padding: '9px', textAlign: 'center', border: '1px solid var(--border)', ...tone(row, row.progress, true) }}>{formatTcoeChange(row.progress)}</td>
                  {firstRegular && <td rowSpan={commentRowSpan} style={{ padding: '14px 16px', border: '1px solid var(--border)', verticalAlign: 'middle', background: 'var(--bg-card)', minWidth: 330 }}><ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, lineHeight: 1.45 }}>{comments.map((comment) => <li key={comment}>{comment}</li>)}</ul></td>}
                  {row.isGrandTotal && <td style={{ border: '1px solid var(--border)', background: '#b4c6e7' }} />}
                </tr>
                {isOpen && analysis && <tr data-html2canvas-ignore="true" className="qcoe-analysis-row"><td colSpan={headers.length - 1} style={{ padding: 0, border: '1px solid var(--border)', background: 'var(--blue-bg)' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '14px 22px' }}><div><strong style={{ color: 'var(--blue)' }}>Root Cause / Issue Evidence</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>{analysis.rootCauses.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong style={{ color: 'var(--blue)' }}>Action Items</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>{analysis.actionItems.map((item) => <li key={item}>{item}</li>)}</ul></div></div></td></tr>}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
