const buyerDashboard = async (req, res) => {
  res.json({
    message: `Welcome, buyer ${req.user.name}`,
    openOrders: [],
    deliveriesInTransit: [],
  });
};

module.exports = { buyerDashboard };
