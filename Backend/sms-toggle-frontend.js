// SMS Toggle Frontend Implementation
// Add this code to your frontend settings page

/**
 * Initialize SMS toggle functionality
 */
async function initializeSMSToggle() {
  const smsToggle = document.getElementById('sms-toggle'); // Your toggle element
  const smsStatus = document.getElementById('sms-status'); // Optional status display

  if (!smsToggle) {
    console.error('SMS toggle element not found');
    return;
  }

  // Load current SMS preference on page load
  await loadSMSPreference(smsToggle, smsStatus);

  // Handle toggle changes
  smsToggle.addEventListener('change', async (event) => {
    const isEnabled = event.target.checked;
    await updateSMSPreference(isEnabled, smsStatus);
  });
}

/**
 * Load current SMS preference from server
 */
async function loadSMSPreference(toggleElement, statusElement) {
  try {
    const response = await fetch('/sms-preferences', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`, // Your auth token function
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const isEnabled = data.preferences.sms_alerts_enabled;

      // Update toggle state
      toggleElement.checked = isEnabled;

      // Update status display if exists
      if (statusElement) {
        statusElement.textContent = isEnabled ? 'SMS Enabled' : 'SMS Disabled';
        statusElement.className = isEnabled ? 'status-enabled' : 'status-disabled';
      }

      console.log('SMS preference loaded:', isEnabled);
    } else {
      console.error('Failed to load SMS preference:', await response.text());
    }
  } catch (error) {
    console.error('Error loading SMS preference:', error);
  }
}

/**
 * Update SMS preference on server
 */
async function updateSMSPreference(enabled, statusElement) {
  try {
    // Show loading state
    if (statusElement) {
      statusElement.textContent = 'Updating...';
      statusElement.className = 'status-updating';
    }

    const response = await fetch('/sms-preferences', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`, // Your auth token function
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sms_alerts_enabled: enabled // Boolean value
      })
    });

    if (response.ok) {
      const data = await response.json();

      // Update status display
      if (statusElement) {
        statusElement.textContent = enabled ? 'SMS Enabled' : 'SMS Disabled';
        statusElement.className = enabled ? 'status-enabled' : 'status-disabled';
      }

      console.log('SMS preference updated:', data.preferences.sms_alerts_enabled);

      // Optional: Show success message
      showNotification('SMS settings updated successfully', 'success');

    } else {
      const errorData = await response.json();
      console.error('Failed to update SMS preference:', errorData);

      // Revert toggle on error
      document.getElementById('sms-toggle').checked = !enabled;

      // Reset status
      if (statusElement) {
        statusElement.textContent = enabled ? 'SMS Disabled' : 'SMS Enabled';
        statusElement.className = enabled ? 'status-disabled' : 'status-enabled';
      }

      // Show error message
      showNotification('Failed to update SMS settings: ' + (errorData.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Error updating SMS preference:', error);

    // Revert toggle on error
    document.getElementById('sms-toggle').checked = !enabled;

    // Show error message
    showNotification('Network error. Please try again.', 'error');
  }
}

/**
 * Get authentication token (implement this based on your auth system)
 */
function getAuthToken() {
  // Replace with your actual token retrieval logic
  // Example: return localStorage.getItem('authToken');
  // Example: return sessionStorage.getItem('jwt');
  // Example: return getCookie('auth_token');

  // For now, return a placeholder - replace with your actual implementation
  return localStorage.getItem('authToken') || sessionStorage.getItem('jwt') || 'YOUR_JWT_TOKEN';
}

/**
 * Show notification to user (implement based on your UI framework)
 */
function showNotification(message, type) {
  // Replace with your notification system
  // Example: toast(message, type);
  // Example: alert(message);

  console.log(`${type.toUpperCase()}: ${message}`);

  // Simple implementation
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    border-radius: 4px;
    color: white;
    background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    z-index: 1000;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSMSToggle);

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeSMSToggle,
    loadSMSPreference,
    updateSMSPreference
  };
}