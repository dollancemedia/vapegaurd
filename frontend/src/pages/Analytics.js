import React, { useState, useEffect } from 'react';
import KPIOverview from '../components/analytics/KPIOverview';
import TrendChart from '../components/analytics/TrendChart';
import DeviceHealthGrid from '../components/analytics/DeviceHealthGrid';
import AlertsPanel from '../components/analytics/AlertsPanel';
import DrillDownModal from '../components/analytics/DrillDownModal';
import ExportMenu from '../components/analytics/ExportMenu';
import { mockDataService } from '../services/mockDataService';

const Analytics = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [exportData, setExportData] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleDrillDown = (metric, deviceId = null) => {
    setModalData({ metric, deviceId });
    setIsModalOpen(true);
  };

  const handleExportData = async (type) => {
    try {
      // Gather data from all components for export
      const [summary, health, trends, alerts] = await Promise.all([
        mockDataService.getAnalyticsSummary(),
        mockDataService.getDeviceHealth(),
        mockDataService.getTrendData('30d'),
        mockDataService.getAlerts()
      ]);

      const exportData = {
        summary,
        devices: health.devices,
        trends: trends.datasets,
        alerts,
        exportedAt: new Date().toISOString()
      };

      setExportData(exportData);
      return exportData;
    } catch (error) {
      console.error('Error preparing export data:', error);
      return [];
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] transition-colors duration-200"
              >
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <ExportMenu 
                data={exportData} 
                filename="analytics-dashboard"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Overview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Key Performance Indicators</h2>
            <button
              onClick={() => handleDrillDown('KPI Overview')}
              className="text-sm text-[#00C2CB] hover:text-[#009FA6] transition-colors duration-200"
            >
              View Details →
            </button>
          </div>
          <KPIOverview />
        </div>

        {/* Charts and Health Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Device Trends</h2>
              <button
                onClick={() => handleDrillDown('Device Trends')}
                className="text-sm text-[#00C2CB] hover:text-[#009FA6] transition-colors duration-200"
              >
                View Details →
              </button>
            </div>
            <TrendChart />
          </div>

          {/* Alerts Panel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Alerts</h2>
              <button
                onClick={() => handleDrillDown('Alerts Summary')}
                className="text-sm text-[#00C2CB] hover:text-[#009FA6] transition-colors duration-200"
              >
                View All →
              </button>
            </div>
            <div className="h-[400px]">
              <AlertsPanel />
            </div>
          </div>
        </div>

        {/* Device Health Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Device Health Status</h2>
            <button
              onClick={() => handleDrillDown('Device Health')}
              className="text-sm text-[#00C2CB] hover:text-[#009FA6] transition-colors duration-200"
            >
              View Details →
            </button>
          </div>
          <DeviceHealthGrid />
        </div>

        {/* Export Section */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Export Dashboard Data</h3>
              <p className="text-sm text-gray-500 mt-1">
                Download your analytics data in various formats for reporting and analysis
              </p>
            </div>
            <button
              onClick={handleExportData}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#00C2CB] hover:bg-[#009FA6] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] transition-colors duration-200"
            >
              <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Prepare Export
            </button>
          </div>
        </div>
      </div>

      {/* Drill-down Modal */}
      <DrillDownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        metric={modalData?.metric}
        deviceId={modalData?.deviceId}
      />

      <div className="text-center text-xs text-gray-400 pb-24 pt-4 md:pb-12">
        v2.1.0 • Mistio
      </div>
    </div>
  );
};

export default Analytics;