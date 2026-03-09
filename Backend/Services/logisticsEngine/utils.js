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

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
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

async function getDrivingDistanceKm(lat1, lon1, lat2, lon2) {
  try {
    if (!lat1 || !lon1 || !lat2 || !lon2)
      return { distanceKm: 0, durationMins: 0, via: "fallback-missing" };
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await axios.get(url);
    if (response.data?.routes?.length > 0) {
      const route = response.data.routes[0];
      return {
        distanceKm: Math.round(route.distance / 100) / 10,
        durationMins: Math.round(route.duration / 60),
        via: "osrm",
      };
    }
    throw new Error("No routes");
  } catch (error) {
    const fallbackDist = calculateDistanceKm(lat1, lon1, lat2, lon2);
    return {
      distanceKm: fallbackDist,
      durationMins: Math.round((fallbackDist / 40) * 60),
      via: "haversine-fallback",
    };
  }
}

async function getRealWeather(lat, lng) {
  try {
    if (!lat || !lng) throw new Error("Missing coordinates");
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey || "e28a2977338bd63d3d54dc6c3f4f5a29"}&units=metric`;
    const response = await axios.get(url);
    const next24Hrs = response.data.list.slice(0, 8);
    const maxTempC = Math.max(...next24Hrs.map((p) => p.main.temp_max));
    const isRaining = next24Hrs.some(
      (p) => p.weather[0].id >= 200 && p.weather[0].id < 600,
    );
    return {
      temp_c: maxTempC,
      raining: isRaining,
      condition: isRaining ? "Rain Forecasted" : "Clear/Clouds",
    };
  } catch (error) {
    return { temp_c: 30, raining: false, condition: "Unknown (Fallback)" };
  }
}

module.exports = {
  SRI_LANKA_CITIES,
  calculateDistanceKm,
  getDrivingDistanceKm,
  getRealWeather,
};
