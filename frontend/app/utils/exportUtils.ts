import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { useState, useEffect } from 'react';

// Export entire page as PDF (captures full page with html2canvas)
export const exportPageAsPDF = async (
  element: HTMLElement | null, 
  filename: string = 'work-buddy-page.pdf',
  options: {
    scale?: number;
    backgroundColor?: string;
    includeScrollableContent?: boolean;
  } = {}
) => {
  if (!element) {
    throw new Error('Element not found for PDF export');
  }

  const {
    scale = 2,
    backgroundColor = '#ffffff',
    includeScrollableContent = true
  } = options;

  // Temporarily adjust styles for better PDF capture
  const originalStyles = {
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
    overflow: element.style.overflow,
    height: element.style.height
  };

  // Set optimal styles for PDF capture
  element.style.backgroundColor = backgroundColor;
  element.style.overflow = 'visible';
  
  // If element has scrollable content, ensure we capture it all
  if (includeScrollableContent) {
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    if (scrollHeight > clientHeight) {
      element.style.height = `${scrollHeight}px`;
    }
  }

  try {
    // Create canvas from the entire element
    const canvas = await html2canvas(element, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: backgroundColor,
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20; // 10mm margin on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add title page
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Work Buddy Export', pageWidth / 2, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Exported on: ${new Date().toLocaleString()}`, pageWidth / 2, 27, { align: 'center' });

    // Add the image across multiple pages if needed
    let yPosition = 35; // Start below title
    let remainingHeight = imgHeight;
    let sourceY = 0; // Track source Y position in canvas

    while (remainingHeight > 0) {
      const availablePageHeight = pageHeight - yPosition - 10; // 10mm bottom margin
      const currentImgHeight = Math.min(remainingHeight, availablePageHeight);
      
      // Calculate how much of the canvas we need for this page
      const sourceHeight = (currentImgHeight / imgHeight) * canvas.height;
      
      // Create a temporary canvas for this page slice
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const pageCtx = pageCanvas.getContext('2d');
      
      if (pageCtx) {
        // Draw the slice from the main canvas
        pageCtx.drawImage(
          canvas,
          0, sourceY, canvas.width, sourceHeight,
          0, 0, canvas.width, sourceHeight
        );
        
        const pageImgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(
          pageImgData,
          'PNG',
          10,
          yPosition,
          imgWidth,
          currentImgHeight,
          undefined,
          'FAST'
        );
      }

      // Update positions for next iteration
      sourceY += sourceHeight;
      remainingHeight -= currentImgHeight;
      
      if (remainingHeight > 0) {
        pdf.addPage();
        yPosition = 10; // Start at top for subsequent pages
      }
    }

    pdf.save(filename);
  } finally {
    // Restore original styles
    element.style.width = originalStyles.width;
    element.style.backgroundColor = originalStyles.backgroundColor;
    element.style.overflow = originalStyles.overflow;
    element.style.height = originalStyles.height;
  }
};

// Export Work Buddy chat as PDF (messages only - legacy function)
export const exportChatAsPDF = async (messages: any[], filename: string = 'work-buddy-chat.pdf') => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPosition = 20;
  const lineHeight = 7;
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);

  // Add title
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Work Buddy Chat Export', margin, yPosition);
  yPosition += 20;

  // Add timestamp
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Exported on: ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 15;

  // Add messages
  messages.forEach((message, index) => {
    // Check if we need a new page
    if (yPosition > pageHeight - 30) {
      pdf.addPage();
      yPosition = 20;
    }

    // Message header
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    const sender = message.sender === 'user' ? 'You' : 'Work Buddy';
    pdf.text(`${sender}:`, margin, yPosition);
    yPosition += lineHeight;

    // Message content
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    // Split long text into multiple lines
    const content = message.content || '';
    const lines = pdf.splitTextToSize(content, maxWidth);
    
    lines.forEach((line: string) => {
      if (yPosition > pageHeight - 20) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    });

    // Add timestamp if available
    if (message.timestamp) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Time: ${new Date(message.timestamp).toLocaleString()}`, margin, yPosition);
      yPosition += lineHeight;
    }

    yPosition += 10; // Space between messages
  });

  // Save the PDF
  pdf.save(filename);
};

// Export Work Buddy chat as Excel
export const exportChatAsExcel = async (messages: any[], filename: string = 'work-buddy-chat.xlsx') => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chat Export');

  // Add headers
  worksheet.columns = [
    { header: 'Message #', key: 'messageNumber', width: 10 },
    { header: 'Sender', key: 'sender', width: 15 },
    { header: 'Content', key: 'content', width: 80 },
    { header: 'Timestamp', key: 'timestamp', width: 20 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Project Context', key: 'projectContext', width: 20 }
  ];

  // Add data rows
  messages.forEach((message, index) => {
    worksheet.addRow({
      messageNumber: index + 1,
      sender: message.sender === 'user' ? 'You' : 'Work Buddy',
      content: message.content || '',
      timestamp: message.timestamp ? new Date(message.timestamp).toLocaleString() : '',
      confidence: message.confidence || '',
      projectContext: message.projectContext || ''
    });
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6E6FA' }
  };

  // Save the file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Export Insights dashboard as PDF
export const exportInsightsAsPDF = async (elementId: string, filename: string = 'insights-dashboard.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Element not found');
  }

  // Create canvas from the element
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20; // 10mm margin on each side
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Add title
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Insights Dashboard Export', 10, 15);
  
  // Add timestamp
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Exported on: ${new Date().toLocaleString()}`, 10, 22);

  // Add the image
  let yPosition = 30;
  let remainingHeight = imgHeight;

  while (remainingHeight > 0) {
    const currentPageHeight = pageHeight - yPosition - 10; // 10mm bottom margin
    const currentImgHeight = Math.min(remainingHeight, currentPageHeight);
    
    pdf.addImage(
      imgData,
      'PNG',
      10,
      yPosition,
      imgWidth,
      currentImgHeight,
      undefined,
      'FAST'
    );

    remainingHeight -= currentPageHeight;
    
    if (remainingHeight > 0) {
      pdf.addPage();
      yPosition = 10;
    }
  }

  pdf.save(filename);
};

// ---------- TCOE REPORT EXPORTS ----------

interface TcoeExportRow {
  portfolio: string;
  projectLabel: string;
  projectKey: string;
  metricName: string;
  bugs: number;
  defects: number;
  previousLabel: string;
  previousLeakage: number;
  currentLabel: string;
  currentLeakage: number;
  wowProgress: number;
  comments: string;
  bugKeys: string[];
  defectKeys: string[];
  bugsJql?: string;
  defectsJql?: string;
}

const buildTcoeReportPDF = async (elementId: string): Promise<jsPDF> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Element not found');
  }
  const reportTitle = element.getAttribute('data-pdf-title') || 'CDK QCOE METRICS REPORT';

  // Temporarily adjust styles for better PDF capture
  const originalStyles = {
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
    overflow: element.style.overflow,
    height: element.style.height,
    padding: element.style.padding
  };

  // Set optimal styles for PDF capture - ensure content is visible
  element.style.backgroundColor = '#ffffff';
  element.style.overflow = 'visible';
  element.style.width = '100%';
  element.style.padding = '0 0 24px 0';

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // Use landscape orientation so the wide table is readable
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    const margin = 5; // Minimal margins to maximize content area
    const headerHeight = 25;
    const footerHeight = 10;
    const availableWidth = pageWidth - (margin * 2);

    // Export date/time in small text, top right corner
    const exportDate = new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    // Helper function to add footer on every page
    const addFooter = (pageNum: number) => {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      const currentDate = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthYear = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
      pdf.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      pdf.text(`CDK QCOE • Automated Report • Generated by FalconX • ${monthYear}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    };

    // Helper function to add header
    const addHeader = () => {
      pdf.setFillColor(45, 55, 72); // Dark grey
      pdf.rect(0, 0, pageWidth, headerHeight, 'F');
      pdf.setFillColor(30, 41, 59); // Darker grey/black
      pdf.rect(0, 0, pageWidth, headerHeight * 0.4, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(reportTitle, pageWidth / 2, 12, { align: 'center' });
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(200, 200, 200);
      pdf.text(exportDate, pageWidth - 10, 8, { align: 'right' });
      
      pdf.setTextColor(0, 0, 0);
    };

    const contentTop = headerHeight + margin;
    const contentBottom = footerHeight + margin;
    const availablePageHeight = pageHeight - contentTop - contentBottom;
    const pageBottom = pageHeight - contentBottom;
    const cardGap = 5;
    let pageNumber = 1;
    let yPosition = contentTop;

    const prepareClone = (clonedDoc: Document) => {
      const clonedElement = clonedDoc.getElementById(elementId);
      if (clonedElement) {
        clonedElement.style.height = 'auto';
        clonedElement.style.overflow = 'visible';
        clonedElement.style.paddingBottom = '32px';
      }

      // Remove UI-only blocks (warnings/tooling hints) from exported PDFs.
      clonedDoc.querySelectorAll('[data-pdf-exclude="true"]').forEach((node) => node.remove());

      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el: any) => {
        if (el.style) {
          const computedStyle = (clonedDoc.defaultView || window).getComputedStyle(el);
          if (computedStyle.color && computedStyle.color !== 'rgba(0, 0, 0, 0)') {
            el.style.color = computedStyle.color;
          }
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.transform = 'none';

          const fontSize = parseFloat(computedStyle.fontSize);
          if (fontSize && fontSize < 10) {
            el.style.fontSize = '10px';
          }
        }
      });

      const tables = clonedDoc.querySelectorAll('table');
      tables.forEach((table: any) => {
        if (table.style) {
          table.style.display = 'table';
          table.style.visibility = 'visible';
          table.style.width = '100%';
          table.style.borderCollapse = 'collapse';
        }

        const cells = table.querySelectorAll('td, th');
        cells.forEach((cell: any) => {
          if (cell.style) {
            cell.style.visibility = 'visible';
            cell.style.opacity = '1';
          }
        });
      });
    };

    const renderElementToCanvas = async (target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      const width = Math.ceil(Math.max(target.scrollWidth, rect.width));
      const height = Math.ceil(Math.max(target.scrollHeight, rect.height));

      return html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width,
        height,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(document.documentElement.scrollWidth, width),
        windowHeight: Math.max(document.documentElement.scrollHeight, height),
        logging: false,
        removeContainer: false,
        imageTimeout: 20000,
        onclone: prepareClone
      });
    };

    const startNewPage = () => {
      addFooter(pageNumber);
      pdf.addPage();
      pageNumber += 1;
      addHeader();
      yPosition = contentTop;
    };

    const addCanvasToPdf = (canvas: HTMLCanvasElement) => {
      const imageWidth = availableWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      if (imageHeight <= availablePageHeight) {
        if (yPosition > contentTop && yPosition + imageHeight > pageBottom) {
          startNewPage();
        }

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, yPosition, imageWidth, imageHeight, undefined, 'FAST');
        yPosition += imageHeight + cardGap;
        return;
      }

      if (yPosition > contentTop) {
        startNewPage();
      }

      const pixelsPerMm = canvas.width / imageWidth;
      let sourceY = 0;

      while (sourceY < canvas.height) {
        if (pageBottom - yPosition <= cardGap) {
          startNewPage();
        }

        const sliceHeightPx = Math.max(
          1,
          Math.min(canvas.height - sourceY, Math.floor((pageBottom - yPosition) * pixelsPerMm))
        );

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const pageCtx = pageCanvas.getContext('2d');

        if (pageCtx) {
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvas.width, sliceHeightPx,
            0, 0, canvas.width, sliceHeightPx
          );

          const sliceHeightMm = sliceHeightPx / pixelsPerMm;
          pdf.addImage(
            pageCanvas.toDataURL('image/png'),
            'PNG',
            margin,
            yPosition,
            imageWidth,
            sliceHeightMm,
            undefined,
            'FAST'
          );

          yPosition += sliceHeightMm;
        }

        sourceY += sliceHeightPx;

        if (sourceY < canvas.height) {
          startNewPage();
        } else {
          yPosition += cardGap;
        }
      }
    };

    addHeader();

    const timeIndicator = element.querySelector<HTMLElement>('.pdf-time-indicator')?.textContent?.trim();
    if (timeIndicator) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(90, 90, 90);
      pdf.text(timeIndicator, pageWidth - margin, yPosition - 2, { align: 'right' });
    }

    const metricCards = Array.from(element.querySelectorAll<HTMLElement>('[id^="tcoe-report-card-"]'));
    const exportTargets = metricCards.length ? metricCards : [element];

    for (const target of exportTargets) {
      const canvas = await renderElementToCanvas(target);
      addCanvasToPdf(canvas);
    }

    addFooter(pageNumber);
    return pdf;
  } finally {
    // Restore original styles
    element.style.width = originalStyles.width;
    element.style.backgroundColor = originalStyles.backgroundColor;
    element.style.overflow = originalStyles.overflow;
    element.style.height = originalStyles.height;
    element.style.padding = originalStyles.padding;
  }
};

export const createTcoeReportPDFBlob = async (elementId: string): Promise<Blob> => {
  const pdf = await buildTcoeReportPDF(elementId);
  return pdf.output('blob') as Blob;
};

export const exportTcoeReportAsPDF = async (elementId: string, filename: string = 'tcoe-report.pdf') => {
  const pdf = await buildTcoeReportPDF(elementId);
  pdf.save(filename);
};

export const exportTcoeReportAsExcel = async (row: TcoeExportRow, filename: string = 'tcoe-report.xlsx') => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('TCOE Report');

  worksheet.columns = [
    { header: 'Portfolio / Project', key: 'portfolio', width: 32 },
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Bugs Count', key: 'bugs', width: 12 },
    { header: 'Defects Count', key: 'defects', width: 14 },
    { header: `Week ending ${row.previousLabel}`, key: 'previous', width: 20 },
    { header: `Week ending ${row.currentLabel}`, key: 'current', width: 20 },
    { header: 'WoW Progress', key: 'wow', width: 16 },
    { header: 'Comments', key: 'comments', width: 60 }
  ];

  worksheet.addRow({
    portfolio: `${row.portfolio} • ${row.projectLabel} (Key: ${row.projectKey})`,
    metric: row.metricName,
    bugs: row.bugs,
    defects: row.defects,
    previous: `${Number(row.previousLeakage ?? 0).toFixed(1)}%`,
    current: `${Number(row.currentLeakage ?? 0).toFixed(1)}%`,
    wow: `${row.wowProgress > 0 ? '+' : ''}${Number(row.wowProgress ?? 0).toFixed(1)}%`,
    comments: row.comments
  });

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }
  };

  worksheet.getRow(2).alignment = {
    vertical: 'top',
    horizontal: 'center'
  };
  worksheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  worksheet.getCell('B2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  worksheet.getCell('H2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  worksheet.getColumn('H').alignment = { wrapText: true };

  const debugSheet = workbook.addWorksheet('Debug Data');
  debugSheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 100 }
  ];

  const debugRows = [
    { field: 'Portfolio', value: row.portfolio },
    { field: 'Project Label', value: row.projectLabel },
    { field: 'Project Key', value: row.projectKey },
    { field: 'Metric', value: row.metricName },
    { field: 'Bug JQL', value: row.bugsJql || 'Not available' },
    { field: 'Defect JQL', value: row.defectsJql || 'Not available' },
    { field: 'Bug Keys', value: row.bugKeys && row.bugKeys.length ? row.bugKeys.join(', ') : 'None' },
    { field: 'Defect Keys', value: row.defectKeys && row.defectKeys.length ? row.defectKeys.join(', ') : 'None' }
  ];

  debugSheet.addRows(debugRows);
  debugSheet.getColumn('value').alignment = { wrapText: true, vertical: 'top' };
  debugSheet.getColumn('field').alignment = { vertical: 'top' };
  debugSheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportTcoeReportAsExcelMulti = async (rows: TcoeExportRow[], filename: string = 'tcoe-report.xlsx') => {
  const workbook = new ExcelJS.Workbook();

  const addRowSheets = (row: TcoeExportRow, idx: number) => {
    const sheetName = `TCOE ${idx + 1}`;
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = [
      { header: 'Portfolio / Project', key: 'portfolio', width: 32 },
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Bugs Count', key: 'bugs', width: 12 },
      { header: 'Defects Count', key: 'defects', width: 14 },
      { header: `Week ending ${row.previousLabel}`, key: 'previous', width: 20 },
      { header: `Week ending ${row.currentLabel}`, key: 'current', width: 20 },
      { header: 'WoW Progress', key: 'wow', width: 16 },
      { header: 'Comments', key: 'comments', width: 60 }
    ];
    worksheet.addRow({
      portfolio: `${row.portfolio} • ${row.projectLabel} (Key: ${row.projectKey})`,
      metric: row.metricName,
      bugs: row.bugs,
      defects: row.defects,
      previous: `${Number(row.previousLeakage ?? 0).toFixed(1)}%`,
      current: `${Number(row.currentLeakage ?? 0).toFixed(1)}%`,
      wow: `${row.wowProgress > 0 ? '+' : ''}${Number(row.wowProgress ?? 0).toFixed(1)}%`,
      comments: row.comments
    });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    worksheet.getRow(2).alignment = { vertical: 'top', horizontal: 'center' };
    worksheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    worksheet.getCell('B2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    worksheet.getCell('H2').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    worksheet.getColumn('H').alignment = { wrapText: true };

    const debugSheet = workbook.addWorksheet(`Debug ${idx + 1}`);
    debugSheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Value', key: 'value', width: 100 }
    ];
    const debugRows = [
      { field: 'Portfolio', value: row.portfolio },
      { field: 'Project Label', value: row.projectLabel },
      { field: 'Project Key', value: row.projectKey },
      { field: 'Metric', value: row.metricName },
      { field: 'Bug JQL', value: row.bugsJql || 'Not available' },
      { field: 'Defect JQL', value: row.defectsJql || 'Not available' },
      { field: 'Bug Keys', value: row.bugKeys && row.bugKeys.length ? row.bugKeys.join(', ') : 'None' },
      { field: 'Defect Keys', value: row.defectKeys && row.defectKeys.length ? row.defectKeys.join(', ') : 'None' }
    ];
    debugSheet.addRows(debugRows);
    debugSheet.getColumn('value').alignment = { wrapText: true, vertical: 'top' };
    debugSheet.getColumn('field').alignment = { vertical: 'top' };
    debugSheet.getRow(1).font = { bold: true };
  };

  rows.forEach((r, i) => addRowSheets(r, i));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Voice-to-text hook
export const useVoiceToText = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    // Cleanup on unmount
    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, []);

  const startListening = () => {
    if (!isSupported || isListening) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const newRecognition = new SpeechRecognition();
    
    newRecognition.continuous = true;
    newRecognition.interimResults = true;
    newRecognition.lang = 'en-US';

    newRecognition.onstart = () => {
      setIsListening(true);
    };

    newRecognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      setTranscript(finalTranscript || interimTranscript);
    };

    newRecognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setRecognition(null);
    };

    newRecognition.onend = () => {
      setIsListening(false);
      setRecognition(null);
    };

    setRecognition(newRecognition);
    newRecognition.start();
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
    }
    setIsListening(false);
    setRecognition(null);
  };

  const resetTranscript = () => {
    setTranscript('');
  };

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript
  };
};
