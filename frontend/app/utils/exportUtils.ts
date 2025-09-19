import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { useState, useEffect } from 'react';

// Export Work Buddy chat as PDF
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

// Voice-to-text hook
export const useVoiceToText = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const newRecognition = new SpeechRecognition();
    
    newRecognition.continuous = true;
    newRecognition.interimResults = true;
    newRecognition.lang = 'en-US';

    newRecognition.onstart = () => {
      setIsListening(true);
    };

    newRecognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setTranscript(finalTranscript + interimTranscript);
    };

    newRecognition.onerror = (event) => {
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
