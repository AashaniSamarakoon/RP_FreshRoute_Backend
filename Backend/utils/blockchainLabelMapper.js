/**
 * blockchainLabelMapper.js
 * Translates blockchain terminology to business-friendly labels
 * Ensures business users never see technical blockchain jargon
 */

/**
 * Terminology mapping from blockchain to business terms
 */
const TERMINOLOGY_MAP = {
  // Core concepts
  transaction: "Event",
  transactions: "Events",
  block: "Record",
  blocks: "Records",
  channel: "Network",
  channels: "Networks",
  endorsement: "Verification",
  endorsements: "Verifications",
  hash: "Proof",
  hashes: "Proofs",

  // Technical terms
  chaincode: "Smart Contract",
  peer: "Network Node",
  orderer: "Coordinator",
  msp: "Organization",
  "transaction id": "Event ID",
  "block number": "Record Number",
  "block height": "Record Count",
  timestamp: "Date & Time",

  // Status terms
  committed: "Confirmed",
  pending: "In Progress",
  endorsed: "Verified",
  validated: "Approved",
  rejected: "Declined",
};

/**
 * Status mapping for business-friendly status labels
 */
const STATUS_MAP = {
  // Batch lifecycle
  CREATED: "Harvested",
  PACKED: "Packed",
  QUALITY_CHECKED: "Inspected",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  RECEIVED: "Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",

  // Transaction status
  PENDING: "Processing",
  COMMITTED: "Confirmed",
  ENDORSED: "Verified",
  FAILED: "Failed",
};

/**
 * Event types mapping (transaction function names to business events)
 */
const EVENT_TYPE_MAP = {
  CreateBatch: "Batch Created",
  UpdateBatchStatus: "Status Updated",
  TransferOwnership: "Ownership Transferred",
  AddQualityCheck: "Quality Inspection",
  UpdateLocation: "Location Updated",
  CompleteBatch: "Batch Completed",
  CancelBatch: "Batch Cancelled",
};

/**
 * Translate blockchain term to business-friendly label
 * @param {string} term - Blockchain terminology
 * @param {boolean} capitalize - Whether to capitalize the result
 * @returns {string} Business-friendly label
 */
function translateTerm(term, capitalize = false) {
  const lowerTerm = term.toLowerCase();
  let translated = TERMINOLOGY_MAP[lowerTerm] || term;

  if (capitalize) {
    translated = translated.charAt(0).toUpperCase() + translated.slice(1);
  }

  return translated;
}

/**
 * Translate batch status to business-friendly label
 * @param {string} status - Technical status
 * @returns {string} Business status label
 */
function translateStatus(status) {
  return STATUS_MAP[status] || status;
}

/**
 * Translate transaction function name to event type
 * @param {string} functionName - Chaincode function name
 * @returns {string} Business event type
 */
function translateEventType(functionName) {
  return EVENT_TYPE_MAP[functionName] || functionName;
}

/**
 * Format a blockchain hash for display
 * In business view: show short proof, in technical view: show full hash
 * @param {string} hash - Full hash
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {string} Formatted hash
 */
function formatHash(hash, viewMode = "business") {
  if (!hash) return "N/A";

  if (viewMode === "technical") {
    return hash;
  }

  // Business view: show first 8 and last 4 characters
  if (hash.length > 12) {
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 4)}`;
  }

  return hash;
}

/**
 * Format timestamp to human-readable format
 * @param {number|string} timestamp - Unix timestamp or ISO string
 * @param {string} format - 'short', 'long', or 'relative'
 * @returns {string} Formatted date
 */
function formatTimestamp(timestamp, format = "long") {
  if (!timestamp) return "N/A";

  const date = new Date(timestamp);

  if (isNaN(date.getTime())) return "Invalid Date";

  if (format === "short") {
    return date.toLocaleDateString();
  }

  if (format === "relative") {
    return getRelativeTime(date);
  }

  // Long format: Dec 25, 2023 at 2:30 PM
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {Date} date - Date object
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

/**
 * Build Fabric Explorer deep link URL
 * @param {Object} details - Transaction/block details
 * @param {string} type - 'transaction', 'block', or 'channel'
 * @returns {string} Explorer URL
 */
function buildExplorerLink(details, type = "transaction") {
  const explorerBaseUrl =
    process.env.FABRIC_EXPLORER_URL || "http://localhost:8080";
  const channel = details.channel || "freshroute-channel";

  switch (type) {
    case "transaction":
      return `${explorerBaseUrl}/#/transaction/${channel}/${details.txId}`;
    case "block":
      return `${explorerBaseUrl}/#/block/${channel}/${details.blockNumber}`;
    case "channel":
      return `${explorerBaseUrl}/#/channel/${channel}`;
    default:
      return explorerBaseUrl;
  }
}

/**
 * Transform blockchain data to business view
 * Removes technical fields and translates terminology
 * @param {Object} data - Raw blockchain data
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Object} Transformed data
 */
function transformToBusinessView(data, viewMode = "business") {
  if (viewMode === "technical") {
    return data; // Return as-is for technical view
  }

  // Clone data to avoid mutating original
  const transformed = { ...data };

  // Remove technical fields in business view
  const technicalFields = [
    "txId",
    "blockNumber",
    "blockHash",
    "channelId",
    "endorsements",
    "mspId",
    "validationCode",
  ];

  technicalFields.forEach((field) => {
    delete transformed[field];
  });

  // Translate status if present
  if (transformed.status) {
    transformed.statusLabel = translateStatus(transformed.status);
  }

  // Format timestamps
  if (transformed.timestamp) {
    transformed.dateTime = formatTimestamp(transformed.timestamp);
    transformed.relativeTime = formatTimestamp(
      transformed.timestamp,
      "relative",
    );
  }

  // Format hash as proof
  if (transformed.hash) {
    transformed.proof = formatHash(transformed.hash, viewMode);
    delete transformed.hash;
  }

  return transformed;
}

/**
 * Transform event/transaction data for timeline display
 * @param {Object} event - Raw event data
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Object} Timeline event
 */
function transformToTimelineEvent(event, viewMode = "business") {
  const timelineEvent = {
    id: event.txId || event.id,
    type: translateEventType(event.functionName || event.eventType),
    timestamp: event.timestamp,
    dateTime: formatTimestamp(event.timestamp),
    relativeTime: formatTimestamp(event.timestamp, "relative"),
    actor: event.createdBy || event.actor || "System",
    verified: event.isValid !== false,
  };

  // Add description based on event type
  if (event.functionName === "CreateBatch") {
    timelineEvent.description = `Batch created by ${event.createdBy}`;
  } else if (event.functionName === "UpdateBatchStatus") {
    timelineEvent.description = `Status changed to ${translateStatus(event.newStatus)}`;
  } else if (event.functionName === "TransferOwnership") {
    timelineEvent.description = `Transferred from ${event.fromOwner} to ${event.toOwner}`;
  }

  // Include technical details if in technical mode
  if (viewMode === "technical") {
    timelineEvent.technical = {
      txId: event.txId,
      blockNumber: event.blockNumber,
      channelId: event.channelId,
      explorerLink: buildExplorerLink(event, "transaction"),
    };
  }

  return timelineEvent;
}

module.exports = {
  translateTerm,
  translateStatus,
  translateEventType,
  formatHash,
  formatTimestamp,
  getRelativeTime,
  buildExplorerLink,
  transformToBusinessView,
  transformToTimelineEvent,
};
