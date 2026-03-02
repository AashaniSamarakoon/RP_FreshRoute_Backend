const { supabase } = require("../../utils/supabaseClient");

// 1. Farmer Onboarding
const completeFarmerOnboarding = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      lat,
      lng,
      location,
      farm_size,
      primary_crops,
      nic_front_url,
      nic_back_url,
      proof_of_farming_url,
      avatar_url,
    } = req.body;

    // A. Update the Farmer-specific table
    const { error: farmerError } = await supabase
      .from("farmers")
      .update({
        latitude: lat,
        longitude: lng,
        location: location,
        farm_size: farm_size,
        primary_crops: primary_crops,
        proof_of_farming_url: proof_of_farming_url,
      })
      .eq("user_id", userId);

    if (farmerError) throw farmerError;

    // B. Update the Global User table (NICs & Onboarding Status)
    const { error: userError } = await supabase
      .from("users")
      .update({
        is_onboarded: true,
        nic_front_url: nic_front_url,
        nic_back_url: nic_back_url,
        avatar_url: avatar_url,
        kyc_status: "PENDING",
      })
      .eq("id", userId);

    if (userError) throw userError;

    res.status(200).json({ message: "Farmer onboarding complete!" });
  } catch (err) {
    console.error("Farmer Onboarding Error:", err);
    res.status(500).json({ message: "Failed to save profile details" });
  }
};

// 2. Buyer Onboarding
const completeBuyerOnboarding = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      lat,
      lng,
      location,
      company_name,
      tax_tin_number,
      business_registration_url,
      nic_front_url,
      nic_back_url,
      avatar_url,
    } = req.body;

    // A. Update the Buyer-specific table
    const { error: buyerError } = await supabase
      .from("buyers")
      .update({
        latitude: lat,
        longitude: lng,
        location: location,
        company_name: company_name,
        tax_tin_number: tax_tin_number,
        business_registration_url: business_registration_url,
      })
      .eq("user_id", userId);

    if (buyerError) throw buyerError;

    // B. Update the Global User table
    const { error: userError } = await supabase
      .from("users")
      .update({
        is_onboarded: true,
        nic_front_url: nic_front_url,
        nic_back_url: nic_back_url,
        avatar_url: avatar_url,
        kyc_status: "PENDING",
      })
      .eq("id", userId);

    if (userError) throw userError;

    res.status(200).json({ message: "Buyer onboarding complete!" });
  } catch (err) {
    console.error("Buyer Onboarding Error:", err);
    res.status(500).json({ message: "Failed to save profile details" });
  }
};

module.exports = { completeFarmerOnboarding, completeBuyerOnboarding };
