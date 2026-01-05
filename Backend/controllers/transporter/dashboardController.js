const transporterDashboard = async (req, res) => {
  res.json({
    message: `Welcome, transporter ${req.user.name}`,
    todayJobs: [],
    vehicleStatus: [],
  });
};

module.exports = { transporterDashboard };
