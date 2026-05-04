import React, { useState, useEffect } from 'react';

/**
 * SMS Toggle Component for React
 * Connects to FreshRoute backend SMS API
 */
const SMSToggle = () => {
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Load SMS preference on component mount
  useEffect(() => {
    loadSMSPreference();
  }, []);

  /**
   * Load current SMS preference from backend
   */
  const loadSMSPreference = async () => {
    try {
      const response = await fetch('/api/farmer/sms/preferences', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSmsEnabled(data.preferences.sms_alerts_enabled);
      } else {
        console.error('Failed to load SMS preference');
        // Show error notification
      }
    } catch (error) {
      console.error('Error loading SMS preference:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update SMS preference on backend
   */
  const updateSMSPreference = async (enabled) => {
    setUpdating(true);

    try {
      const response = await fetch('/api/farmer/sms/preferences', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sms_alerts_enabled: enabled // Boolean value - this is crucial!
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSmsEnabled(data.preferences.sms_alerts_enabled);

        // Show success message
        showNotification('SMS settings updated successfully', 'success');
      } else {
        const errorData = await response.json();
        console.error('Failed to update SMS preference:', errorData);

        // Revert the toggle on error
        setSmsEnabled(!enabled);

        // Show error message
        showNotification(`Failed to update SMS settings: ${errorData.message || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Error updating SMS preference:', error);
      setSmsEnabled(!enabled); // Revert on error
      showNotification('Network error. Please try again.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Handle toggle change
   */
  const handleToggleChange = async (event) => {
    const newValue = event.target.checked;
    setSmsEnabled(newValue); // Optimistic update
    await updateSMSPreference(newValue);
  };

  /**
   * Get authentication token
   * Replace with your actual auth token logic
   */
  const getAuthToken = () => {
    // Example implementations:
    // return localStorage.getItem('authToken');
    // return useAuth().token; // if using auth context
    // return Cookies.get('jwt'); // if using cookies

    return localStorage.getItem('authToken') || 'YOUR_JWT_TOKEN';
  };

  /**
   * Show notification (replace with your notification system)
   */
  const showNotification = (message, type) => {
    // Example: use toast library
    // toast[type](message);

    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
  };

  if (loading) {
    return <div>Loading SMS preferences...</div>;
  }

  return (
    <div className="sms-settings">
      <h3>SMS Notifications</h3>
      <p>Receive daily price forecasts and market alerts via SMS</p>

      <div className="toggle-container">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={smsEnabled}
            onChange={handleToggleChange}
            disabled={updating}
          />
          <span className="toggle-slider"></span>
        </label>

        <span className="toggle-status">
          {updating ? 'Updating...' :
           smsEnabled ? 'SMS Enabled' : 'SMS Disabled'}
        </span>
      </div>

      <style jsx>{`
        .sms-settings {
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          margin: 20px 0;
        }

        .toggle-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 24px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 24px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }

        input:checked + .toggle-slider {
          background-color: #4CAF50;
        }

        input:checked + .toggle-slider:before {
          transform: translateX(26px);
        }

        input:disabled + .toggle-slider {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .toggle-status {
          font-weight: bold;
          color: ${smsEnabled ? '#4CAF50' : '#666'};
        }
      `}</style>
    </div>
  );
};

export default SMSToggle;