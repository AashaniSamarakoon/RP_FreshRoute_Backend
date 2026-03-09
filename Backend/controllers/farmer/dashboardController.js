const farmerDashboard = async (req, res) => {
  // Build user name from req.user
  const userName = req.user.first_name 
    ? `${req.user.first_name} ${req.user.last_name || ''}`.trim()
    : 'Farmer';
  
  res.json({
    message: `Welcome, ${userName}`,
    upcomingPickups: [],
    stats: {
      totalShipments: 0,
      spoilageReduced: 0,
    },
  });
};

module.exports = { farmerDashboard };
