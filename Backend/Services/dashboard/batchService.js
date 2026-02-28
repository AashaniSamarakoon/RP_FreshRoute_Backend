/**
 * batchService.js
 * Business logic for batch operations in the dashboard
 * Transforms blockchain data into business-friendly DTOs
 */

const fabricQueryService = require("../blockchain/fabricQueryService");
const {
  transformToBusinessView,
  translateStatus,
  formatTimestamp,
} = require("../../utils/blockchainLabelMapper");
const { canAccessBatch } = require("../../utils/roleMapper");

/**
 * Get batch details with business-friendly formatting
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID
 * @param {Object} user - User object (id, role)
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Promise<Object>} Formatted batch data
 */
async function getBatchDetails(userId, batchId, user, viewMode = "business") {
  try {
    // Query batch from blockchain
    const batch = await fabricQueryService.queryBatchById(userId, batchId);

    // Check access permissions
    if (!canAccessBatch(batch, user)) {
      throw new Error(
        "Access denied: You do not have permission to view this batch",
      );
    }

    // Get verification status
    const verificationStatus =
      await fabricQueryService.getBatchVerificationStatus(userId, batchId);

    // Build business DTO
    const batchDTO = {
      batchId: batch.batchId,
      productType: batch.productType,
      quantity: batch.quantity,
      unit: batch.unit || "kg",
      origin: batch.farmLocation || batch.origin,
      currentOwner: batch.currentOwner,
      currentOwnerId: batch.currentOwnerId,
      status: batch.status,
      statusLabel: translateStatus(batch.status),
      harvestedDate: formatTimestamp(batch.harvestedDate),
      lastUpdated: formatTimestamp(batch.lastUpdated || batch.updatedAt),

      // Verification indicators
      isVerified: verificationStatus.isVerified,
      verificationScore: verificationStatus.verificationScore,
      verificationPercentage: verificationStatus.verificationPercentage,

      // Quality data (if available)
      qualityGrade: batch.qualityGrade,
      qualityNotes: batch.qualityNotes,

      // Farmer info
      farmerId: batch.farmerId,
      farmerName: batch.farmerName,

      // Buyer info (if applicable)
      buyerId: batch.buyerId,
      buyerName: batch.buyerName,

      // Transporter info (if applicable)
      transporterId: batch.transporterId,
      transporterName: batch.transporterName,
    };

    // Add technical details if in technical mode
    if (viewMode === "technical") {
      batchDTO.technical = {
        createdBy: batch.createdBy,
        createdAt: batch.createdAt,
        updatedBy: batch.updatedBy,
        updatedAt: batch.updatedAt,
        docType: batch.docType,
      };
    }

    return transformToBusinessView(batchDTO, viewMode);
  } catch (error) {
    console.error("Error getting batch details:", error);
    throw error;
  }
}

/**
 * Get list of batches for a user (filtered by role and permissions)
 * @param {string} userId - User ID for wallet access
 * @param {Object} user - User object (id, role)
 * @param {Object} filters - Optional filters
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Promise<Array>} Array of batch summaries
 */
async function getBatchList(userId, user, filters = {}, viewMode = "business") {
  try {
    let batches;

    // Query based on role
    if (user.role === "farmer") {
      batches = await fabricQueryService.queryBatchesByOwner(
        userId,
        user.id,
        "farmer",
      );
    } else if (user.role === "buyer") {
      batches = await fabricQueryService.queryAllBatches(userId, filters);
    } else if (user.role === "transporter") {
      batches = await fabricQueryService.queryBatchesByOwner(
        userId,
        user.id,
        "transporter",
      );
    } else if (["admin", "auditor", "developer"].includes(user.role)) {
      batches = await fabricQueryService.queryAllBatches(userId, filters);
    } else {
      batches = [];
    }

    // Filter by access permissions
    batches = batches.filter((batch) => canAccessBatch(batch, user));

    // Transform to summary DTOs
    const batchSummaries = batches.map((batch) => ({
      batchId: batch.batchId,
      productType: batch.productType,
      quantity: batch.quantity,
      unit: batch.unit || "kg",
      status: batch.status,
      statusLabel: translateStatus(batch.status),
      origin: batch.farmLocation || batch.origin,
      harvestedDate: formatTimestamp(batch.harvestedDate, "short"),
      currentOwner: batch.currentOwner,
      farmerName: batch.farmerName,
      // Simple verification indicator
      isVerified: !!(batch.qualityGrade || batch.qualityNotes),
    }));

    return batchSummaries;
  } catch (error) {
    console.error("Error getting batch list:", error);
    throw error;
  }
}

/**
 * Search batches with business-friendly criteria
 * @param {string} userId - User ID for wallet access
 * @param {Object} searchParams - Search parameters
 * @param {Object} user - User object
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Promise<Array>} Search results
 */
async function searchBatches(
  userId,
  searchParams,
  user,
  viewMode = "business",
) {
  try {
    // Build search criteria
    const criteria = {
      batchId: searchParams.batchId,
      productType: searchParams.productType,
      farmerId: searchParams.farmerId,
      status: searchParams.status,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
    };

    // Execute search
    let batches = await fabricQueryService.searchBatches(userId, criteria);

    // Filter by access permissions
    batches = batches.filter((batch) => canAccessBatch(batch, user));

    // Transform to DTOs
    const results = batches.map((batch) =>
      transformToBusinessView(
        {
          batchId: batch.batchId,
          productType: batch.productType,
          quantity: batch.quantity,
          status: batch.status,
          statusLabel: translateStatus(batch.status),
          origin: batch.farmLocation || batch.origin,
          harvestedDate: formatTimestamp(batch.harvestedDate),
          farmerName: batch.farmerName,
          isVerified: !!(batch.qualityGrade || batch.qualityNotes),
        },
        viewMode,
      ),
    );

    return results;
  } catch (error) {
    console.error("Error searching batches:", error);
    throw error;
  }
}

/**
 * Get batch count by status for a user
 * @param {string} userId - User ID for wallet access
 * @param {Object} user - User object
 * @returns {Promise<Object>} Count by status
 */
async function getBatchCountByStatus(userId, user) {
  try {
    const batches = await getBatchList(userId, user);

    const counts = {
      harvested: 0,
      packed: 0,
      inspected: 0,
      inTransit: 0,
      delivered: 0,
      total: batches.length,
    };

    batches.forEach((batch) => {
      switch (batch.status) {
        case "CREATED":
          counts.harvested++;
          break;
        case "PACKED":
          counts.packed++;
          break;
        case "QUALITY_CHECKED":
          counts.inspected++;
          break;
        case "IN_TRANSIT":
          counts.inTransit++;
          break;
        case "DELIVERED":
        case "RECEIVED":
        case "COMPLETED":
          counts.delivered++;
          break;
      }
    });

    return counts;
  } catch (error) {
    console.error("Error getting batch counts:", error);
    throw error;
  }
}

/**
 * Get recent batches for dashboard
 * @param {string} userId - User ID for wallet access
 * @param {Object} user - User object
 * @param {number} limit - Number of batches to return
 * @returns {Promise<Array>} Recent batches
 */
async function getRecentBatches(userId, user, limit = 10) {
  try {
    const batches = await getBatchList(userId, user);

    // Sort by harvest date (newest first)
    batches.sort((a, b) => {
      const dateA = new Date(a.harvestedDate);
      const dateB = new Date(b.harvestedDate);
      return dateB - dateA;
    });

    return batches.slice(0, limit);
  } catch (error) {
    console.error("Error getting recent batches:", error);
    throw error;
  }
}

module.exports = {
  getBatchDetails,
  getBatchList,
  searchBatches,
  getBatchCountByStatus,
  getRecentBatches,
};
