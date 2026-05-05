const { isProUser } = require("../Services/pro/subscriptionService");

module.exports = async function requirePro(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Missing token" });

    const { isPro, subscription } = await isProUser(userId);
    if (!isPro) {
      return res.status(402).json({
        code: "PRO_REQUIRED",
        message: "Pro plan required to access this feature",
        action: { type: "upgrade", endpoint: "/api/pro/subscribe/init" },
        subscription: subscription || null,
      });
    }

    req.proSubscription = subscription;
    return next();
  } catch (err) {
    console.error("requirePro error", err);
    return res.status(500).json({ message: "Failed to verify Pro subscription" });
  }
};
