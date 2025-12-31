// Export service for analytics data
import jsPDF from 'jspdf';
import { formatDataForExport, downloadFile } from '../utils/dataFormatters';

export const exportToCSV = (data, filename = 'analytics-data.csv') => {
  const csvContent = formatDataForExport(data, 'csv');
  downloadFile(csvContent, filename, 'text/csv');
};

export const exportToJSON = (data, filename = 'analytics-data.json') => {
  const jsonContent = formatDataForExport(data, 'json');
  downloadFile(jsonContent, filename, 'application/json');
};

export const exportToPDF = (data, title = 'Analytics Dashboard Report') => {
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(20);
  doc.text(title, 20, 30);
  
  // Add timestamp
  doc.setFontSize(12);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 45);
  
  // Add data table
  let yPosition = 60;
  const lineHeight = 8;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  if (Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    
    // Table headers
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    headers.forEach((header, index) => {
      const xPosition = 20 + (index * (pageWidth - 40) / headers.length);
      doc.text(header.toUpperCase(), xPosition, yPosition);
    });
    
    yPosition += lineHeight;
    doc.setFont(undefined, 'normal');
    
    // Table data
    data.slice(0, 20).forEach((row) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      headers.forEach((header, index) => {
        const xPosition = 20 + (index * (pageWidth - 40) / headers.length);
        const value = String(row[header] || '');
        doc.text(value.substring(0, 20), xPosition, yPosition);
      });
      yPosition += lineHeight;
    });
    
    if (data.length > 20) {
      doc.text(`... and ${data.length - 20} more rows`, 20, yPosition + 10);
    }
  }
  
  // Save the PDF
  const filename = `analytics-report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
};

export const exportData = (data, format, filename) => {
  switch (format.toLowerCase()) {
    case 'csv':
      exportToCSV(data, filename);
      break;
    case 'json':
      exportToJSON(data, filename);
      break;
    case 'pdf':
      exportToPDF(data, filename);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
};

const exportService = {
  exportToCSV,
  exportToJSON,
  exportToPDF,
  exportData
};

export default exportService;