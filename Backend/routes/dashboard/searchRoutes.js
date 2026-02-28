/**
 * searchRoutes.js
 * Routes for search-related dashboard endpoints
 */

const express = require("express");
const router = express.Router();
const searchController = require("../../controllers/dashboard/searchController");

// Global search
router.get("/", searchController.globalSearch);

// Advanced search
router.post("/advanced", searchController.advancedSearch);

// Get search suggestions (autocomplete)
router.get("/suggestions", searchController.getSearchSuggestions);

// Get available filter options
router.get("/filters", searchController.getFilterOptions);

module.exports = router;
