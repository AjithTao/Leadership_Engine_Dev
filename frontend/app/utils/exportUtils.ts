import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
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
export const exportChatAsExcel = (messages: any[], filename: string = 'work-buddy-chat.xlsx') => {
  const worksheetData = messages.map((message, index) => ({
    'Message #': index + 1,
    'Sender': message.sender === 'user' ? 'You' : 'Work Buddy',
    'Content': message.content || '',
    'Timestamp': message.timestamp ? new Date(message.timestamp).toLocaleString() : '',
    'Confidence': message.confidence || '',
    'Project Context': message.projectContext || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Chat Export');

  // Auto-size columns
  const colWidths = [
    { wch: 10 }, // Message #
    { wch: 15 }, // Sender
    { wch: 80 }, // Content
    { wch: 20 }, // Timestamp
    { wch: 12 }, // Confidence
    { wch: 20 }  // Project Context
  ];
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, filename);
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

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const startListening = () => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
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

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    setIsListening(false);
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
