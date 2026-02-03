import React from 'react';
import { Line } from 'react-chartjs-2';

const SensorReadings = ({ sensorData, isLoading }) => {
  // Prepare chart data
  const chartData = {
    labels: sensorData.map((data) => {
      const date = new Date(data.timestamp);
      return date.toLocaleTimeString();
    }).reverse(),
    datasets: [
      {
        label: 'PM2.5',
        data: sensorData.map((data) => data.pm25).reverse(),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.3,
      },
      {
        label: 'Humidity',
        data: sensorData.map((data) => data.humidity).reverse(),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        tension: 0.3,
      },
      {
        label: 'Particle Size',
        data: sensorData.map((data) => data.particle_size / 10).reverse(), // Scale down for better visualization
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.3,
      },
      {
        label: 'Prediction Status',
        data: sensorData.map((data) => {
          if (data.predictedClass === 'fire') return 4;
          if (data.predictedClass === 'vape') return 3;
          if (data.predictedClass === 'suspected') return 2;
          if (data.predictedClass === 'uncertain') return 1;
          if (data.predictedClass === 'calibrating') return 0.5;
          return 0;
        }).reverse(),
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
        tension: 0.1,
        stepped: true,
        yAxisID: 'y1', // Assign to secondary axis if possible, or just scale
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 15,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      title: {
        display: true,
        text: 'Sensor Readings Over Time',
        font: {
          size: 16,
          weight: 'bold',
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        callbacks: {
            label: function(context) {
                let label = context.dataset.label || '';
                if (label === 'Prediction Status') {
                    const val = context.raw;
                    if (val === 4) return 'Status: Fire';
                    if (val === 3) return 'Status: Vape';
                    if (val === 2) return 'Status: Suspected';
                    if (val === 1) return 'Status: Uncertain';
                    if (val === 0.5) return 'Status: Calibrating';
                    return 'Status: Normal';
                }
                return label + ': ' + context.formattedValue;
            }
        },
        titleFont: {
          size: 14,
        },
        bodyFont: {
          size: 13,
        },
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    animations: {
      tension: {
        duration: 1000,
        easing: 'linear',
      },
    },
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Sensor Readings</h2>
        <span className="card-subtitle">Real-time data visualization</span>
      </div>
      <div className="card-body chart-container">
        {!isLoading && sensorData.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="loading-container">
            <p>Loading sensor data...</p>
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SensorReadings;