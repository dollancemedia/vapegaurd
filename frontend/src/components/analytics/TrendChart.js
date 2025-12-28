import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { mockDataService } from '../../services/mockDataService';
import { chartOptions } from '../../utils/chartHelpers';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TrendChart = () => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedDatasets, setSelectedDatasets] = useState({
    activeDevices: true,
    errorCount: true,
    avgBattery: true,
    avgSignal: true
  });

  const timeRanges = [
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' }
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await mockDataService.getTrendData(timeRange);
        setChartData(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching trend data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const handleDatasetToggle = (datasetKey) => {
    setSelectedDatasets(prev => ({
      ...prev,
      [datasetKey]: !prev[datasetKey]
    }));
  };

  const filteredChartData = chartData ? {
    ...chartData,
    datasets: chartData.datasets.filter(dataset => {
      const keyMap = {
        'Active Devices': 'activeDevices',
        'Error Count': 'errorCount',
        'Avg Battery %': 'avgBattery',
        'Avg Signal %': 'avgSignal'
      };
      return selectedDatasets[keyMap[dataset.label]];
    })
  } : null;

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Device Trends</h3>
          <div className="flex space-x-2">
            {timeRanges.map((range) => (
              <div key={range.value} className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
        <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="text-center py-8 text-gray-500">
          <p>Unable to load trend data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">Device Trends</h3>
        
        <div className="flex flex-wrap gap-2">
          {timeRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
                timeRange === range.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap gap-3">
          {chartData.datasets.map((dataset) => (
            <label key={dataset.label} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedDatasets[
                  dataset.label === 'Active Devices' ? 'activeDevices' :
                  dataset.label === 'Error Count' ? 'errorCount' :
                  dataset.label === 'Avg Battery %' ? 'avgBattery' : 'avgSignal'
                ]}
                onChange={() => handleDatasetToggle(
                  dataset.label === 'Active Devices' ? 'activeDevices' :
                  dataset.label === 'Error Count' ? 'errorCount' :
                  dataset.label === 'Avg Battery %' ? 'avgBattery' : 'avgSignal'
                )}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span 
                className="text-sm font-medium"
                style={{ color: dataset.borderColor }}
              >
                {dataset.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="h-64 sm:h-80">
        <Line data={filteredChartData} options={chartOptions} />
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        Click and drag to zoom • Hover for details • Use legend to toggle datasets
      </div>
    </div>
  );
};

export default TrendChart;