/**
 * QCOE PDF Export Utilities
 * 
 * Generates professional QCOE Weekly Status Reports matching the
 * TAO Digital Solutions format specification.
 * 
 * References:
 * - QCOE_PDF_FORMAT_SPECIFICATION.md
 * - _qcoe-report-pdf.scss
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Color palette for QCOE reports
 */
export const QCOE_COLORS = {
  // Primary
  primaryTeal: { r: 27, g: 127, b: 143 },      // #1B7F8F
  headerLavender: { r: 232, g: 228, b: 240 },  // #E8E4F0
  grandTotalBlue: { r: 176, g: 212, b: 227 },  // #B0D4E3
  
  // Performance Status
  bgGood: { r: 232, g: 245, b: 233 },          // #E8F5E9
  bgWarning: { r: 255, g: 243, b: 224 },       // #FFF3E0
  bgPoor: { r: 255, g: 235, b: 238 },          // #FFEBEE
  
  // Text
  textPrimary: { r: 51, g: 51, b: 51 },        // #333333
  textSecondary: { r: 66, g: 66, b: 66 },      // #424242
  textLight: { r: 102, g: 102, b: 102 },       // #666666
  textGreen: { r: 46, g: 125, b: 50 },         // #2E7D32
  textRed: { r: 198, g: 40, b: 40 },           // #C62828
  textWhite: { r: 255, g: 255, b: 255 },       // #FFFFFF
  
  // Borders
  borderLight: { r: 189, g: 189, b: 189 },     // #BDBDBD
  borderSubtle: { r: 224, g: 224, b: 224 },    // #E0E0E0
};

/**
 * Color thresholds for performance metrics
 */
export const PERFORMANCE_THRESHOLDS = {
  // Standard percentage metrics (>90% = Good, 70-90% = Warning, <70% = Poor)
  percentage: {
    good: 90,
    warning: 70,
  },
  // Automation metrics (>85% = Good, 40-85% = Warning, <40% = Poor)
  automation: {
    good: 85,
    warning: 40,
  },
  // Bug density metrics (>15% = Good, 5-15% = Warning, <5% = Poor)
  bugDensity: {
    good: 15,
    warning: 5,
  },
  // Test coverage mapping (>100% = Good, 70-100% = Warning, <70% = Poor)
  testMapping: {
    good: 100,
    warning: 70,
  },
};

/**
 * Determines the status color for a metric value
 * @param value - The numeric value (percentage)
 * @param thresholdType - The threshold set to use ('percentage', 'automation', 'bugDensity', 'testMapping')
 * @returns Color object and status string
 */
export function getMetricStatus(value: number, thresholdType: keyof typeof PERFORMANCE_THRESHOLDS = 'percentage') {
  const threshold = PERFORMANCE_THRESHOLDS[thresholdType];
  
  if (value >= threshold.good) {
    return { color: QCOE_COLORS.bgGood, status: 'good' };
  } else if (value >= threshold.warning) {
    return { color: QCOE_COLORS.bgWarning, status: 'warning' };
  } else {
    return { color: QCOE_COLORS.bgPoor, status: 'poor' };
  }
}

/**
 * Determines text color for WoW progress
 */
export function getProgressTextColor(value: number) {
  if (value > 0) {
    return QCOE_COLORS.textGreen;
  } else if (value < 0) {
    return QCOE_COLORS.textRed;
  } else {
    return QCOE_COLORS.textLight;
  }
}

/**
 * Enhanced PDF export for QCOE reports
 * Replaces the generic exportTcoeReportAsPDF with professional formatting
 */
export const exportQCOEReportAsPDF = async (
  elementId: string,
  filename: string = 'QCOE-Weekly-Status-Report.pdf',
  reportDate?: string
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  // Store original styles
  const originalStyles = {
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
    overflow: element.style.overflow,
    height: element.style.height,
    padding: element.style.padding,
  };

  try {
    // Prepare element for export
    element.style.backgroundColor = '#FFFFFF';
    element.style.overflow = 'visible';
    element.style.width = '100%';
    element.style.padding = '0';

    // Add print-mode class to trigger print styles
    element.classList.add('qcoe-pdf-export');

    // Capture with high quality
    const canvas = await html2canvas(element, {
      scale: 2, // High quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#FFFFFF',
      width: element.scrollWidth,
      height: element.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      logging: false,
      removeContainer: false,
      imageTimeout: 20000,
      onclone: (clonedDoc) => {
        // Ensure colors are preserved in cloned document
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          // Force visibility and proper styling
          const allElements = clonedElement.querySelectorAll('*');
          allElements.forEach((el: any) => {
            if (el.style) {
              el.style.visibility = 'visible';
              el.style.opacity = '1';
              el.style.transform = 'none';
              el.style.display = getComputedStyle(el).display;
            }
          });

          // Ensure tables are visible
          const tables = clonedElement.querySelectorAll('table');
          tables.forEach((table: any) => {
            if (table.style) {
              table.style.display = 'table';
              table.style.visibility = 'visible';
              table.style.width = '100%';
              table.style.borderCollapse = 'collapse';
            }
          });

          // Ensure color backgrounds for metric cells
          const statusCells = clonedElement.querySelectorAll('[class*="status-"]');
          statusCells.forEach((cell: any) => {
            const classes = cell.className;
            if (classes.includes('status-good')) {
              cell.style.backgroundColor = '#E8F5E9';
            } else if (classes.includes('status-warning')) {
              cell.style.backgroundColor = '#FFF3E0';
            } else if (classes.includes('status-poor')) {
              cell.style.backgroundColor = '#FFEBEE';
            }
          });

          // Ensure grand total row styling
          const grandTotalRows = clonedElement.querySelectorAll('.grand-total');
          grandTotalRows.forEach((row: any) => {
            row.style.backgroundColor = '#B0D4E3';
            row.style.fontWeight = 'bold';
          });

          // Ensure section headers
          const headers = clonedElement.querySelectorAll('.qcoe-section-header');
          headers.forEach((header: any) => {
            header.style.backgroundColor = '#1B7F8F';
            header.style.color = '#FFFFFF';
            header.style.fontWeight = 'bold';
          });
        }
      },
    });

    const imgData = canvas.toDataURL('image/png');

    // Create PDF in portrait orientation
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Calculate dimensions
    const margin = 12;
    const headerHeight = 15;
    const footerHeight = 10;

    const availableWidth = pageWidth - margin * 2;
    const availableHeightFirstPage = pageHeight - headerHeight - footerHeight - margin;
    const availableHeightOtherPages = pageHeight - margin * 2;

    // Conversion factor for scale=2 canvas
    const pxToMm = 0.132292;
    const canvasWidthMm = canvas.width * pxToMm;
    const canvasHeightMm = canvas.height * pxToMm;

    // Calculate scale
    const widthScale = availableWidth / canvasWidthMm;
    const heightScaleFirstPage = availableHeightFirstPage / canvasHeightMm;
    const scale = Math.max(widthScale, heightScaleFirstPage);

    const finalImgWidth = availableWidth;
    const finalImgHeight = (canvasHeightMm / canvasWidthMm) * finalImgWidth;

    // Add header function
    const addHeader = (pageNum: number) => {
      // Teal header background
      pdf.setFillColor(27, 127, 143);
      pdf.rect(0, 0, pageWidth, headerHeight, 'F');

      // Title
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('Helvetica', 'bold');
      const titleText = `QCOE - Weekly Status Report${reportDate ? ` – ${reportDate}` : ''}`;
      pdf.text(titleText, margin, 10);

      // Page indicator (on right)
      pdf.setFontSize(9);
      pdf.setFont('Helvetica', 'normal');
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 10, 10);

      // Reset text color
      pdf.setTextColor(0, 0, 0);
    };

    // Add footer function
    const addFooter = (pageNum: number, totalPages: number) => {
      pdf.setFontSize(8);
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(102, 102, 102);

      const currentDate = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthYear = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

      // Left: Company/Report info
      pdf.text('TAO Digital Solutions • Automated QCOE Report', margin, pageHeight - 5);

      // Center: Generation info
      pdf.text(`Generated by FalconX • ${monthYear}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

      // Right: Page number
      pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
    };

    // Pagination logic
    let remainingHeight = finalImgHeight;
    let sourceY = 0;
    let pageNumber = 1;

    const estimatedTotalPages = Math.ceil(finalImgHeight / (pageHeight - headerHeight - footerHeight - margin * 2));

    while (remainingHeight > 0) {
      // Add header
      addHeader(pageNumber);

      const topMargin = pageNumber === 1 ? headerHeight + margin : margin;
      const bottomMargin = footerHeight + margin;
      const currentYPosition = topMargin;

      const availablePageHeight = pageHeight - currentYPosition - bottomMargin;
      const currentImgHeight = Math.min(remainingHeight, availablePageHeight);

      const contentRatio = currentImgHeight / finalImgHeight;
      const sourceHeight = contentRatio * canvas.height;

      // Create page canvas
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const pageCtx = pageCanvas.getContext('2d');

      if (pageCtx) {
        pageCtx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight
        );

        const pageImgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(pageImgData, 'PNG', margin, currentYPosition, finalImgWidth, currentImgHeight, undefined, 'FAST');
      }

      // Add footer
      addFooter(pageNumber, estimatedTotalPages);

      // Prepare for next page
      sourceY += sourceHeight;
      remainingHeight -= currentImgHeight;
      pageNumber++;

      if (remainingHeight > 0) {
        pdf.addPage();
      }
    }

    // Save the PDF
    pdf.save(filename);

  } finally {
    // Restore original styles
    element.style.width = originalStyles.width;
    element.style.backgroundColor = originalStyles.backgroundColor;
    element.style.overflow = originalStyles.overflow;
    element.style.height = originalStyles.height;
    element.style.padding = originalStyles.padding;
    element.classList.remove('qcoe-pdf-export');
  }
};

/**
 * Function to apply status colors to a table cell
 * Usage in JSX:
 * ```jsx
 * <td className={getStatusClass(value, 'percentage')}>
 *   {value}%
 * </td>
 * ```
 */
export function getStatusClass(value: number, thresholdType: keyof typeof PERFORMANCE_THRESHOLDS = 'percentage'): string {
  const threshold = PERFORMANCE_THRESHOLDS[thresholdType];
  
  if (value >= threshold.good) {
    return 'qcoe-percentage status-good';
  } else if (value >= threshold.warning) {
    return 'qcoe-percentage status-warning';
  } else {
    return 'qcoe-percentage status-poor';
  }
}

/**
 * Format a number as percentage with sign for WoW progress
 */
export function formatWoWProgress(value: number): string {
  if (value > 0) {
    return `+${value.toFixed(1)}%`;
  } else if (value < 0) {
    return `${value.toFixed(1)}%`;
  } else {
    return '0%';
  }
}

/**
 * Get CSS class for WoW progress color
 */
export function getProgressColorClass(value: number): string {
  if (value > 0) {
    return 'qcoe-wow-progress positive';
  } else if (value < 0) {
    return 'qcoe-wow-progress negative';
  } else {
    return 'qcoe-wow-progress neutral';
  }
}

/**
 * Prepare a table row with proper styling classes
 * This helper ensures consistent formatting
 */
export interface FormattedTableRow {
  portfolio: string;
  [key: string]: number | string;
  wow: number;
  comments: string;
}

/**
 * Validates that the element has proper QCOE styling classes applied
 */
export function validateQCOEReportStructure(elementId: string): { valid: boolean; errors: string[] } {
  const element = document.getElementById(elementId);
  if (!element) {
    return { valid: false, errors: [`Element with ID "${elementId}" not found`] };
  }

  const errors: string[] = [];

  // Check for metric sections
  const sections = element.querySelectorAll('.qcoe-metric-section');
  if (sections.length === 0) {
    errors.push('No metric sections found (.qcoe-metric-section)');
  }

  // Check for section headers
  const headers = element.querySelectorAll('.qcoe-section-header');
  if (headers.length === 0) {
    errors.push('No section headers found (.qcoe-section-header)');
  }

  // Check for tables
  const tables = element.querySelectorAll('.qcoe-metric-table');
  if (tables.length === 0) {
    errors.push('No metric tables found (.qcoe-metric-table)');
  }

  // Check for color-coded cells
  const coloredCells = element.querySelectorAll('[class*="status-"]');
  if (coloredCells.length === 0) {
    console.warn('Warning: No color-coded status cells found. Percentages may not display with correct background colors.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  exportQCOEReportAsPDF,
  getMetricStatus,
  getProgressTextColor,
  getStatusClass,
  formatWoWProgress,
  getProgressColorClass,
  validateQCOEReportStructure,
  QCOE_COLORS,
  PERFORMANCE_THRESHOLDS,
};
