import asyncio
import json
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import time

class RealTimeMonitor:
    def __init__(self):
        self.client = AsyncIOMotorClient(settings.MONGODB_URI)
        self.db = self.client[settings.DATABASE_NAME]
        self.last_event_id = None
        
    async def monitor_events(self):
        """Monitor new events in real-time"""
        print("🔍 Starting Real-Time MongoDB Monitor...")
        print("📊 Watching for new sensor data and predictions...")
        print("-" * 80)
        
        while True:
            try:
                # Get latest events
                events = await self.db.events.find().sort("timestamp", -1).limit(5).to_list(length=5)
                
                if events:
                    latest_event = events[0]
                    current_id = str(latest_event["_id"])
                    
                    # Check if this is a new event
                    if self.last_event_id != current_id:
                        self.last_event_id = current_id
                        await self.display_event(latest_event)
                        
                        # Also show recent sensor data
                        await self.display_recent_sensor_data()
                        
                await asyncio.sleep(2)  # Check every 2 seconds
                
            except Exception as e:
                print(f"❌ Error monitoring: {str(e)}")
                await asyncio.sleep(5)
                
    async def display_event(self, event):
        """Display a new event with formatting"""
        timestamp = event.get("timestamp", datetime.now())
        device_id = event.get("device_id", "Unknown")
        prediction = event.get("prediction", {})
        
        predicted_class = prediction.get("predicted_class", "unknown")
        confidence = prediction.get("confidence", 0)
        
        # Color coding based on prediction
        if predicted_class == "vape":
            status_icon = "🚨" if confidence > 70 else "⚠️"
            status_color = "HIGH ALERT" if confidence > 70 else "WARNING"
        elif predicted_class == "normal":
            status_icon = "✅"
            status_color = "NORMAL"
        else:
            status_icon = "⚠️"
            status_color = "WARNING"
            
        print(f"\n{status_icon} NEW EVENT DETECTED - {status_color}")
        print(f"📅 Time: {timestamp}")
        print(f"📱 Device: {device_id}")
        print(f"🎯 Prediction: {predicted_class.upper()} ({confidence:.1f}% confidence)")
        
        # Show sensor readings if available
        sensor_data = event.get("sensor_data", {})
        if sensor_data:
            print(f"🌡️  Temperature: {sensor_data.get('temperature', 'N/A')}°C")
            print(f"💧 Humidity: {sensor_data.get('humidity', 'N/A')}%")
            print(f"🫁 Gas Resistance: {sensor_data.get('gas_resistance', 'N/A')} kΩ")
            print(f"🌫️  PM2.5: {sensor_data.get('pm25', 'N/A')} μg/m³")
            print(f"🔊 Sound Level: {sensor_data.get('sound_level', 'N/A')} dB")
            
        print("-" * 80)
        
    async def display_recent_sensor_data(self):
        """Show recent sensor data trends"""
        try:
            # Get last 3 sensor readings
            recent_data = await self.db.events.find().sort("timestamp", -1).limit(3).to_list(length=3)
            
            if len(recent_data) >= 2:
                print("📈 RECENT TRENDS:")
                for i, data in enumerate(recent_data[:3]):
                    sensor = data.get("sensor_data", {})
                    pred = data.get("prediction", {})
                    age = f"{i*2}s ago" if i > 0 else "Latest"
                    
                    print(f"   {age}: PM2.5={sensor.get('pm25', 'N/A')}, "
                          f"Gas={sensor.get('gas_resistance', 'N/A')}, "
                          f"Prediction={pred.get('predicted_class', 'N/A')} "
                          f"({pred.get('confidence', 0):.1f}%)")
                print()
                
        except Exception as e:
            print(f"⚠️  Could not fetch trends: {str(e)}")
            
    async def show_database_stats(self):
        """Show current database statistics"""
        try:
            events_count = await self.db.events.count_documents({})
            feedback_count = await self.db.feedback.count_documents({})
            
            print(f"📊 DATABASE STATS:")
            print(f"   Total Events: {events_count}")
            print(f"   Total Feedback: {feedback_count}")
            
            # Show recent activity
            recent_events = await self.db.events.find().sort("timestamp", -1).limit(1).to_list(length=1)
            if recent_events:
                last_event_time = recent_events[0].get("timestamp")
                print(f"   Last Activity: {last_event_time}")
            print()
            
        except Exception as e:
            print(f"❌ Error getting stats: {str(e)}")
            
    async def run(self):
        """Main monitoring loop"""
        print("🚀 Real-Time Vape Detection Monitor")
        print("=" * 80)
        
        # Show initial stats
        await self.show_database_stats()
        
        # Start monitoring
        await self.monitor_events()

if __name__ == "__main__":
    monitor = RealTimeMonitor()
    try:
        asyncio.run(monitor.run())
    except KeyboardInterrupt:
        print("\n👋 Monitoring stopped by user")
    except Exception as e:
        print(f"❌ Monitor error: {str(e)}")