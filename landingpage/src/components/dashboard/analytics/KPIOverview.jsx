import React, { useState, useEffect } from 'react';
import { mockDataService } from '../../../services/mockDataService';
import { formatPercentage } from '../../../utils/dataFormatters';

const KPIOverview = () => {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await mockDataService.getAnalyticsSummary();
        setKpiData(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching KPI data:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const KPICard = ({ title, value, unit = '', previousValue, icon, color = 'blue' }) => {
    const change = previousValue ? ((value - previousValue) / previousValue) * 100 : null;
    const formatted = formatPercentage(value, change);

    const colorClasses = {
      blue: 'bg-blue-50 border-blue-200 text-blue-900',
      green: 'bg-green-50 border-green-200 text-green-900',
      amber: 'bg-amber-50 border-amber-200 text-amber-900',
      red: 'bg-red-50 border-red-200 text-red-900'
    };

    const iconColorClasses = {
      blue: 'text-blue-600',
      green: 'text-green-600',
      amber: 'text-amber-600',
      red: 'text-red-600'
    };

    return (
      <div className={`p-6 rounded-lg border-2 ${colorClasses[color]} transition-all duration-200 hover:shadow-md`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-75">{title}</p>
            <p className="text-3xl font-bold mt-2">
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <span className="text-lg ml-1">{unit}</span>}
            </p>
            {change !== null && (
              <p className={`text-sm mt-1 ${formatted.color}`}>
                <span className="mr-1">{formatted.icon}</span>
                {formatted.change}
              </p>
            )}
          </div>
          <div className={`text-3xl ${iconColorClasses[color]}`}>
            {icon}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-6 rounded-lg border-2 border-gray-200 bg-gray-50 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!kpiData) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Unable to load KPI data</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KPICard
        title="Total Devices"
        value={kpiData.totalDevices}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        }
        color="blue"
      />
      
      <KPICard
        title="Active Devices"
        value={kpiData.activeDevices}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        color="green"
      />
      
      <KPICard
        title="Uptime %"
        value={kpiData.uptimePercentage}
        unit="%"
        previousValue={kpiData.previousUptime}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        color="green"
      />
      
      <KPICard
        title="Error Rate"
        value={kpiData.errorRate}
        unit="%"
        previousValue={kpiData.previousErrorRate}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        color="red"
      />
    </div>
  );
};

export default KPIOverview;