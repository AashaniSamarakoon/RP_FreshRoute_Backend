const farmerDashboard = async (req, res) => {
  // TODO: replace with real farmer data later
  res.json({
    message: `Welcome, farmer ${req.user.name}`,
    upcomingPickups: [],
    stats: {
      totalShipments: 0,
      spoilageReduced: 0,
    },
  });
};

module.exports = { farmerDashboard };
