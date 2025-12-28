import React, { useState, useEffect } from 'react';
import { mockDataService } from '../../services/mockDataService';
import { Line } from 'react-chartjs-2';
import { chartOptions } from '../../utils/chartHelpers';

const DrillDownModal = ({ isOpen, onClose, metric, deviceId }) => {
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (isOpen && metric) {
      fetchDetailData();
    }
  }, [isOpen, metric, deviceId]);

  const fetchDetailData = async () => {
    try {
      setLoading(true);
      // Simulate detailed data fetch
      const mockDetailData = {
        overview: {
          currentValue: 95.3,
          previousValue: 94.8,
          change: 0.5,
          trend: 'up',
          period: 'Last 30 days'
        },
        historical: await mockDataService.getTrendData('30d'),
        breakdown: [
          { category: 'Building A', value: 96.2, count: 45 },
          { category: 'Building B', value: 94.8, count: 38 },
          { category: 'Building C', value: 95.1, count: 52 },
          { category: 'Building D', value: 93.9, count: 29 }
        ]
      };
      setDetailData(mockDetailData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching detail data:', error);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'historical', label: 'Historical Data' },
    { id: 'breakdown', label: 'Breakdown' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {metric ? `${metric} - Detailed Analysis` : 'Detailed Analysis'}
            </h2>
            {deviceId && <p className="text-sm text-gray-500 mt-1">Device: {deviceId}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading detailed data...</p>
            </div>
          ) : (
            <div>
              {activeTab === 'overview' && detailData?.overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h3 className="text-sm font-medium text-blue-900 mb-1">Current Value</h3>
                      <p className="text-2xl font-bold text-blue-900">
                        {detailData.overview.currentValue}%
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h3 className="text-sm font-medium text-green-900 mb-1">Change</h3>
                      <p className={`text-2xl font-bold ${
                        detailData.overview.change >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {detailData.overview.change >= 0 ? '+' : ''}{detailData.overview.change}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h3 className="text-sm font-medium text-gray-900 mb-1">Period</h3>
                      <p className="text-2xl font-bold text-gray-900">
                        {detailData.overview.period}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Insights</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start">
                        <span className="text-green-500 mr-2">•</span>
                        Performance is {detailData.overview.change >= 0 ? 'improving' : 'declining'} by {Math.abs(detailData.overview.change)}% compared to previous period
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        Current value is {detailData.overview.currentValue > 95 ? 'above' : 'below'} the 95% target threshold
                      </li>
                      <li className="flex items-start">
                        <span className="text-amber-500 mr-2">•</span>
                        Monitor for sustained trends over the next 7 days
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'historical' && detailData?.historical && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">30-Day Historical Trend</h3>
                  <div className="h-64">
                    <Line data={detailData.historical} options={chartOptions} />
                  </div>
                </div>
              )}

              {activeTab === 'breakdown' && detailData?.breakdown && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance by Location</h3>
                  <div className="space-y-3">
                    {detailData.breakdown.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <span className="font-medium text-gray-900">{item.category}</span>
                          <span className="text-sm text-gray-500">({item.count} devices)</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-semibold text-gray-900">{item.value}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            Generated: {new Date().toLocaleString()}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-200"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillDownModal;