const { supabase } = require("../../utils/supabaseClient");

/**
 * POST /api/gradings
 * Save fruit grading data from React Native app
 * Accepts multipart/form-data with base64 images
 */
const saveGrading = async (req, res) => {
  try {
    // Extract main fields from FormData
    const { grading_id, job_id, order_id } = req.body;

    // Validate main required fields
    if (!grading_id || typeof grading_id !== "string" || grading_id.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "grading_id is required and must be a non-empty string",
      });
    }

    if (!job_id || typeof job_id !== "string" || job_id.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "job_id is required and must be a non-empty string",
      });
    }

    if (!order_id || typeof order_id !== "string" || order_id.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "order_id is required and must be a non-empty string",
      });
    }

    // Validate and extract image data for all 5 images (index 0-4)
    const imageData = [];
    const validGrades = ["Grade A", "Grade B", "Grade C"];
    const validSequences = ["1", "2", "3", "4", "5"];

    for (let index = 0; index < 5; index++) {
      const base64Field = `image_${index}_base64`;
      const gradeField = `image_${index}_predicted_grade`;
      const accuracyField = `image_${index}_accuracy`;
      const sequenceField = `image_${index}_sequence`;

      const base64 = req.body[base64Field];
      const predictedGrade = req.body[gradeField];
      const accuracy = req.body[accuracyField];
      const sequence = req.body[sequenceField];

      // Validate base64
      if (!base64 || typeof base64 !== "string" || base64.trim() === "") {
        return res.status(400).json({
          success: false,
          message: `${base64Field} is required and must be a non-empty string`,
        });
      }

      // Validate base64 format (should start with data:image)
      if (!base64.startsWith("data:image/")) {
        return res.status(400).json({
          success: false,
          message: `${base64Field} must be a valid base64 data URI (starting with data:image/)`,
        });
      }

      // Validate predicted grade
      if (!predictedGrade || typeof predictedGrade !== "string") {
        return res.status(400).json({
          success: false,
          message: `${gradeField} is required and must be a string`,
        });
      }

      if (!validGrades.includes(predictedGrade)) {
        return res.status(400).json({
          success: false,
          message: `${gradeField} must be one of: "Grade A", "Grade B", or "Grade C"`,
        });
      }

      // Validate accuracy
      if (!accuracy || typeof accuracy !== "string" || accuracy.trim() === "") {
        return res.status(400).json({
          success: false,
          message: `${accuracyField} is required and must be a string`,
        });
      }

      const accuracyNum = parseFloat(accuracy);
      if (isNaN(accuracyNum) || accuracyNum < 0 || accuracyNum > 100) {
        return res.status(400).json({
          success: false,
          message: `${accuracyField} must be a number between 0 and 100`,
        });
      }

      // Validate sequence
      if (!sequence || typeof sequence !== "string") {
        return res.status(400).json({
          success: false,
          message: `${sequenceField} is required and must be a string`,
        });
      }

      if (!validSequences.includes(sequence)) {
        return res.status(400).json({
          success: false,
          message: `${sequenceField} must be one of: "1", "2", "3", "4", or "5"`,
        });
      }

      // Store validated image data
      imageData.push({
        base64: base64.trim(),
        predicted_grade: predictedGrade,
        accuracy: accuracyNum,
        sequence: parseInt(sequence, 10),
      });
    }

    // Insert main grading record
    const { data: gradingRecord, error: gradingError } = await supabase
      .from("gradings")
      .insert([
        {
          grading_id: grading_id.trim(),
          job_id: job_id.trim(),
          order_id: order_id.trim(),
        },
      ])
      .select()
      .single();

    if (gradingError) {
      // Check if it's a duplicate key error
      if (gradingError.code === "23505") {
        return res.status(400).json({
          success: false,
          message: `Grading with ID ${grading_id} already exists`,
        });
      }

      console.error("Error inserting grading:", gradingError);
      return res.status(500).json({
        success: false,
        message: "Failed to save grading data: " + gradingError.message,
      });
    }

    // Insert image records
    const imageRecords = imageData.map((img) => ({
      grading_id: grading_id.trim(),
      image_base64: img.base64,
      predicted_grade: img.predicted_grade,
      accuracy: img.accuracy,
      sequence: img.sequence,
    }));

    const { error: imagesError } = await supabase
      .from("grading_images")
      .insert(imageRecords);

    if (imagesError) {
      // Rollback: delete the main grading record if image insertion fails
      await supabase.from("gradings").delete().eq("grading_id", grading_id);

      console.error("Error inserting grading images:", imagesError);
      return res.status(500).json({
        success: false,
        message: "Failed to save grading images: " + imagesError.message,
      });
    }

    // Update route_manifest: Change PICKUP to DROP for this order_id
    try {
      const trimmedJobId = job_id.trim();
      const trimmedOrderId = order_id.trim();

      // Fetch the transport job
      const { data: job, error: jobFetchError } = await supabase
        .from("transport_jobs")
        .select("route_manifest")
        .eq("id", trimmedJobId)
        .single();

      if (jobFetchError || !job) {
        console.warn(
          `Warning: Could not fetch transport job ${trimmedJobId} to update route_manifest:`,
          jobFetchError?.message
        );
        // Continue anyway - grading is saved, route update is optional
      } else {
        // Update route_manifest: find PICKUP entry for this order_id and change to DROP
        const routeManifest = job.route_manifest || [];
        let manifestUpdated = false;

        const updatedManifest = routeManifest.map((entry) => {
          if (
            entry.order_id === trimmedOrderId &&
            entry.type === "PICKUP"
          ) {
            manifestUpdated = true;
            return {
              ...entry,
              type: "DROP",
            };
          }
          return entry;
        });

        if (manifestUpdated) {
          // Update the transport_jobs table with the updated route_manifest
          const { error: updateError } = await supabase
            .from("transport_jobs")
            .update({ route_manifest: updatedManifest })
            .eq("id", trimmedJobId);

          if (updateError) {
            console.warn(
              `Warning: Could not update route_manifest for job ${trimmedJobId}:`,
              updateError.message
            );
            // Continue anyway - grading is saved
          } else {
            console.log(
              `Successfully updated route_manifest: Changed PICKUP to DROP for order ${trimmedOrderId} in job ${trimmedJobId}`
            );
          }
        } else {
          console.warn(
            `Warning: No PICKUP entry found for order_id ${trimmedOrderId} in job ${trimmedJobId}'s route_manifest`
          );
        }
      }
    } catch (manifestError) {
      // Log error but don't fail the request - grading is already saved
      console.error(
        "Error updating route_manifest (non-critical):",
        manifestError
      );
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: "Grading data saved successfully",
      grading_id: grading_id.trim(),
      job_id: job_id.trim(),
      order_id: order_id.trim(),
      images_count: 5,
    });
  } catch (err) {
    console.error("SaveGrading Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};

module.exports = { saveGrading };

