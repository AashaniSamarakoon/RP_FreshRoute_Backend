const { supabaseAdmin } = require("./supabaseClient");

/**
 * Uploads a file buffer to Supabase Storage and returns the Public URL.
 * Uses admin client to bypass RLS policies for backend uploads.
 * @param {Buffer} fileBuffer - The binary file data
 * @param {string} fileName - Unique file name (e.g., "user_123_timestamp.jpg")
 */
const uploadImageToSupabase = async (fileBuffer, fileName) => {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("harvest-images") // Make sure this bucket exists in Supabase!
      .upload(fileName, fileBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) throw error;

    // Get Public URL
    const { data: publicData } = supabaseAdmin.storage
      .from("harvest-images")
      .getPublicUrl(fileName);

    return publicData.publicUrl;
  } catch (err) {
    console.error("Supabase Upload Error:", err.message);
    throw new Error("Failed to upload image to cloud storage");
  }
};

module.exports = { uploadImageToSupabase };
