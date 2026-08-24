// =============================================================================
// Ecclesia CMS — Server Connection Screen
// =============================================================================
//
// PURPOSE
//   Shows on first client launch when no server URL is configured.
//   Allows the user to enter the parish server address (IP or hostname + port),
//   test the connection, and save it permanently.
//
// RELATED FILES
//   - src/services/api.ts     → getServerUrl(), setServerUrl()
//   - src/App.tsx             → Shows this component when no server URL
// =============================================================================

import React, { useState } from 'react';
import { setServerUrl } from '../services/api';

interface ServerConnectionProps {
  /** Called after successfully connecting and saving the server URL. */
  onConnected: () => void;
}

/**
 * Server Connection screen for first client launch.
 * 
 * Collects the parish server address, tests connectivity, and saves
 * the URL permanently so the user doesn't re-type it on future launches.
 */
export const ServerConnection: React.FC<ServerConnectionProps> = ({ onConnected }) => {
  // Default to ecclesia.local - the friendly local network name
  const [serverAddress, setServerAddress] = useState('ecclesia.local');
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /**
   * Test the server connection by calling the health endpoint.
   * If successful, save the URL and proceed.
   */
  const handleConnect = async () => {
    setError('');
    setSuccess(false);
    
    // Normalize the address
    let url = serverAddress.trim();
    if (!url) {
      setError('Please enter a server address.');
      return;
    }

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    // Add default port if missing
    if (!url.match(/:\d+$/)) {
      url = `${url}:5000`;
    }

    setIsTesting(true);

    try {
      // Test the connection with a health check
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        // Save the server URL
        setServerUrl(url);
        setSuccess(true);
        
        // Short delay to show success message, then proceed
        setTimeout(() => {
          onConnected();
        }, 500);
      } else {
        setError('Server responded but is not ready. Please try again.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setError('Connection timed out. Please check the server address and try again.');
      } else {
        setError('Cannot connect to server. Please verify the address and ensure the server is running.');
      }
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Handle Enter key press to submit the form.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isTesting) {
      handleConnect();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9] p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1e1e1e] rounded-2xl mb-4">
            <span className="text-white text-3xl font-serif">†</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1a1c1c] font-serif">Ecclesia CMS</h1>
          <p className="text-sm text-[#444748] mt-2">Church Management System</p>
        </div>

        {/* Connection Card */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e1e3e3] p-6">
          <h2 className="text-lg font-semibold text-[#1a1c1c] mb-2">Connect to Parish Server</h2>
          <p className="text-sm text-[#444748] mb-6">
            Enter the address of your parish server to get started. If your server is configured 
            with the default name, simply click <strong>Connect to Server</strong> below.
          </p>

          {/* Server Address Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#1a1c1c] mb-2">
              Server Address
            </label>
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 192.168.1.100 or ecclesia.local"
              disabled={isTesting}
              className="w-full px-4 py-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-sm text-[#1a1c1c] placeholder-[#9ca3af] focus:outline-none focus:border-[#1e1e1e] disabled:opacity-50"
              autoFocus
            />
            <p className="mt-2 text-xs text-[#6b7280]">
              Default: <strong>ecclesia.local</strong> (if your server is configured). 
              Or use the server's IP address (e.g. 192.168.1.100:5000)
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">Connected! Loading application...</p>
            </div>
          )}

          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={isTesting || success}
            className="w-full py-3 bg-[#1e1e1e] text-white text-sm font-semibold rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Testing Connection...
              </span>
            ) : success ? (
              'Connected!'
            ) : (
              'Connect to Server'
            )}
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[#6b7280]">
            Need help? Contact your parish administrator for the server address.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerConnection;
