// utils/logisticsUtils.js

// 1. COORDINATES MAP (Major Sri Lankan Logistics Hubs)
// If the order doesn't have exact lat/long, we fallback to these.
const SRI_LANKA_CITIES = {
  colombo: { lat: 6.9271, lng: 79.8612 },
  dambulla: { lat: 7.8731, lng: 80.7718 },
  kandy: { lat: 7.2906, lng: 80.6337 },
  embilipitiya: { lat: 6.2929, lng: 80.8562 },
  nuwara_eliya: { lat: 6.9497, lng: 80.7891 },
  jaffna: { lat: 9.6615, lng: 80.0255 },
  hambantota: { lat: 6.1429, lng: 81.1212 },
};

// 2. HAVERSINE FORMULA (Calculate real distance between coordinates)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return Math.round(d * 10) / 10; // Round to 1 decimal
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// 3. MOCK WEATHER API
// Returns realistic weather based on "Month" logic or Random
async function getMockWeather(dateString, locationName) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Mock Logic:
      // Nuwara Eliya is cold.
      // Dambulla/Colombo are hot.
      const loc = locationName.toLowerCase();
      let baseTemp = 30; // Default SL hot temp

      if (loc.includes("nuwara")) baseTemp = 18;
      else if (loc.includes("kandy")) baseTemp = 25;

      // Random variance +/- 3 degrees
      const currentTemp = baseTemp + Math.floor(Math.random() * 6) - 3;

      // Random Rain (30% chance)
      const isRaining = Math.random() < 0.3;

      resolve({
        temp_c: currentTemp,
        raining: isRaining,
        condition: isRaining ? "Rainy" : "Sunny",
      });
    }, 500); // 500ms API delay
  });
}

module.exports = { SRI_LANKA_CITIES, calculateDistanceKm, getMockWeather };
