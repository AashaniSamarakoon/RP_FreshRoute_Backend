/**
 * searchController.js
 * Controller for global search functionality in the dashboard
 * Handles batch search, product search, and advanced filtering
 */

const batchService = require("../../Services/dashboard/batchService");
const fabricQueryService = require("../../Services/blockchain/fabricQueryService");
const { determineViewMode, canAccessBatch } = require("../../utils/roleMapper");
const { translateStatus } = require("../../utils/blockchainLabelMapper");

/**
 * Global search across batches
 * GET /api/dashboard/search?q=mango&type=batch&dateFrom=2024-01-01
 */
async function globalSearch(req, res) {
  try {
    const viewMode = determineViewMode(req);
    const userId = req.user.id;
    const user = req.user;

    const { q, type, dateFrom, dateTo } = req.query;

    let results = [];

    // Determine search type
    const searchType = type || "batch"; // default to batch search

    if (searchType === "batch") {
      // Search batches
      const searchParams = {
        batchId: q,
        productType: q,
        dateFrom,
        dateTo,
      };

      results = await batchService.searchBatches(
        userId,
        searchParams,
        user,
        viewMode,
      );
    }

    res.json({
      success: true,
      data: results,
      count: results.length,
      searchType,
      query: q,
      viewMode,
    });
  } catch (error) {
    console.error("Error in globalSearch:", error);
    res.status(500).json({
      success: false,
      message: "Search failed",
      error: error.message,
    });
  }
}

/**
 * Advanced batch search with multiple criteria
 * POST /api/dashboard/search/advanced
 * Body: { batchId, productType, farmerId, status, dateFrom, dateTo }
 */
async function advancedSearch(req, res) {
  try {
    const viewMode = determineViewMode(req);
    const userId = req.user.id;
    const user = req.user;

    const searchParams = req.body;

    const results = await batchService.searchBatches(
      userId,
      searchParams,
      user,
      viewMode,
    );

    res.json({
      success: true,
      data: results,
      count: results.length,
      criteria: searchParams,
      viewMode,
    });
  } catch (error) {
    console.error("Error in advancedSearch:", error);
    res.status(500).json({
      success: false,
      message: "Advanced search failed",
      error: error.message,
    });
  }
}

/**
 * Get search suggestions (autocomplete)
 * GET /api/dashboard/search/suggestions?q=man&field=productType
 */
async function getSearchSuggestions(req, res) {
  try {
    const { q, field } = req.query;
    const userId = req.user.id;
    const user = req.user;

    if (!q || !field) {
      return res.status(400).json({
        success: false,
        message: "Query (q) and field parameters are required",
      });
    }

    // Get all batches accessible to user
    const batches = await batchService.getBatchList(userId, user);

    // Extract unique values for the specified field
    const suggestions = new Set();
    batches.forEach((batch) => {
      const value = batch[field];
      if (value && value.toLowerCase().includes(q.toLowerCase())) {
        suggestions.add(value);
      }
    });

    res.json({
      success: true,
      data: Array.from(suggestions).slice(0, 10), // Limit to 10 suggestions
      field,
      query: q,
    });
  } catch (error) {
    console.error("Error in getSearchSuggestions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get search suggestions",
      error: error.message,
    });
  }
}

/**
 * Get available filter options for search
 * GET /api/dashboard/search/filters
 */
async function getFilterOptions(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    // Get all batches to extract unique filter values
    const batches = await batchService.getBatchList(userId, user);

    const productTypes = new Set();
    const statuses = new Set();
    const farmers = new Set();

    batches.forEach((batch) => {
      if (batch.productType) productTypes.add(batch.productType);
      if (batch.status) statuses.add(batch.status);
      if (batch.farmerName) farmers.add(batch.farmerName);
    });

    res.json({
      success: true,
      data: {
        productTypes: Array.from(productTypes).sort(),
        statuses: Array.from(statuses).map((s) => ({
          value: s,
          label: translateStatus(s),
        })),
        farmers: Array.from(farmers).sort(),
      },
    });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get filter options",
      error: error.message,
    });
  }
}

module.exports = {
  globalSearch,
  advancedSearch,
  getSearchSuggestions,
  getFilterOptions,
};
