const transporterDashboard = async (req, res) => {
  // Build user name from req.user
  const userName = req.user.first_name 
    ? `${req.user.first_name} ${req.user.last_name || ''}`.trim()
    : 'Transporter';
  
  res.json({
    message: `Welcome, ${userName}`,
    todayJobs: [],
    vehicleStatus: [],
  });
};

module.exports = { transporterDashboard };
