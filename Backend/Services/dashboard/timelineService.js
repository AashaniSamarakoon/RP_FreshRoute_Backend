/**
 * timelineService.js
 * Service for generating product lifecycle timelines
 * Transforms blockchain transaction history into visual timeline events
 */

const fabricQueryService = require("../blockchain/fabricQueryService");
const {
  transformToTimelineEvent,
  translateEventType,
  formatTimestamp,
  buildExplorerLink,
} = require("../../utils/blockchainLabelMapper");

/**
 * Get complete timeline for a batch
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID
 * @param {string} viewMode - 'business' or 'technical'
 * @returns {Promise<Object>} Timeline data
 */
async function getBatchTimeline(userId, batchId, viewMode = "business") {
  try {
    // Get batch details
    const batch = await fabricQueryService.queryBatchById(userId, batchId);

    // Get batch history
    const history = await fabricQueryService.queryBatchHistory(userId, batchId);

    // Transform history to timeline events
    const events = history.map((record) => {
      // Parse the record value
      let eventData = {};
      try {
        eventData = record.value ? JSON.parse(record.value) : {};
      } catch (e) {
        eventData = record.value || {};
      }

      // Build timeline event
      const timelineEvent = {
        id: record.txId,
        timestamp:
          record.timestamp || eventData.timestamp || eventData.createdAt,
        type: determineEventType(eventData, record),
        actor: eventData.createdBy || eventData.updatedBy || "System",
        description: buildEventDescription(eventData, record),
        verified: !record.isDelete,
      };

      // Add location if available
      if (eventData.location) {
        timelineEvent.location = eventData.location;
      }

      // Add status change info
      if (eventData.status) {
        timelineEvent.status = eventData.status;
      }

      // Include technical details if in technical mode
      if (viewMode === "technical") {
        timelineEvent.technical = {
          txId: record.txId,
          blockNumber: record.blockNumber || "N/A",
          channelId: "freshroute-channel",
          isDelete: record.isDelete,
          explorerLink: buildExplorerLink(
            { txId: record.txId, channel: "freshroute-channel" },
            "transaction",
          ),
        };
      }

      return timelineEvent;
    });

    // Sort events by timestamp (oldest to newest for timeline)
    events.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Build timeline structure
    const timeline = {
      batchId,
      productType: batch.productType,
      totalEvents: events.length,
      events: events.map((event) => ({
        ...event,
        dateTime: formatTimestamp(event.timestamp),
        relativeTime: formatTimestamp(event.timestamp, "relative"),
      })),
      milestones: extractMilestones(events, batch),
    };

    return timeline;
  } catch (error) {
    console.error("Error getting batch timeline:", error);
    throw error;
  }
}

/**
 * Determine event type from record data
 * @param {Object} eventData - Event data
 * @param {Object} record - Blockchain record
 * @returns {string} Event type
 */
function determineEventType(eventData, record) {
  // Check for explicit event type
  if (eventData.eventType) {
    return translateEventType(eventData.eventType);
  }

  // Infer from status change
  if (eventData.status) {
    switch (eventData.status) {
      case "CREATED":
        return "Batch Created";
      case "PACKED":
        return "Batch Packed";
      case "QUALITY_CHECKED":
        return "Quality Inspection";
      case "IN_TRANSIT":
        return "Shipment Started";
      case "DELIVERED":
        return "Delivered";
      case "RECEIVED":
        return "Received";
      case "COMPLETED":
        return "Completed";
      default:
        return "Status Updated";
    }
  }

  // Check for specific fields to infer event type
  if (eventData.qualityGrade || eventData.qualityNotes) {
    return "Quality Inspection";
  }

  if (eventData.currentOwner && eventData.previousOwner) {
    return "Ownership Transferred";
  }

  if (eventData.location) {
    return "Location Updated";
  }

  // Default
  return "Batch Updated";
}

/**
 * Build human-readable description for an event
 * @param {Object} eventData - Event data
 * @param {Object} record - Blockchain record
 * @returns {string} Description
 */
function buildEventDescription(eventData, record) {
  const status = eventData.status;
  const actor = eventData.createdBy || eventData.updatedBy || "System";

  if (status === "CREATED") {
    return `Batch created by ${eventData.farmerName || actor} at ${eventData.farmLocation || "farm"}`;
  }

  if (status === "PACKED") {
    return `Batch packed and ready for shipment. Quantity: ${eventData.quantity || "N/A"}`;
  }

  if (status === "QUALITY_CHECKED") {
    return `Quality inspection completed. Grade: ${eventData.qualityGrade || "N/A"}`;
  }

  if (status === "IN_TRANSIT") {
    return `Shipment started with transporter ${eventData.transporterName || "N/A"}`;
  }

  if (status === "DELIVERED") {
    return `Delivered to ${eventData.buyerName || "buyer"}`;
  }

  if (status === "RECEIVED") {
    return `Receipt confirmed by ${eventData.buyerName || actor}`;
  }

  if (status === "COMPLETED") {
    return "Batch lifecycle completed";
  }

  if (eventData.currentOwner && eventData.previousOwner) {
    return `Ownership transferred from ${eventData.previousOwner} to ${eventData.currentOwner}`;
  }

  if (eventData.location) {
    return `Location updated to ${eventData.location}`;
  }

  return `Batch updated by ${actor}`;
}

/**
 * Extract key milestones from timeline events
 * @param {Array} events - Timeline events
 * @param {Object} batch - Batch data
 * @returns {Object} Milestones
 */
function extractMilestones(events, batch) {
  const milestones = {
    harvested: null,
    packed: null,
    inspected: null,
    shipped: null,
    delivered: null,
    completed: null,
  };

  events.forEach((event) => {
    if (event.type === "Batch Created" && !milestones.harvested) {
      milestones.harvested = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }

    if (event.type === "Batch Packed" && !milestones.packed) {
      milestones.packed = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }

    if (event.type === "Quality Inspection" && !milestones.inspected) {
      milestones.inspected = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }

    if (event.type === "Shipment Started" && !milestones.shipped) {
      milestones.shipped = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }

    if (event.type === "Delivered" && !milestones.delivered) {
      milestones.delivered = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }

    if (event.type === "Completed" && !milestones.completed) {
      milestones.completed = {
        date: event.timestamp,
        actor: event.actor,
        verified: event.verified,
      };
    }
  });

  return milestones;
}

/**
 * Get simplified timeline summary (for cards/widgets)
 * @param {string} userId - User ID for wallet access
 * @param {string} batchId - Batch ID
 * @returns {Promise<Object>} Timeline summary
 */
async function getTimelineSummary(userId, batchId) {
  try {
    const timeline = await getBatchTimeline(userId, batchId, "business");

    return {
      batchId,
      totalEvents: timeline.totalEvents,
      milestones: timeline.milestones,
      latestEvent: timeline.events[timeline.events.length - 1] || null,
      completionPercentage: calculateCompletionPercentage(timeline.milestones),
    };
  } catch (error) {
    console.error("Error getting timeline summary:", error);
    throw error;
  }
}

/**
 * Calculate completion percentage based on milestones
 * @param {Object} milestones - Milestones object
 * @returns {number} Completion percentage
 */
function calculateCompletionPercentage(milestones) {
  const totalSteps = 6; // harvested, packed, inspected, shipped, delivered, completed
  let completedSteps = 0;

  if (milestones.harvested) completedSteps++;
  if (milestones.packed) completedSteps++;
  if (milestones.inspected) completedSteps++;
  if (milestones.shipped) completedSteps++;
  if (milestones.delivered) completedSteps++;
  if (milestones.completed) completedSteps++;

  return Math.round((completedSteps / totalSteps) * 100);
}

module.exports = {
  getBatchTimeline,
  getTimelineSummary,
  determineEventType,
  buildEventDescription,
  extractMilestones,
};
