import React, { useState, useRef, useCallback } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import SchoolNotificationSystem from '../components/SchoolNotificationSystem';
import { ChevronRight, Bell, Shield, Users, LogOut, Volume2, Wifi, AlertTriangle, Zap } from 'lucide-react';


const Settings = () => {
  const { user } = useUser();
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();
  const notificationSystemRef = useRef(null);
  
  // Settings State
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('notificationSettings');
      return saved ? JSON.parse(saved) : {
        criticalAlerts: true,
        warningAlerts: true,
        onlineStatus: true,
        soundEnabled: true,
        threshold: 75
      };
    } catch (e) {
      return {
        criticalAlerts: true,
        warningAlerts: true,
        onlineStatus: true,
        soundEnabled: true,
        threshold: 75
      };
    }
  });

  // Save to localStorage whenever settings change
  React.useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    window.dispatchEvent(new Event('notificationSettingsChanged'));
  }, [settings]);

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleThresholdChange = (e) => {
    setSettings(prev => ({ ...prev, threshold: parseInt(e.target.value) }));
  };

  // Test Notification Logic
  const handleTestNotification = useCallback(() => {
    if (notificationSystemRef.current) {
      notificationSystemRef.current.triggerAlert({
        id: 'test-' + Date.now(),
        type: 'vape',
        location: 'Settings Test Room',
        confidence: 98,
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6 flex flex-col">
      <SchoolNotificationSystem ref={notificationSystemRef} events={[]} isConnected={true} soundEnabled={settings.soundEnabled} />

      <div className="px-4 py-6 space-y-8 max-w-lg md:max-w-6xl mx-auto w-full flex-1 flex flex-col">
        
        {/* Profile Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <img 
                src={user?.imageUrl} 
                alt="Profile" 
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm"
              />
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">{user?.fullName || 'User'}</h2>
              <p className="text-sm text-gray-500">{user?.primaryEmailAddress?.emailAddress || 'Administrator'}</p>
            </div>
          </div>
          <button 
            onClick={() => openUserProfile()}
            className="px-4 py-1.5 bg-gray-50 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            Edit
          </button>
        </div>

        {/* Notification Preferences */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 px-2">Notification Preferences</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            
            {/* Critical Alerts */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-50 text-red-500 rounded-full">
                  <AlertTriangle size={20} />
                </div>
                <span className="font-medium text-gray-900">Critical Alerts</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.criticalAlerts}
                  onChange={() => handleToggle('criticalAlerts')}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00C2CB]"></div>
              </label>
            </div>

            {/* Warning Alerts */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-50 text-orange-500 rounded-full">
                  <Bell size={20} />
                </div>
                <span className="font-medium text-gray-900">Warning Alerts</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.warningAlerts}
                  onChange={() => handleToggle('warningAlerts')}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00C2CB]"></div>
              </label>
            </div>

            {/* Online/Offline Alerts */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-full">
                  <Wifi size={20} />
                </div>
                <span className="font-medium text-gray-900">Online/Offline Alerts</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.onlineStatus}
                  onChange={() => handleToggle('onlineStatus')}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00C2CB]"></div>
              </label>
            </div>

            {/* Sound Alerts */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-full">
                  <Volume2 size={20} />
                </div>
                <span className="font-medium text-gray-900">Sound Effects</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.soundEnabled}
                  onChange={() => handleToggle('soundEnabled')}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00C2CB]"></div>
              </label>
            </div>

            {/* Alert Threshold Slider */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                   <div className="p-2 bg-yellow-50 text-yellow-600 rounded-full">
                     <Zap size={20} />
                   </div>
                   <span className="font-medium text-gray-900">Alert Sensitivity</span>
                </div>
                <span className="text-sm font-bold text-[#00C2CB]">{settings.threshold}%</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="95" 
                value={settings.threshold} 
                onChange={handleThresholdChange}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#00C2CB]"
                style={{
                  background: `linear-gradient(to right, #00C2CB 0%, #00C2CB ${((settings.threshold - 50) * 100) / 45}%, #e5e7eb ${((settings.threshold - 50) * 100) / 45}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between mt-1 text-xs text-gray-400 font-medium">
                <span>Sensitive (50%)</span>
                <span>Strict (95%)</span>
              </div>
            </div>

             {/* Test Notification Button */}
             <button 
                onClick={handleTestNotification}
                className="w-full p-4 flex items-center justify-center text-[#00C2CB] font-medium hover:bg-gray-50 transition-colors text-sm"
             >
               Test Notification System
             </button>

          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Account Settings */}
          <div className="flex-grow">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 px-2">Account</h3>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
              
              <button 
                onClick={() => openOrganizationProfile()}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-teal-50 text-teal-600 rounded-full group-hover:bg-teal-100 transition-colors">
                    <Users size={20} />
                  </div>
                  <span className="font-medium text-gray-900">Manage Organization</span>
                </div>
                <ChevronRight size={20} className="text-gray-300 group-hover:text-gray-400" />
              </button>

              <button 
                onClick={() => openUserProfile({ label: 'security' })}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full group-hover:bg-indigo-100 transition-colors">
                    <Shield size={20} />
                  </div>
                  <span className="font-medium text-gray-900">Security</span>
                </div>
                <ChevronRight size={20} className="text-gray-300 group-hover:text-gray-400" />
              </button>

            </div>
          </div>

          {/* Sign Out */}
          <div className="flex flex-col justify-end">
            <button 
              onClick={() => signOut()}
              className="w-full bg-white rounded-3xl p-4 shadow-sm border border-gray-100 text-red-500 font-bold hover:bg-red-50 transition-colors flex items-center justify-center space-x-2"
            >
              <LogOut size={20} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

      </div>

      <div className="text-center text-xs text-gray-400 pb-24 pt-4 md:pb-12">
        v2.1.0 • Mistio
      </div>
    </div>
  );
};

export default Settings;
