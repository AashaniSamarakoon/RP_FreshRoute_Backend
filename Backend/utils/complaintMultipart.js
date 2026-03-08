/**
 * Map comment_thread from DB shape to frontend shape.
 * DB: [ { id?, role, comment, added_at } ] -> Frontend: [ { id, role, description, timestamp } ]
 * Backend generates id and added_at when adding; legacy entries get a generated id.
 */
function mapCommentThreadForFrontend(commentThread) {
  const thread = Array.isArray(commentThread) ? commentThread : [];
  return thread.map((entry, index) => ({
    id: entry.id || `legacy-${index}-${Date.now()}`,
    role: entry.role || "user",
    description: entry.comment != null ? entry.comment : "",
    timestamp: entry.added_at != null ? entry.added_at : null,
  }));
}

/**
 * Send complaint as multipart/form-data: one part "complaint" (JSON without images, comment_thread in frontend shape), then "image_0", "image_1", ... as binary files.
 * @param {object} res - Express res
 * @param {object} row - Complaint row from DB (with images array of base64 strings)
 */
function sendComplaintAsMultipart(res, row) {
  const boundary = "----ComplaintBoundary" + Date.now();
  const complaintNoImages = {
    ...row,
    images: [],
    comment_thread: mapCommentThreadForFrontend(row.comment_thread),
  };
  const buffers = [];
  buffers.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="complaint"\r\nContent-Type: application/json\r\n\r\n`,
      "utf8"
    )
  );
  buffers.push(Buffer.from(JSON.stringify(complaintNoImages), "utf8"));
  buffers.push(Buffer.from("\r\n", "utf8"));
  const images = Array.isArray(row.images) ? row.images : [];
  images.forEach((b64, i) => {
    if (b64 && String(b64).length > 0) {
      buffers.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="image_${i}"; filename="image_${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
          "utf8"
        )
      );
      buffers.push(Buffer.from(b64, "base64"));
      buffers.push(Buffer.from("\r\n", "utf8"));
    }
  });
  buffers.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  res.setHeader("Content-Type", `multipart/form-data; boundary=${boundary}`);
  res.status(200).send(Buffer.concat(buffers));
}

module.exports = { sendComplaintAsMultipart, mapCommentThreadForFrontend };
