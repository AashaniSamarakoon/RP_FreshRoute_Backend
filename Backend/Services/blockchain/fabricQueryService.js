/**
 * fabricQueryService.js
 * Read-optimized service for querying Hyperledger Fabric
 * Abstracts blockchain complexity and provides business-friendly data access
 */

const { getContract } = require("./contractService");
const {
  translateEventType,
  formatTimestamp,
} = require("../../utils/blockchainLabelMapper");

/**
 * Query a batch by ID from the blockchain
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID to query (harvestId in chaincode)
 * @returns {Promise<Object>} Batch data
 */
async function queryBatchById(userId, batchId) {
  let connection;
  try {
    // Use StockContract for harvest/batch operations
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    // Query the harvest (batch) using ReadHarvest function
    const resultBytes = await contract.evaluateTransaction(
      "ReadHarvest",
      batchId,
    );
    const resultString = new TextDecoder().decode(resultBytes);
    const batch = JSON.parse(resultString);

    return batch;
  } catch (error) {
    console.error("Error querying batch:", error);
    throw new Error(`Failed to query batch ${batchId}: ${error.message}`);
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Query all batches (with optional filters)
 * @param {string} userId - User ID for wallet access
 * @param {Object} filters - Optional filters (status, farmerId, productType)
 * @returns {Promise<Array>} Array of batches
 */
async function queryAllBatches(userId, filters = {}) {
  let connection;
  try {
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    // Query all harvests (batches) using GetAllHarvests function
    const resultBytes = await contract.evaluateTransaction("GetAllHarvests");
    const resultString = new TextDecoder().decode(resultBytes);
    let batches = JSON.parse(resultString);

    // Apply filters if provided
    if (filters.status) {
      batches = batches.filter((b) => b.status === filters.status);
    }
    if (filters.farmerId) {
      batches = batches.filter((b) => b.farmerId === filters.farmerId);
    }
    if (filters.productType) {
      batches = batches.filter((b) => b.productType === filters.productType);
    }

    return batches;
  } catch (error) {
    console.error("Error querying all batches:", error);
    throw new Error(`Failed to query batches: ${error.message}`);
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Query batch history/timeline (all transactions for a batch)
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID (harvestId)
 * @returns {Promise<Array>} Array of historical events
 */
async function queryBatchHistory(userId, batchId) {
  let connection;
  try {
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    // Query harvest history using GetHarvestHistory function
    const resultBytes = await contract.evaluateTransaction(
      "GetHarvestHistory",
      batchId,
    );
    const resultString = new TextDecoder().decode(resultBytes);
    const history = JSON.parse(resultString);

    // Transform history to timeline events
    const timeline = history.map((record) => ({
      txId: record.txId,
      timestamp: record.timestamp,
      isDelete: record.isDelete,
      value: record.value,
      // Parse the value to extract event details
      ...(record.value ? JSON.parse(record.value) : {}),
    }));

    return timeline;
  } catch (error) {
    console.error("Error querying batch history:", error);
    throw new Error(`Failed to query batch history: ${error.message}`);
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Query batches by owner (farmer, buyer, transporter)
 * @param {string} userId - User ID for wallet access
 * @param {string} ownerId - Owner ID to filter by
 * @param {string} ownerType - 'farmer', 'buyer', or 'transporter'
 * @returns {Promise<Array>} Array of batches
 */
async function queryBatchesByOwner(userId, ownerId, ownerType = "farmer") {
  let connection;
  try {
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    let functionName;
    switch (ownerType) {
      case "farmer":
        functionName = "GetHarvestsByFarmer";
        break;
      case "buyer":
        // For buyer, get all harvests and filter by status
        functionName = "GetAllHarvests";
        break;
      case "transporter":
        // For transporter, get all harvests
        functionName = "GetAllHarvests";
        break;
      default:
        functionName = "GetAllHarvests";
    }

    const resultBytes = await contract.evaluateTransaction(
      functionName,
      ownerId,
    );
    const resultString = new TextDecoder().decode(resultBytes);
    const batches = JSON.parse(resultString);

    return batches;
  } catch (error) {
    console.error("Error querying batches by owner:", error);
    throw new Error(`Failed to query batches by owner: ${error.message}`);
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Search batches by criteria (product type, date range, status)
 * @param {string} userId - User ID for wallet access
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Array of matching batches
 */
async function searchBatches(userId, criteria) {
  let connection;
  try {
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    // For now, get all harvests and filter client-side
    // In production, implement server-side rich queries using CouchDB
    const resultBytes = await contract.evaluateTransaction("GetAllHarvests");
    const resultString = new TextDecoder().decode(resultBytes);
    let batches = JSON.parse(resultString);

    // Apply search filters
    if (criteria.productType) {
      batches = batches.filter((b) =>
        b.productType
          ?.toLowerCase()
          .includes(criteria.productType.toLowerCase()),
      );
    }

    if (criteria.batchId) {
      batches = batches.filter((b) =>
        b.batchId?.toLowerCase().includes(criteria.batchId.toLowerCase()),
      );
    }

    if (criteria.status) {
      batches = batches.filter((b) => b.status === criteria.status);
    }

    if (criteria.farmerId) {
      batches = batches.filter((b) => b.farmerId === criteria.farmerId);
    }

    if (criteria.dateFrom) {
      const dateFrom = new Date(criteria.dateFrom).getTime();
      batches = batches.filter(
        (b) => new Date(b.harvestedDate).getTime() >= dateFrom,
      );
    }

    if (criteria.dateTo) {
      const dateTo = new Date(criteria.dateTo).getTime();
      batches = batches.filter(
        (b) => new Date(b.harvestedDate).getTime() <= dateTo,
      );
    }

    return batches;
  } catch (error) {
    console.error("Error searching batches:", error);
    throw new Error(`Failed to search batches: ${error.message}`);
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Query transaction details by transaction ID
 * @param {string} userId - User ID for wallet access
 * @param {string} txId - Transaction ID
 * @returns {Promise<Object>} Transaction details
 */
async function queryTransactionById(userId, txId) {
  let connection;
  try {
    connection = await getContract(userId, "StockContract");
    const { contract } = connection;

    // Note: This requires implementing GetTransaction in chaincode
    const resultBytes = await contract.evaluateTransaction(
      "GetTransaction",
      txId,
    );
    const resultString = new TextDecoder().decode(resultBytes);
    const transaction = JSON.parse(resultString);

    return transaction;
  } catch (error) {
    console.error("Error querying transaction:", error);
    // If function doesn't exist, return minimal info
    return {
      txId,
      error: "Transaction details not available",
      message: error.message,
    };
  } finally {
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Get verification status for a batch
 * Checks if batch has required quality checks and verifications
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID
 * @returns {Promise<Object>} Verification status
 */
async function getBatchVerificationStatus(userId, batchId) {
  try {
    const batch = await queryBatchById(userId, batchId);
    const history = await queryBatchHistory(userId, batchId);

    // Count quality checks
    const qualityChecks = history.filter((event) =>
      event.functionName?.includes("QualityCheck"),
    );

    // Check for required verifications
    const hasOriginVerification = batch.farmerId && batch.harvestedDate;
    const hasQualityVerification = qualityChecks.length > 0;
    const hasTransportVerification =
      batch.transporterId && batch.status === "IN_TRANSIT";

    const verificationScore = [
      hasOriginVerification,
      hasQualityVerification,
      hasTransportVerification,
    ].filter(Boolean).length;

    return {
      batchId,
      isVerified: verificationScore >= 2,
      verificationScore,
      maxScore: 3,
      verificationPercentage: (verificationScore / 3) * 100,
      checks: {
        origin: hasOriginVerification,
        quality: hasQualityVerification,
        transport: hasTransportVerification,
      },
      qualityCheckCount: qualityChecks.length,
      lastVerified:
        qualityChecks.length > 0
          ? qualityChecks[qualityChecks.length - 1].timestamp
          : null,
    };
  } catch (error) {
    console.error("Error getting verification status:", error);
    throw new Error(`Failed to get verification status: ${error.message}`);
  }
}

/**
 * Get batch statistics (for dashboard KPIs)
 * @param {string} userId - User ID for wallet access
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Statistics
 */
async function getBatchStatistics(userId, filters = {}) {
  try {
    const batches = await queryAllBatches(userId, filters);

    const stats = {
      totalBatches: batches.length,
      byStatus: {},
      byProduct: {},
      totalQuantity: 0,
      verifiedBatches: 0,
    };

    batches.forEach((batch) => {
      // Count by status
      stats.byStatus[batch.status] = (stats.byStatus[batch.status] || 0) + 1;

      // Count by product
      stats.byProduct[batch.productType] =
        (stats.byProduct[batch.productType] || 0) + 1;

      // Sum quantity
      stats.totalQuantity += batch.quantity || 0;

      // Count verified (simple check - has quality data)
      if (batch.qualityGrade || batch.qualityNotes) {
        stats.verifiedBatches++;
      }
    });

    stats.verificationRate =
      batches.length > 0
        ? ((stats.verifiedBatches / batches.length) * 100).toFixed(1)
        : 0;

    return stats;
  } catch (error) {
    console.error("Error getting batch statistics:", error);
    throw new Error(`Failed to get statistics: ${error.message}`);
  }
}

module.exports = {
  queryBatchById,
  queryAllBatches,
  queryBatchHistory,
  queryBatchesByOwner,
  searchBatches,
  queryTransactionById,
  getBatchVerificationStatus,
  getBatchStatistics,
};
