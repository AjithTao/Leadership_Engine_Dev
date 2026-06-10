"""
TCOE Metrics Single-Page PDF Generator

Generates one-page PDFs for individual TCOE metrics with proper formatting
and layout to fit all content on a single A4/Letter page.
"""

import io
import json
from datetime import datetime
from typing import Any, Dict, Optional, List
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


class TCOEMetricPDFGenerator:
    """Generate single-page PDFs for TCOE metrics"""
    
    def __init__(self, page_size=letter):
        """Initialize PDF generator with page size (letter or A4)"""
        self.page_size = page_size
        self.width, self.height = page_size
        # Set margins to maximize usable space
        self.left_margin = 0.4 * inch
        self.right_margin = 0.4 * inch
        self.top_margin = 0.4 * inch
        self.bottom_margin = 0.4 * inch
        
    def _get_styles(self):
        """Get custom style sheet for TCOE metrics"""
        styles = getSampleStyleSheet()
        
        # Title style
        styles.add(ParagraphStyle(
            name='TCOETitle',
            parent=styles['Heading1'],
            fontSize=14,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=6,
            alignment=TA_CENTER,
            keepWithNext=True
        ))
        
        # Metric label style
        styles.add(ParagraphStyle(
            name='MetricLabel',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#4b5563'),
            spaceAfter=3,
            alignment=TA_CENTER
        ))
        
        # Table header style
        styles.add(ParagraphStyle(
            name='TableHeader',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=2
        ))
        
        # Table cell style
        styles.add(ParagraphStyle(
            name='TableCell',
            parent=styles['Normal'],
            fontSize=8,
            fontName='Helvetica',
            alignment=TA_CENTER,
            spaceAfter=1
        ))
        
        # Portfolio name style
        styles.add(ParagraphStyle(
            name='PortfolioName',
            parent=styles['Normal'],
            fontSize=8.5,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
            spaceAfter=1
        ))
        
        # Footer style
        styles.add(ParagraphStyle(
            name='Footer',
            parent=styles['Normal'],
            fontSize=7,
            textColor=colors.HexColor('#9ca3af'),
            alignment=TA_CENTER,
            spaceAfter=0
        ))
        
        # Period info style
        styles.add(ParagraphStyle(
            name='PeriodInfo',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#6b7280'),
            alignment=TA_CENTER,
            spaceAfter=2
        ))
        
        return styles
    
    def _get_metric_columns(self, metric_key: str) -> List[tuple]:
        """
        Return the preferred columns for each metric type.
        Each tuple is (data_key, display_header).
        These match exactly what the UI displays.
        """
        # These columns match the UI's tcoeDashboardTables.ts logic
        metric_columns = {
            'test_coverage': [
                # UI shows: # of Dev Stories, # Test Cases Created, Previous %, Current %, WoW
            ],
            'test_review_status': [
                # UI shows: # Reviewed, # Total Stories, Previous %, Current %, WoW
            ],
            'test_story_ratio': [
                # UI shows: # Test Cases Created, # Closed Dev Stories, Previous ratio, Current ratio, WoW
            ],
            'bug_ratio': [
                # UI shows: Test Cases, Bugs Written, Previous %, Current %, WoW
            ],
            'defect_leakage': [
                # UI shows: CY25 Defects, CY26 Defects, Previous %, Current %, WoW
            ],
            'overall_automation': [
                # UI shows: Automated, Requires Automation, Automation Not Required, Previous %, Current %, WoW
            ],
            'regression_automation': [
                # UI shows: same as overall_automation
            ],
        }
        return metric_columns.get(metric_key, [])
    
    def _extract_metric_table_data(self, metric: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract the display data from metrics the same way the UI does.
        Returns headers and rows matching the UI's tcoeDashboardTables.ts output.
        """
        metric_key = metric.get('metric', metric.get('key', ''))
        rows = metric.get('rows', [])
        
        if not rows:
            return {'headers': ['Portfolio'], 'rows': [], 'title': metric.get('label', '')}
        
        # Build table data matching UI logic
        if metric_key == 'test_coverage':
            return self._build_coverage_table(rows, 'table_a')
        elif metric_key == 'test_review_status':
            return self._build_review_status_table(rows)
        elif metric_key == 'test_story_ratio':
            return self._build_ratio_table(rows)
        elif metric_key == 'bug_ratio':
            return self._build_bug_ratio_table(rows)
        elif metric_key == 'defect_leakage':
            return self._build_defect_leakage_table(rows)
        elif metric_key in ('overall_automation', 'regression_automation'):
            return self._build_automation_table(rows, 'table_a')
        else:
            return {'headers': ['Portfolio'], 'rows': [], 'title': metric.get('label', '')}
    
    def _safe_number(self, value: Any) -> float:
        """Convert value to number safely"""
        if value is None:
            return 0.0
        try:
            num = float(value)
            return num if not (num != num) else 0.0  # Check for NaN
        except (ValueError, TypeError):
            return 0.0
    
    def _pct(self, numerator: float, denominator: float) -> float:
        """Calculate percentage"""
        return (numerator / denominator * 100) if denominator > 0 else 0.0
    
    def _build_coverage_table(self, rows: List[Dict], table_key: str = 'table_a') -> Dict[str, Any]:
        """Build Stories to Test Cases Mapping table"""
        headers = ['Portfolio', '# Dev Stories', '# Test Cases', 'Prev %', 'Curr %', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', row.get('portfolio_display', 'Unknown'))
            table = row.get(table_key, {})
            p2 = table.get('period2', table.get('period', row.get('period2', row.get('period', {}))))
            p1 = table.get('period1', row.get('period1', {}))
            
            dev_stories = self._safe_number(p2.get('dev_stories', p2.get('total_stories', row.get('total_stories', 0))))
            test_cases = self._safe_number(p2.get('test_cases_created', p2.get('total_test_cases', row.get('total_test_cases', 0))))
            
            prev_with_tests = self._safe_number(p1.get('stories_with_tests', 0))
            prev_total = self._safe_number(p1.get('total_stories', 0))
            curr_with_tests = self._safe_number(p2.get('stories_with_tests', 0))
            curr_total = self._safe_number(p2.get('total_stories', dev_stories))
            
            prev_pct = self._safe_number(p1.get('coverage_percentage')) or self._pct(prev_with_tests, prev_total)
            curr_pct = self._safe_number(p2.get('coverage_percentage')) or self._pct(curr_with_tests, curr_total)
            wow = curr_pct - prev_pct
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': [
                    int(dev_stories),
                    int(test_cases),
                    f"{prev_pct:.1f}%",
                    f"{curr_pct:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Stories to Test Cases Mapping'}
    
    def _build_review_status_table(self, rows: List[Dict]) -> Dict[str, Any]:
        """Build Test Cases Review Status table"""
        headers = ['Portfolio', '# Reviewed', '# Total', 'Prev %', 'Curr %', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', 'Unknown')
            p2 = row.get('period2', row.get('period', {}))
            p1 = row.get('period1', {})
            
            curr_reviewed = self._safe_number(p2.get('reviewed_yes', 0))
            curr_total = self._safe_number(p2.get('reviewed_yes', 0)) + self._safe_number(p2.get('reviewed_no', 0)) + self._safe_number(p2.get('not_set', 0))
            if curr_total == 0:
                curr_total = self._safe_number(row.get('total_stories', 0))
            
            prev_reviewed = self._safe_number(p1.get('reviewed_yes', 0))
            prev_total = self._safe_number(p1.get('reviewed_yes', 0)) + self._safe_number(p1.get('reviewed_no', 0)) + self._safe_number(p1.get('not_set', 0))
            
            prev_pct = self._safe_number(p1.get('review_percentage')) or self._pct(prev_reviewed, prev_total)
            curr_pct = self._safe_number(p2.get('review_percentage')) or self._pct(curr_reviewed, curr_total)
            wow = curr_pct - prev_pct
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': [
                    int(curr_reviewed),
                    int(curr_total),
                    f"{prev_pct:.1f}%",
                    f"{curr_pct:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Test Cases Review Status'}
    
    def _build_ratio_table(self, rows: List[Dict]) -> Dict[str, Any]:
        """Build Test:Story Ratio table"""
        headers = ['Portfolio', '# Tests', '# Stories', 'Prev', 'Curr', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', 'Unknown')
            p2 = row.get('period2', row.get('period', {}))
            p1 = row.get('period1', {})
            
            test_cases = self._safe_number(p2.get('total_test_cases', 0))
            stories = self._safe_number(p2.get('total_stories', 0))
            
            prev_ratio = self._safe_number(p1.get('ratio', 0))
            curr_ratio = self._safe_number(p2.get('ratio', 0))
            wow = (curr_ratio - prev_ratio) * 100
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': [
                    int(test_cases),
                    int(stories),
                    f"{prev_ratio:.2f}",
                    f"{curr_ratio:.2f}",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Test:Story Ratio'}
    
    def _build_bug_ratio_table(self, rows: List[Dict]) -> Dict[str, Any]:
        """Build Bugs/Test Case table"""
        headers = ['Portfolio', 'Tests Exec', 'Bugs Found', 'Prev %', 'Curr %', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', 'Unknown')
            p2 = row.get('period2', row.get('period', {}))
            p1 = row.get('period1', {})
            
            tests_executed = self._safe_number(p2.get('test_cases_executed', 0))
            bugs_found = self._safe_number(p2.get('bugs_found', 0))
            
            prev_ratio = self._safe_number(p1.get('ratio', 0)) * 100
            curr_ratio = self._safe_number(p2.get('ratio', 0)) * 100
            wow = curr_ratio - prev_ratio
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': [
                    int(tests_executed),
                    int(bugs_found),
                    f"{prev_ratio:.1f}%",
                    f"{curr_ratio:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Bugs/Test Case'}
    
    def _build_defect_leakage_table(self, rows: List[Dict]) -> Dict[str, Any]:
        """Build Weekly Defect Inflow (YoY) table"""
        headers = ['Portfolio', 'CY25', 'CY26', 'Prev %', 'Curr %', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', 'Unknown')
            p2 = row.get('period2', row.get('period', {}))
            p1 = row.get('period1', {})
            
            curr_cy25 = self._safe_number(p2.get('cy25_defects', p2.get('bugs_count', 0)))
            curr_cy26 = self._safe_number(p2.get('cy26_defects', p2.get('defects_count', 0)))
            prev_cy25 = self._safe_number(p1.get('cy25_defects', p1.get('bugs_count', 0)))
            prev_cy26 = self._safe_number(p1.get('cy26_defects', p1.get('defects_count', 0)))
            
            def calc_inflow(cy25, cy26):
                if cy25 > 0:
                    return ((cy26 - cy25) / cy25) * 100
                return 100 if cy26 > 0 else 0
            
            prev_pct = self._safe_number(p1.get('defect_inflow_percentage', p1.get('leakage_percentage'))) or calc_inflow(prev_cy25, prev_cy26)
            curr_pct = self._safe_number(p2.get('defect_inflow_percentage', p2.get('leakage_percentage'))) or calc_inflow(curr_cy25, curr_cy26)
            wow = curr_pct - prev_pct
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': [
                    int(curr_cy25),
                    int(curr_cy26),
                    f"{prev_pct:.1f}%",
                    f"{curr_pct:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Weekly Defect Inflow (YoY)'}
    
    def _build_automation_table(self, rows: List[Dict], table_key: str = 'table_a') -> Dict[str, Any]:
        """Build Overall/Regression Automation Status table"""
        if table_key == 'table_a':
            headers = ['Portfolio', 'Automated', 'Requires Automation', 'Automation Not Required', 'Prev %', 'Curr %', 'WoW']
        else:
            headers = ['Portfolio', 'Automated', 'Requires Automation', 'Prev %', 'Curr %', 'WoW']
        table_rows = []
        
        for row in rows:
            portfolio = row.get('portfolio', 'Unknown')
            table = row.get(table_key, {})
            p2 = table.get('period2', table.get('period', row.get('period2', row.get('period', {}))))
            p1 = table.get('period1', row.get('period1', {}))
            
            automated = self._safe_number(p2.get('automated', p2.get('automated_count', 0)))
            requires = self._safe_number(p2.get('requires_automation', p2.get('manual_count', 0)))
            not_required = self._safe_number(p2.get('automation_not_required', 0))
            
            if table_key == 'table_a':
                curr_total = self._safe_number(p2.get('total', automated + requires + not_required))
                prev_total = self._safe_number(p1.get('total', 0))
            else:
                curr_total = self._safe_number(p2.get('automatable', automated + requires))
                prev_total = self._safe_number(p1.get('automatable', 0))
            
            prev_automated = self._safe_number(p1.get('automated', p1.get('automated_count', 0)))
            
            prev_pct = self._safe_number(p1.get('automation_percentage')) or self._pct(prev_automated, prev_total)
            curr_pct = self._safe_number(p2.get('automation_percentage')) or self._pct(automated, curr_total)
            wow = curr_pct - prev_pct
            
            if table_key == 'table_a':
                fields = [
                    int(automated),
                    int(requires),
                    int(not_required),
                    f"{prev_pct:.1f}%",
                    f"{curr_pct:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            else:
                fields = [
                    int(automated),
                    int(requires),
                    f"{prev_pct:.1f}%",
                    f"{curr_pct:.1f}%",
                    f"{'+' if wow >= 0 else ''}{wow:.1f}%"
                ]
            
            table_rows.append({
                'portfolio': portfolio,
                'metric_fields': fields
            })
        
        return {'headers': headers, 'rows': table_rows, 'title': 'Automation Status'}
    
    def _create_metric_table(self, metric_data: Dict[str, Any], styles) -> Table:
        """
        Create a compact table for metric rows
        
        Expected metric_data structure:
        {
            'rows': [
                {
                    'portfolio': 'Portfolio Name',
                    'metric_fields': [value1, value2, ...],
                    'status': 'green|yellow|red'
                }
            ]
        }
        """
        rows = metric_data.get('rows', [])
        headers = metric_data.get('headers', [])
        
        if not rows:
            return Table([[Paragraph('No data available', styles['TableCell'])]])
        
        # Build table data
        table_data = []
        
        # Add headers if provided
        if headers:
            header_cells = []
            for header in headers:
                header_cells.append(Paragraph(str(header), styles['TableHeader']))
            table_data.append(header_cells)
        
        # Add data rows (limit to fit on page)
        max_rows = 15 if headers else 18  # Leave room for headers and footer
        for i, row in enumerate(rows[:max_rows]):
            if i >= max_rows:
                break
                
            row_cells = []
            
            # Portfolio name
            portfolio = row.get('portfolio', '')
            row_cells.append(Paragraph(str(portfolio)[:20], styles['PortfolioName']))
            
            # Metric values
            metric_values = row.get('metric_fields', [])
            for value in metric_values[:6]:  # Limit columns for single page
                if isinstance(value, (int, float)):
                    # Format numbers
                    if isinstance(value, float) and value != int(value):
                        formatted = f"{value:.1f}"
                    else:
                        formatted = str(int(value))
                else:
                    formatted = str(value)[:15]
                
                row_cells.append(Paragraph(formatted, styles['TableCell']))
            
            table_data.append(row_cells)
        
        # If no headers, add generic ones
        if not table_data:
            table_data = [[Paragraph('No data', styles['TableCell'])]]
        
        # Create table with optimized style for single page
        col_widths = [1.2 * inch] + [0.7 * inch] * (len(table_data[0]) - 1) if table_data else [letter[0] - 0.8 * inch]
        
        table = Table(table_data, colWidths=col_widths)
        
        # Apply table styling
        table.setStyle(TableStyle([
            # Header style
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 0), (-1, 0), 4),
            
            # Alternate row colors
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
            
            # Cell styling
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 1), (-1, -1), 4),
            ('RIGHTPADDING', (0, 1), (-1, -1), 4),
            ('TOPPADDING', (0, 1), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#2563eb')),
        ]))
        
        return table
    
    def _format_metric_value(self, value: Any) -> str:
        """Format metric value for display"""
        if value is None:
            return '-'
        # Skip complex types - these are config/technical data, not metrics
        if isinstance(value, (dict, list)):
            return '-'
        if isinstance(value, float):
            if value == int(value):
                return str(int(value))
            # Check if it looks like a percentage
            if 0 <= value <= 100:
                return f"{value:.1f}%"
            return f"{value:.2f}"
        if isinstance(value, int):
            return str(value)
        # For strings, truncate if too long
        str_val = str(value)
        if len(str_val) > 20:
            return str_val[:17] + '...'
        return str_val
    
    def generate_metric_pdf(self, metric: Dict[str, Any]) -> bytes:
        """
        Generate a single-page PDF for a TCOE metric
        
        Args:
            metric: Metric data with structure:
                {
                    'metric': 'test_coverage',
                    'label': 'Stories to Test Cases Mapping',
                    'description': '...',
                    'period1': {...},
                    'period2': {...},
                    'rows': [{...}],
                    'pi_context': {...}
                }
        
        Returns:
            PDF bytes
        """
        # Create PDF in memory
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.page_size,
            leftMargin=self.left_margin,
            rightMargin=self.right_margin,
            topMargin=self.top_margin,
            bottomMargin=self.bottom_margin,
            title=metric.get('label', 'TCOE Metric'),
            author='FalconX TCOE'
        )
        
        styles = self._get_styles()
        story = []
        
        # Title
        title = metric.get('label', 'TCOE Metric')
        story.append(Paragraph(title, styles['TCOETitle']))
        story.append(Spacer(1, 4))
        
        # Description
        description = metric.get('description', '')
        if description:
            story.append(Paragraph(description, styles['MetricLabel']))
            story.append(Spacer(1, 4))
        
        # Use the new method to extract properly formatted table data matching UI
        table_data = self._extract_metric_table_data(metric)
        
        if table_data.get('rows'):
            # Create and add table
            table = self._create_metric_table(table_data, styles)
            story.append(table)
        
        # Add footer
        story.append(Spacer(1, 10))
        footer_text = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Metric: {metric.get('metric', 'N/A')}"
        story.append(Paragraph(footer_text, styles['Footer']))
        
        # Build PDF
        try:
            doc.build(story)
        except Exception as e:
            # If build fails, try with smaller font sizes
            styles['TCOETitle'].fontSize = 12
            styles['MetricLabel'].fontSize = 9
            styles['TableCell'].fontSize = 7
            doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes
    
    def generate_dual_table_metric_pdf(self, metric: Dict[str, Any]) -> bytes:
        """
        Generate PDF for metrics with dual tables (table_a and table_b)
        
        These metrics show different perspectives of the same data on one page
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.page_size,
            leftMargin=self.left_margin,
            rightMargin=self.right_margin,
            topMargin=self.top_margin,
            bottomMargin=self.bottom_margin,
            title=metric.get('label', 'TCOE Metric'),
            author='FalconX TCOE'
        )
        
        styles = self._get_styles()
        story = []
        
        # Title
        title = metric.get('label', 'TCOE Metric')
        story.append(Paragraph(title, styles['TCOETitle']))
        story.append(Spacer(1, 3))
        
        # Description
        description = metric.get('description', '')
        if description:
            story.append(Paragraph(description, styles['MetricLabel']))
            story.append(Spacer(1, 4))
        
        metric_key = metric.get('metric', metric.get('key', ''))
        rows = metric.get('rows', [])
        
        # Table A - extract using proper method
        if rows:
            if metric_key == 'test_coverage':
                table_data_a = self._build_coverage_table(rows, 'table_a')
            elif metric_key in ('overall_automation', 'regression_automation'):
                table_data_a = self._build_automation_table(rows, 'table_a')
            else:
                table_data_a = self._extract_metric_table_data(metric)
            
            if table_data_a.get('rows'):
                table_title_a = table_data_a.get('title', 'Current Period')
                story.append(Paragraph(f"<b>{table_title_a}</b>", styles['MetricLabel']))
                story.append(Spacer(1, 2))
                table_obj_a = self._create_metric_table(table_data_a, styles)
                story.append(table_obj_a)
                story.append(Spacer(1, 6))
        
        # Table B - extract using proper method (cumulative/automatable view)
        if rows and metric_key in ('test_coverage', 'overall_automation', 'regression_automation'):
            if metric_key == 'test_coverage':
                table_data_b = self._build_coverage_table(rows, 'table_b')
                table_data_b['title'] = 'Cumulative (CY24+CY25+CY26)'
            else:
                table_data_b = self._build_automation_table(rows, 'table_b')
                table_data_b['title'] = 'Against Automatable Volume'
            
            if table_data_b.get('rows'):
                story.append(Paragraph(f"<b>{table_data_b.get('title', 'Table B')}</b>", styles['MetricLabel']))
                story.append(Spacer(1, 2))
                table_obj_b = self._create_metric_table(table_data_b, styles)
                story.append(table_obj_b)
        
        # Add footer
        story.append(Spacer(1, 10))
        footer_text = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Metric: {metric.get('metric', 'N/A')}"
        story.append(Paragraph(footer_text, styles['Footer']))
        
        # Build PDF
        try:
            doc.build(story)
        except Exception as e:
            # If build fails, reduce sizes
            styles['TCOETitle'].fontSize = 11
            styles['TableCell'].fontSize = 6.5
            doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes


# Convenience functions

def generate_tcoe_metric_pdf(metric: Dict[str, Any], page_size=letter) -> bytes:
    """Generate PDF for a single TCOE metric"""
    generator = TCOEMetricPDFGenerator(page_size=page_size)
    
    # Check if metric has dual tables
    if metric.get('table_a') or metric.get('table_b'):
        return generator.generate_dual_table_metric_pdf(metric)
    
    return generator.generate_metric_pdf(metric)


def generate_tcoe_metrics_individual_pdfs(metrics: List[Dict[str, Any]], page_size=letter) -> Dict[str, bytes]:
    """
    Generate individual PDFs for multiple metrics
    
    Returns:
        Dictionary with metric keys as keys and PDF bytes as values
    """
    generator = TCOEMetricPDFGenerator(page_size=page_size)
    pdfs = {}
    
    for metric in metrics:
        metric_key = metric.get('metric', metric.get('key', 'unknown'))
        
        try:
            if metric.get('table_a') or metric.get('table_b'):
                pdfs[metric_key] = generator.generate_dual_table_metric_pdf(metric)
            else:
                pdfs[metric_key] = generator.generate_metric_pdf(metric)
        except Exception as e:
            logger.error(f"Failed to generate PDF for metric {metric_key}: {e}")
            # Continue with other metrics
    
    return pdfs


import logging
logger = logging.getLogger(__name__)
