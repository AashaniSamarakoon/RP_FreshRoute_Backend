const axios = require("axios");

const SRI_LANKA_CITIES = {
  colombo: { lat: 6.9271, lng: 79.8612 },
  dambulla: { lat: 7.8731, lng: 80.7718 },
  kandy: { lat: 7.2906, lng: 80.6337 },
  embilipitiya: { lat: 6.2929, lng: 80.8562 },
  nuwara_eliya: { lat: 6.9497, lng: 80.7891 },
  jaffna: { lat: 9.6615, lng: 80.0255 },
  hambantota: { lat: 6.1429, lng: 81.1212 },
};

// Standard Haversine formula for straight-line distance (Fallback)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// REAL-WORLD ROUTING (OSRM API)
// Calculates actual driving distance and duration over road networks.
async function getDrivingDistanceKm(lat1, lon1, lat2, lon2) {
  try {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
       console.log(`[ROUTING] ⚠️ Missing coordinates. Using fallback distance 0km.`);
       return { distanceKm: 0, durationMins: 0, via: 'fallback-missing' };
    }

    console.log(`[ROUTING] 📡 Fetching real driving distance via OSRM (${lat1},${lon1} to ${lat2},${lon2})...`);
    
    // Using OSRM public test server (Requires long,lat format)
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    
    const response = await axios.get(url);
    
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const distanceKm = Math.round(route.distance / 100) / 10; // Convert meters to km with 1 decimal
      const durationMins = Math.round(route.duration / 60);     // Convert seconds to minutes

      console.log(`[ROUTING] ✅ Success! OSRM Driving Distance: ${distanceKm}km, Est Duration: ${durationMins}mins`);
      return { distanceKm, durationMins, via: 'osrm' };
    }
    
    throw new Error('OSRM API returned no routes');

  } catch (error) {
    console.error(`[ROUTING] ❌ OSRM API Error: ${error.message}. Falling back to straight-line distance.`);
    // Fallback to Haversine if API is down/rate-limited
    const fallbackDist = calculateDistanceKm(lat1, lon1, lat2, lon2);
    // Estimate roughly 40km/h average speed in SL context for fallback duration
    const fallbackDuration = Math.round((fallbackDist / 40) * 60); 
    
    console.log(`[ROUTING] ⚠️ Fallback Haversine Distance: ${fallbackDist}km, Est Duration: ${fallbackDuration}mins`);
    return { distanceKm: fallbackDist, durationMins: fallbackDuration, via: 'haversine-fallback' };
  }
}

// Fetch real weather data
async function getRealWeather(lat, lng) {
  try {
    if (!lat || !lng) throw new Error("Missing coordinates");

    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;

    const response = await axios.get(url);
    const data = response.data;

    // Check for rain codes (2xx, 3xx, 5xx)
    const conditionId = data.weather[0].id;
    const isRaining = conditionId >= 200 && conditionId < 600;

    return {
      temp_c: data.main.temp,
      raining: isRaining,
      condition: data.weather[0].main,
    };
  } catch (error) {
    console.error("[Weather API Error]", error.message);
    // Fallback to average SL conditions if API fails
    return { temp_c: 30, raining: false, condition: "Unknown" };
  }
}

module.exports = { SRI_LANKA_CITIES, calculateDistanceKm, getDrivingDistanceKm, getRealWeather };
