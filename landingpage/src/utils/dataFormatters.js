// Data formatting utilities for export functionality

export const formatDataForExport = (data, type) => {
  switch (type) {
    case 'csv':
      return formatAsCSV(data);
    case 'json':
      return formatAsJSON(data);
    case 'pdf':
      return formatForPDF(data);
    default:
      return data;
  }
};

const formatAsCSV = (data) => {
  if (!data || !Array.isArray(data)) {
    return '';
  }
  
  if (data.length === 0) {
    return '';
  }
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(',')
    )
  ].join('\n');
  
  return csvContent;
};

const formatAsJSON = (data) => {
  return JSON.stringify(data, null, 2);
};

const formatForPDF = (data) => {
  // Return data in a format suitable for PDF generation
  return {
    title: 'Analytics Dashboard Report',
    timestamp: new Date().toISOString(),
    data: data
  };
};

export const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const formatNumber = (num, decimals = 1) => {
  return Number(num).toFixed(decimals);
};

export const formatPercentage = (value, change = null) => {
  const formatted = `${Number(value).toFixed(1)}%`;
  if (change === null) return formatted;
  
  const changeValue = Number(change);
  const changeSign = changeValue >= 0 ? '+' : '';
  const changeColor = changeValue >= 0 ? 'text-green-600' : 'text-red-600';
  const changeIcon = changeValue >= 0 ? '↑' : '↓';
  
  return {
    value: formatted,
    change: `${changeSign}${changeValue.toFixed(1)}%`,
    color: changeColor,
    icon: changeIcon
  };
};