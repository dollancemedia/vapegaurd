import React, { useState, useEffect } from 'react';
import { useOrganization, useAuth } from '@clerk/clerk-react';
import api from '../services/api';

const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const SSID_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const PASS_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const ORG_UUID = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";

const AddDeviceModal = ({ isOpen, onClose, onDeviceAdded }) => {
  const [activeTab, setActiveTab] = useState('bluetooth');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [manualMac, setManualMac] = useState('');
  const [status, setStatus] = useState('idle'); // idle, scanning, connecting, provisioning, saving, success, error
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  
  const { organization } = useOrganization();
  const { getToken } = useAuth();

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setStatus('idle');
      setError('');
      setStatusMessage('');
      setSsid('');
      setPassword('');
      setManualMac('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBluetoothProvision = async () => {
    if (!navigator.bluetooth) {
      setError("Web Bluetooth is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const isAvailable = await navigator.bluetooth.getAvailability();
    if (!isAvailable) {
        setError("Bluetooth is not available or enabled on this device. Please check your system settings.");
        return;
    }

    if (!ssid || !password) {
        setError("Please enter Wi-Fi SSID and Password.");
        return;
    }

    try {
      setStatus('scanning');
      setStatusMessage('Scanning for MISTIO sensors...');
      setError('');

      console.log("Requesting Bluetooth device...");
      // Try a broader scan first to debug
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'MISTIO-' }], // Commented out for debugging
        // acceptAllDevices: true,
        optionalServices: [BLE_SERVICE_UUID]
      });

      console.log("Device selected:", device.name);
      setStatus('connecting');
      setStatusMessage(`Connecting to ${device.name}...`);
      
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);

      setStatus('provisioning');
      setStatusMessage('Sending Wi-Fi credentials...');

      const encoder = new TextEncoder();

      // Write SSID
      const ssidChar = await service.getCharacteristic(SSID_UUID);
      await ssidChar.writeValue(encoder.encode(ssid));
      
      // Write Password
      const passChar = await service.getCharacteristic(PASS_UUID);
      await passChar.writeValue(encoder.encode(password));
      
      // Write Org
      const orgId = organization?.name || 'unknown_org';
      const orgChar = await service.getCharacteristic(ORG_UUID);
      await orgChar.writeValue(encoder.encode(orgId));

      // Parse MAC from device name (MISTIO-XXXXXXXXXXXX)
      let macFromBle = '';
      if (device.name && device.name.includes('MISTIO-')) {
          macFromBle = device.name.replace('MISTIO-', '');
      } else {
          // If name is missing or doesn't match, we can't auto-register easily
          // For now, let's prompt the user or handle it.
          // But wait! If we just provisioned it, maybe we can assume it worked?
          // Let's try to extract from name if possible, otherwise use a placeholder or fail gracefully.
          console.warn("Device name not in expected format:", device.name);
          if (device.name) {
             // Try to find any hex string
             const match = device.name.match(/([0-9A-Fa-f]{12})/);
             if (match) macFromBle = match[1];
          }
      }

      if (!macFromBle) {
          throw new Error("Could not extract MAC address from device name (" + (device.name || "Unknown") + "). Please use Manual Registration.");
      }
      
      setStatus('saving');
      setStatusMessage('Registering device...');
      
      // Register to backend
      await registerDeviceToBackend(macFromBle);
      
      setStatus('success');
      setStatusMessage('Device successfully added!');
      
      setTimeout(() => {
        if (device.gatt.connected) {
            device.gatt.disconnect();
        }
        onDeviceAdded();
        onClose();
      }, 1500);

    } catch (err) {
      console.error("Bluetooth Provisioning Error:", err);
      setStatus('error');
      if (err.name === 'NotFoundError') {
        setError('Scan failed: User cancelled or no device selected.');
      } else if (err.name === 'SecurityError') {
        setError('Security Error: Browser denied Bluetooth access. Check permissions.');
      } else if (err.name === 'NotSupportedError') {
        setError('Bluetooth not supported by this browser/device.');
      } else {
        setError(`Provisioning failed: ${err.message}`);
      }
    }
  };

  const handleManualRegister = async () => {
    // Validate MAC
    const cleanMac = manualMac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (cleanMac.length !== 12) {
      setError('Invalid MAC address. It should be 12 characters (e.g., AABBCCDDEEFF).');
      return;
    }

    try {
      setStatus('saving');
      setStatusMessage('Registering device...');
      setError('');

      await registerDeviceToBackend(cleanMac);

      setStatus('success');
      setStatusMessage('Device successfully registered!');
      
      setTimeout(() => {
        onDeviceAdded();
        onClose();
      }, 1500);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setError(`Registration failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  const registerDeviceToBackend = async (mac) => {
    const orgId = organization?.id;
    const orgName = organization?.name;
    const token = await getToken();

    if (!orgId) {
        throw new Error("Organization information missing.");
    }

    await api.post('/devices/register', {
      device_id: mac,
      school: orgId,
      school_name: orgName
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  Add New Device
                </h3>
                
                {/* Tabs */}
                <div className="mt-4 border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveTab('bluetooth')}
                      className={`${activeTab === 'bluetooth' ? 'border-[#00C2CB] text-[#00C2CB]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                    >
                      Bluetooth Setup
                    </button>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className={`${activeTab === 'manual' ? 'border-[#00C2CB] text-[#00C2CB]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                    >
                      Manual (MAC)
                    </button>
                  </nav>
                </div>

                {/* Content */}
                <div className="mt-4">
                  {activeTab === 'bluetooth' ? (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Power on the device and ensure it is in range. Enter the Wi-Fi credentials you want the device to use.
                      </p>
                      
                      {!navigator.bluetooth && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                          <div className="flex">
                            <div className="ml-3">
                              <p className="text-sm text-yellow-700">
                                Web Bluetooth is not supported in this browser. Please use Chrome or Edge.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Wi-Fi SSID</label>
                        <input
                          type="text"
                          value={ssid}
                          onChange={(e) => setSsid(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#00C2CB] focus:border-[#00C2CB] sm:text-sm"
                          placeholder="Network Name"
                          disabled={status !== 'idle' && status !== 'error'}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Wi-Fi Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#00C2CB] focus:border-[#00C2CB] sm:text-sm"
                          placeholder="Network Password"
                          disabled={status !== 'idle' && status !== 'error'}
                        />
                      </div>
                      
                      {status !== 'idle' && status !== 'error' && (
                        <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00C2CB] mr-3"></div>
                            <span className="text-sm text-gray-600">{statusMessage}</span>
                        </div>
                      )}

                      {status === 'success' && (
                        <div className="bg-green-50 border-l-4 border-green-400 p-4">
                            <p className="text-sm text-green-700">{statusMessage}</p>
                        </div>
                      )}

                      {error && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-4">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                        <p className="text-sm text-blue-700">
                          <strong>Instructions:</strong><br/>
                          Enter the MAC address printed on the device label (e.g., AA:BB:CC:DD:EE:FF).
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Device MAC Address</label>
                        <input
                          type="text"
                          value={manualMac}
                          onChange={(e) => setManualMac(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#00C2CB] focus:border-[#00C2CB] sm:text-sm uppercase"
                          placeholder="AABBCCDDEEFF"
                          maxLength={17}
                          disabled={status !== 'idle' && status !== 'error'}
                        />
                        <p className="mt-1 text-xs text-gray-500">Enter with or without colons.</p>
                      </div>

                      {status !== 'idle' && status !== 'error' && (
                         <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00C2CB] mr-3"></div>
                            <span className="text-sm text-gray-600">{statusMessage}</span>
                        </div>
                      )}

                      {status === 'success' && (
                        <div className="bg-green-50 border-l-4 border-green-400 p-4">
                            <p className="text-sm text-green-700">{statusMessage}</p>
                        </div>
                      )}

                      {error && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-4">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {activeTab === 'bluetooth' ? (
                <button
                    type="button"
                    onClick={handleBluetoothProvision}
                    disabled={status !== 'idle' && status !== 'error'}
                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#00C2CB] text-base font-medium text-white hover:bg-[#009FA6] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] sm:ml-3 sm:w-auto sm:text-sm ${status !== 'idle' && status !== 'error' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Scan & Configure
                </button>
            ) : (
                <button
                    type="button"
                    onClick={handleManualRegister}
                    disabled={status !== 'idle' && status !== 'error'}
                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#00C2CB] text-base font-medium text-white hover:bg-[#009FA6] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] sm:ml-3 sm:w-auto sm:text-sm ${status !== 'idle' && status !== 'error' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Register Device
                </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'provisioning' || status === 'saving'}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddDeviceModal;