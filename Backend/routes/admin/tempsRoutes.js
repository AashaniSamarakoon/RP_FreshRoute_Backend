const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const { getTempsByOrderId } = require("../../controllers/admin/tempsController");

router.use(authMiddleware);
router.use(requireRole("admin"));

// GET /api/admin/temps/:orderId – temp details (alerts) for order; orderId = placed_order_id
router.get("/:orderId", getTempsByOrderId);

module.exports = router;
