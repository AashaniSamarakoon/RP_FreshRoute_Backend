/**
 * roleMapper.js
 * Maps user roles to blockchain organizations and permissions
 * Determines what data and views each role can access
 */

const ROLE_TO_ORG = {
  farmer: "FarmerOrgMSP",
  buyer: "BuyerOrgMSP",
  transporter: "TransporterOrgMSP",
  admin: "AdminOrgMSP",
  auditor: "AdminOrgMSP", // Auditors use admin org but have different permissions
  developer: "AdminOrgMSP", // Developers also use admin org
};

const ROLE_PERMISSIONS = {
  farmer: {
    canViewTechnical: false,
    canAccessExplorer: false,
    canViewAllBatches: false,
    canViewOwnBatches: true,
    canCreateBatches: true,
    dashboardFeatures: ["batch-list", "timeline", "verification"],
  },
  buyer: {
    canViewTechnical: false,
    canAccessExplorer: false,
    canViewAllBatches: true, // Buyers can see all available batches
    canViewOwnBatches: true,
    canCreateBatches: false,
    dashboardFeatures: ["batch-search", "timeline", "verification", "quality"],
  },
  transporter: {
    canViewTechnical: false,
    canAccessExplorer: false,
    canViewAllBatches: false,
    canViewOwnBatches: true, // Only batches they're transporting
    canCreateBatches: false,
    dashboardFeatures: ["batch-list", "timeline", "location"],
  },
  admin: {
    canViewTechnical: true,
    canAccessExplorer: true,
    canViewAllBatches: true,
    canViewOwnBatches: true,
    canCreateBatches: true,
    dashboardFeatures: [
      "batch-list",
      "batch-search",
      "timeline",
      "verification",
      "quality",
      "analytics",
      "location",
    ],
  },
  auditor: {
    canViewTechnical: true, // Auditors can toggle technical view
    canAccessExplorer: true,
    canViewAllBatches: true,
    canViewOwnBatches: true,
    canCreateBatches: false,
    dashboardFeatures: [
      "batch-list",
      "batch-search",
      "timeline",
      "verification",
      "quality",
      "audit-trail",
    ],
  },
  developer: {
    canViewTechnical: true,
    canAccessExplorer: true,
    canViewAllBatches: true,
    canViewOwnBatches: true,
    canCreateBatches: true,
    dashboardFeatures: [
      "batch-list",
      "batch-search",
      "timeline",
      "verification",
      "quality",
      "analytics",
      "location",
      "technical",
    ],
  },
};

/**
 * Get the blockchain organization MSP ID for a user role
 * @param {string} role - User role (farmer, buyer, transporter, admin, auditor, developer)
 * @returns {string} MSP ID
 */
function getOrgForRole(role) {
  return ROLE_TO_ORG[role] || "AdminOrgMSP";
}

/**
 * Get permissions for a specific role
 * @param {string} role - User role
 * @returns {Object} Permission object
 */
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin;
}

/**
 * Check if a role can view technical details
 * @param {string} role - User role
 * @returns {boolean}
 */
function canViewTechnical(role) {
  const permissions = getPermissionsForRole(role);
  return permissions.canViewTechnical;
}

/**
 * Check if a role can access Fabric Explorer
 * @param {string} role - User role
 * @returns {boolean}
 */
function canAccessExplorer(role) {
  const permissions = getPermissionsForRole(role);
  return permissions.canAccessExplorer;
}

/**
 * Determine the view mode based on request and role
 * @param {Object} req - Express request object
 * @returns {string} 'business' or 'technical'
 */
function determineViewMode(req) {
  const requestedView = req.query.view || "business";
  const userRole = req.user?.role;

  // If technical view requested but user doesn't have permission, default to business
  if (requestedView === "technical" && !canViewTechnical(userRole)) {
    return "business";
  }

  return requestedView;
}

/**
 * Filter batch data based on user role and ownership
 * @param {Object} batch - Batch data
 * @param {Object} user - User object with id and role
 * @returns {boolean} Whether user can access this batch
 */
function canAccessBatch(batch, user) {
  const permissions = getPermissionsForRole(user.role);

  // Admin, auditor, developer can see everything
  if (permissions.canViewAllBatches) {
    return true;
  }

  // Check ownership based on role
  if (user.role === "farmer") {
    return batch.farmerId === user.id || batch.createdBy === user.id;
  }

  if (user.role === "buyer") {
    return batch.buyerId === user.id || batch.currentOwner === user.id;
  }

  if (user.role === "transporter") {
    return (
      batch.transporterId === user.id || batch.assignedTransporter === user.id
    );
  }

  return false;
}

/**
 * Get dashboard features available for a role
 * @param {string} role - User role
 * @returns {Array<string>} Available features
 */
function getDashboardFeatures(role) {
  const permissions = getPermissionsForRole(role);
  return permissions.dashboardFeatures;
}

module.exports = {
  getOrgForRole,
  getPermissionsForRole,
  canViewTechnical,
  canAccessExplorer,
  determineViewMode,
  canAccessBatch,
  getDashboardFeatures,
};
