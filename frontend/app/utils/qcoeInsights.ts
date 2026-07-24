import { TcoeTableRow, TcoeTableSpec } from './tcoeDashboardTables';

export function buildQcoeSummaryComments(spec: TcoeTableSpec): string[] {
  const comments = spec.aiInsight?.status === 'available' ? spec.aiInsight.export_comments : null;
  return comments
    ? [comments.issue_portfolio_recommendation, comments.best_portfolio_summary, comments.overall_recommendation]
    : ['AI insight unavailable.'];
}

export function buildQcoePortfolioAnalysis(spec: TcoeTableSpec, row: TcoeTableRow) {
  const insight = spec.aiInsight?.status === 'available' ? spec.aiInsight.portfolios?.[row.label] : null;
  return {
    rootCauses: insight?.root_causes?.slice(0, 2) || ['AI insight unavailable.'],
    actionItems: insight?.action_items?.slice(0, 2) || ['AI insight unavailable.'],
  };
}
