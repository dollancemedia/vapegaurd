#!/usr/bin/env python3
"""
Sensor Data Simulator for Vape Detection System

This script simulates sensor data for testing the vape detection system.
It generates random sensor readings and sends them to the API endpoint.
"""

import argparse
import json
import random
import time
import uuid
from datetime import datetime

import requests

# Default configuration
DEFAULT_API_URL = "http://localhost:8000/api/sensors/data"
DEFAULT_INTERVAL = 5  # seconds
DEFAULT_DEVICE_ID = str(uuid.uuid4())[:8]  # Generate a random device ID

# Sensor data ranges
HUMIDITY_RANGE = (30, 70)  # percentage
PM25_RANGE = (0, 30)  # μg/m³
PARTICLE_SIZE_RANGE = (200, 350)  # nm
VOLUME_SPIKE_RANGE = (40, 80)  # dB

# Event simulation settings
VAPE_EVENT_PROBABILITY = 0.1  # 10% chance of vape event
FIRE_EVENT_PROBABILITY = 0.05  # 5% chance of fire event


def generate_normal_data(device_id):
    """Generate normal sensor data."""
    return {
        "device_id": device_id,
        "humidity": random.uniform(*HUMIDITY_RANGE),
        "pm25": random.uniform(*PM25_RANGE),
        "particle_size": random.uniform(*PARTICLE_SIZE_RANGE),
        "volume_spike": random.uniform(*VOLUME_SPIKE_RANGE),
        "timestamp": datetime.now().isoformat()
    }


def generate_vape_data(device_id):
    """Generate sensor data simulating vape detection."""
    return {
        "device_id": device_id,
        "humidity": random.uniform(30, 45),  # Lower humidity
        "pm25": random.uniform(15, 30),  # Higher PM2.5
        "particle_size": random.uniform(280, 350),  # Larger particles
        "volume_spike": random.uniform(60, 80),  # Higher volume spike
        "timestamp": datetime.now().isoformat()
    }


def generate_fire_data(device_id):
    """Generate sensor data simulating fire detection."""
    return {
        "device_id": device_id,
        "humidity": random.uniform(20, 35),  # Even lower humidity
        "pm25": random.uniform(25, 40),  # Much higher PM2.5
        "particle_size": random.uniform(300, 400),  # Much larger particles
        "volume_spike": random.uniform(50, 70),  # Moderate volume spike
        "timestamp": datetime.now().isoformat()
    }


def send_data(api_url, data):
    """Send data to the API endpoint."""
    try:
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, json=data, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            print(f"Data sent successfully: {json.dumps(data, indent=2)}")
            print(f"Response: {json.dumps(result, indent=2)}")
            
            # Print prediction if available
            if "data" in result and "prediction" in result["data"]:
                prediction = result["data"]["prediction"]
                print(f"Prediction: {prediction['type']} with {prediction['confidence']}% confidence")
        else:
            print(f"Error sending data: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Exception occurred: {str(e)}")


def simulate_data(api_url, device_id, interval, duration=None, force_event=None):
    """Simulate sensor data and send to API."""
    print(f"Starting sensor data simulation for device {device_id}")
    print(f"Sending data to {api_url} every {interval} seconds")
    
    if duration:
        print(f"Simulation will run for {duration} seconds")
        end_time = time.time() + duration
    else:
        print("Simulation will run until interrupted (Ctrl+C)")
        end_time = float("inf")
    
    try:
        while time.time() < end_time:
            # Determine what type of data to generate
            if force_event == "vape":
                data = generate_vape_data(device_id)
                print("Generating VAPE event data...")
            elif force_event == "fire":
                data = generate_fire_data(device_id)
                print("Generating FIRE event data...")
            else:
                # Random event generation based on probabilities
                rand_val = random.random()
                if rand_val < FIRE_EVENT_PROBABILITY:
                    data = generate_fire_data(device_id)
                    print("Generating FIRE event data...")
                elif rand_val < (FIRE_EVENT_PROBABILITY + VAPE_EVENT_PROBABILITY):
                    data = generate_vape_data(device_id)
                    print("Generating VAPE event data...")
                else:
                    data = generate_normal_data(device_id)
                    print("Generating normal data...")
            
            # Send data to API
            send_data(api_url, data)
            
            # Wait for the next interval
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nSimulation stopped by user")
    
    print("Simulation complete")


def main():
    """Main function to parse arguments and start simulation."""
    parser = argparse.ArgumentParser(description="Simulate sensor data for vape detection system")
    parser.add_argument(
        "--api-url", 
        default=DEFAULT_API_URL,
        help=f"API endpoint URL (default: {DEFAULT_API_URL})"
    )
    parser.add_argument(
        "--interval", 
        type=float, 
        default=DEFAULT_INTERVAL,
        help=f"Interval between data points in seconds (default: {DEFAULT_INTERVAL})"
    )
    parser.add_argument(
        "--device-id", 
        default=DEFAULT_DEVICE_ID,
        help=f"Device ID (default: random UUID)"
    )
    parser.add_argument(
        "--duration", 
        type=int, 
        help="Duration of simulation in seconds (default: run indefinitely)"
    )
    parser.add_argument(
        "--event", 
        choices=["normal", "vape", "fire"],
        help="Force a specific event type (normal, vape, or fire)"
    )
    
    args = parser.parse_args()
    
    simulate_data(
        api_url=args.api_url,
        device_id=args.device_id,
        interval=args.interval,
        duration=args.duration,
        force_event=args.event
    )


if __name__ == "__main__":
    main()