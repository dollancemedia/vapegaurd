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
        label: 'Volume Spike',
        data: sensorData.map((data) => data.volume_spike).reverse(),
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
        tension: 0.3,
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