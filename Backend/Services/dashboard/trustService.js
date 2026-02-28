/**
 * trustService.js
 * Service for trust and verification indicators in the dashboard
 * Calculates trust scores and verification status for batches
 */

const fabricQueryService = require("../blockchain/fabricQueryService");

/**
 * Calculate trust score for a batch
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID
 * @returns {Promise<Object>} Trust score data
 */
async function calculateBatchTrustScore(userId, batchId) {
  try {
    // Get batch and history
    const batch = await fabricQueryService.queryBatchById(userId, batchId);
    const history = await fabricQueryService.queryBatchHistory(userId, batchId);

    // Calculate trust factors
    const factors = {
      hasOriginData: calculateOriginScore(batch),
      hasQualityChecks: calculateQualityScore(batch, history),
      hasCompleteChain: calculateChainCompletenessScore(history),
      hasTimestamps: calculateTimestampScore(batch),
      hasMultipleVerifiers: calculateVerifierScore(history),
    };

    // Calculate overall trust score (0-100)
    const weights = {
      hasOriginData: 0.25,
      hasQualityChecks: 0.3,
      hasCompleteChain: 0.2,
      hasTimestamps: 0.15,
      hasMultipleVerifiers: 0.1,
    };

    let totalScore = 0;
    Object.keys(factors).forEach((key) => {
      totalScore += factors[key] * weights[key];
    });

    const trustScore = Math.round(totalScore);

    // Determine trust level
    let trustLevel;
    if (trustScore >= 80) {
      trustLevel = "High";
    } else if (trustScore >= 60) {
      trustLevel = "Medium";
    } else {
      trustLevel = "Low";
    }

    return {
      batchId,
      trustScore,
      trustLevel,
      factors,
      recommendations: generateRecommendations(factors),
    };
  } catch (error) {
    console.error("Error calculating trust score:", error);
    throw error;
  }
}

/**
 * Calculate origin data completeness score
 * @param {Object} batch - Batch data
 * @returns {number} Score (0-100)
 */
function calculateOriginScore(batch) {
  let score = 0;

  if (batch.farmerId) score += 30;
  if (batch.farmerName) score += 20;
  if (batch.farmLocation) score += 30;
  if (batch.harvestedDate) score += 20;

  return score;
}

/**
 * Calculate quality check score
 * @param {Object} batch - Batch data
 * @param {Array} history - Batch history
 * @returns {number} Score (0-100)
 */
function calculateQualityScore(batch, history) {
  let score = 0;

  // Check for quality data in current batch
  if (batch.qualityGrade) score += 50;
  if (batch.qualityNotes) score += 20;

  // Check for quality events in history
  const qualityEvents = history.filter((record) => {
    try {
      const data = JSON.parse(record.value || "{}");
      return data.qualityGrade || data.qualityNotes;
    } catch {
      return false;
    }
  });

  if (qualityEvents.length > 0) score += 20;
  if (qualityEvents.length > 1) score += 10; // Multiple checks

  return Math.min(score, 100);
}

/**
 * Calculate chain completeness score
 * @param {Array} history - Batch history
 * @returns {number} Score (0-100)
 */
function calculateChainCompletenessScore(history) {
  // Check for key lifecycle events
  const eventTypes = new Set();

  history.forEach((record) => {
    try {
      const data = JSON.parse(record.value || "{}");
      if (data.status) {
        eventTypes.add(data.status);
      }
    } catch {
      // Ignore parse errors
    }
  });

  // Expected lifecycle: CREATED, PACKED, QUALITY_CHECKED, IN_TRANSIT, DELIVERED
  const expectedStates = [
    "CREATED",
    "PACKED",
    "QUALITY_CHECKED",
    "IN_TRANSIT",
    "DELIVERED",
  ];
  let foundStates = 0;

  expectedStates.forEach((state) => {
    if (eventTypes.has(state)) {
      foundStates++;
    }
  });

  return Math.round((foundStates / expectedStates.length) * 100);
}

/**
 * Calculate timestamp completeness score
 * @param {Object} batch - Batch data
 * @returns {number} Score (0-100)
 */
function calculateTimestampScore(batch) {
  let score = 0;

  if (batch.createdAt) score += 25;
  if (batch.harvestedDate) score += 25;
  if (batch.updatedAt) score += 25;
  if (batch.lastUpdated) score += 25;

  return score;
}

/**
 * Calculate verifier diversity score
 * @param {Array} history - Batch history
 * @returns {number} Score (0-100)
 */
function calculateVerifierScore(history) {
  const verifiers = new Set();

  history.forEach((record) => {
    try {
      const data = JSON.parse(record.value || "{}");
      if (data.createdBy) verifiers.add(data.createdBy);
      if (data.updatedBy) verifiers.add(data.updatedBy);
    } catch {
      // Ignore parse errors
    }
  });

  // More verifiers = higher trust (up to a point)
  const verifierCount = verifiers.size;
  if (verifierCount >= 3) return 100;
  if (verifierCount === 2) return 70;
  if (verifierCount === 1) return 40;
  return 0;
}

/**
 * Generate recommendations based on trust factors
 * @param {Object} factors - Trust factors
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(factors) {
  const recommendations = [];

  if (factors.hasOriginData < 80) {
    recommendations.push(
      "Complete origin information (farm location, harvest date)",
    );
  }

  if (factors.hasQualityChecks < 80) {
    recommendations.push("Add quality inspection data");
  }

  if (factors.hasCompleteChain < 80) {
    recommendations.push("Ensure all lifecycle stages are recorded");
  }

  if (factors.hasTimestamps < 80) {
    recommendations.push("Record timestamps for all events");
  }

  if (factors.hasMultipleVerifiers < 70) {
    recommendations.push("Involve multiple parties in verification");
  }

  if (recommendations.length === 0) {
    recommendations.push("All trust criteria met - excellent traceability!");
  }

  return recommendations;
}

/**
 * Get trust dashboard for a user (aggregate trust metrics)
 * @param {string} userId - User ID for wallet access
 * @param {Object} user - User object
 * @returns {Promise<Object>} Trust dashboard data
 */
async function getTrustDashboard(userId, user) {
  try {
    // Get user's batches
    let batches;
    if (user.role === "farmer") {
      batches = await fabricQueryService.queryBatchesByOwner(
        userId,
        user.id,
        "farmer",
      );
    } else if (user.role === "buyer" || user.role === "admin") {
      batches = await fabricQueryService.queryAllBatches(userId);
    } else {
      batches = [];
    }

    // Calculate trust scores for all batches (limit for performance)
    const batchLimit = 50;
    const limitedBatches = batches.slice(0, batchLimit);

    const trustScores = await Promise.all(
      limitedBatches.map(async (batch) => {
        try {
          return await calculateBatchTrustScore(userId, batch.batchId);
        } catch {
          return {
            batchId: batch.batchId,
            trustScore: 0,
            trustLevel: "Unknown",
          };
        }
      }),
    );

    // Calculate aggregate metrics
    const totalBatches = trustScores.length;
    const averageTrustScore =
      trustScores.reduce((sum, ts) => sum + ts.trustScore, 0) / totalBatches;

    const trustLevelCounts = {
      High: trustScores.filter((ts) => ts.trustLevel === "High").length,
      Medium: trustScores.filter((ts) => ts.trustLevel === "Medium").length,
      Low: trustScores.filter((ts) => ts.trustLevel === "Low").length,
    };

    return {
      totalBatches,
      averageTrustScore: Math.round(averageTrustScore),
      trustLevelCounts,
      trustLevelPercentages: {
        High: Math.round((trustLevelCounts.High / totalBatches) * 100),
        Medium: Math.round((trustLevelCounts.Medium / totalBatches) * 100),
        Low: Math.round((trustLevelCounts.Low / totalBatches) * 100),
      },
      topBatches: trustScores
        .sort((a, b) => b.trustScore - a.trustScore)
        .slice(0, 5),
    };
  } catch (error) {
    console.error("Error getting trust dashboard:", error);
    throw error;
  }
}

module.exports = {
  calculateBatchTrustScore,
  getTrustDashboard,
};
