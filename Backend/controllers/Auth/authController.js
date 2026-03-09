const {
  registerAndEnrollUser,
} = require("../../Services/blockchain/identityService");
const { getContract } = require("../../Services/blockchain/contractService"); // Import the gateway bridge
const { submitWithTx } = require("../../utils/blockchainUtils");
const { supabase, supabaseAdmin } = require("../../utils/supabaseClient");

// Signup
const signup = async (req, res) => {
  try {
    // 1. Added nic to the destructuring
    const { first_name, last_name, email, phone, nic, password, role } =
      req.body;

    if (!(email || phone) || !password || !role || !first_name || !last_name) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 2. Normalize role for consistency
    const normalizedRole = role.toUpperCase();

    const signUpArgs = {
      email, // Always use email as the primary auth method
      password,
      options: {
        data: {
          first_name,
          last_name,
          role: role.toUpperCase(),
          phone_number: phone, // Store it here instead
          nic_number: nic || null,
        },
      },
    };

    // if (phone) signUpArgs.phone = phone;
    // else signUpArgs.email = email;

    const { data: authData, error: authError } =
      await supabase.auth.signUp(signUpArgs);

    if (authError) return res.status(409).json({ message: authError.message });

    // Supabase silently returns an existing user on duplicate email instead of erroring.
    // Detect this: if identities array is empty the email is already registered.
    if (!authData?.user?.identities?.length) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const user = authData.user;
    let ledgerStatus = "Pending";
    let identitySuccess = false;
    const fullName = `${first_name} ${last_name}`;

    // Create role-specific profile row using admin client to bypass RLS.
    // Use upsert (onConflict: user_id) so that if a Supabase trigger already
    // created the row before this code runs we don't crash with a duplicate PK.
    let roleProfile = null;
    try {
      const table =
        normalizedRole === "BUYER"
          ? "buyers"
          : normalizedRole === "FARMER"
          ? "farmers"
          : "transporter";

      const { data, error } = await supabaseAdmin
        .from(table)
        .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: false })
        .select()
        .single();
      if (error) throw error;
      roleProfile = data;
    } catch (profileErr) {
      console.error("Failed to create role profile:", profileErr);
      return res.status(500).json({
        message: "Failed to create user profile. Please contact support.",
        error: profileErr.message,
      });
    }

    // 3. Blockchain Registration logic stays same, but uses normalizedRole
    try {
      identitySuccess = await registerAndEnrollUser(
        user.id,
        normalizedRole.toLowerCase(),
      );
      if (!identitySuccess) ledgerStatus = "Identity Failed";
    } catch (blockchainError) {
      ledgerStatus = "Blockchain Service Unavailable";
    }

    if (identitySuccess) {
      try {
        const adminIdentityId = `admin.${normalizedRole === "FARMER" ? "FarmerOrgMSP" : normalizedRole === "BUYER" ? "BuyerOrgMSP" : "TransporterOrgMSP"}`;
        const { contract, close } = await getContract(
          adminIdentityId,
          "UserContract",
        );
        try {
          const regTx = await submitWithTx(contract, "RegisterUser", user.id, fullName, normalizedRole);
          ledgerStatus = "Registered on Ledger";
          console.log("RegisterUser tx", regTx);
        } catch (txError) {
          ledgerStatus = "Identity Created, Ledger Failed";
        } finally {
          close();
        }
      } catch (gatewayError) {
        ledgerStatus = "Gateway Error";
      }
    }

    const token = authData.session?.access_token || null;
    
    // Build properly structured user object for frontend (matching login response)
    const userResponse = {
      id: user.id,
      email: user.email,
      first_name: first_name,
      last_name: last_name,
      phone: phone,
      role: normalizedRole.toLowerCase(),
      nic_number: nic,
      isOnboarded: false, // New users start as not onboarded
      roleProfile: roleProfile, // Include role-specific profile data
    };
    
    return res
      .status(201)
      .json({ token, user: userResponse, blockchainStatus: ledgerStatus });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Login
const login = async (req, res) => {
  try {
    // Accept either 'identifier' (email, phone, or NIC) or 'email' for frontend compatibility
    const identifier = req.body.identifier ?? req.body.email;
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 1. Identity Lookup: Find the user's primary email using the unified identifier
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .or(
        `email.eq.${identifier},phone.eq.${identifier},nic_number.eq.${identifier}`,
      )
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ message: "Account not found" });
    }

    // 2. Use the found email to sign in via Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

    if (authError || !authData.session) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const userId = authData.user.id;
    const userRole = profile.role.toLowerCase();

    // 3. Fetch role-specific profile data (farmers/buyers/transporters table)
    let roleProfile = null;
    if (userRole === "farmer") {
      const { data: farmerData, error: farmerError } = await supabase
        .from("farmers")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (farmerError) {
        console.error("Farmer profile not found for user:", userId);
        return res.status(401).json({ 
          message: "Farmer profile not found. Please complete your registration." 
        });
      }
      roleProfile = farmerData;
    } else if (userRole === "buyer") {
      const { data: buyerData, error: buyerError } = await supabase
        .from("buyers")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (buyerError) {
        console.error("Buyer profile not found for user:", userId);
        return res.status(401).json({ 
          message: "Buyer profile not found. Please complete your registration." 
        });
      }
      roleProfile = buyerData;
    } else if (userRole === "transporter") {
      // table name is singular 'transporter' elsewhere in code
      const { data: transporterData, error: transporterError } = await supabase
        .from("transporter")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (transporterError) {
        console.error("Transporter profile not found for user:", userId);
        return res.status(401).json({ 
          message: "Transporter profile not found. Please complete your registration." 
        });
      }
      roleProfile = transporterData;
    }

    // 4. Build comprehensive user object with flattened structure for frontend
    const user = {
      id: userId,
      email: profile.email,
      first_name: profile.first_name || authData.user.user_metadata?.first_name,
      last_name: profile.last_name || authData.user.user_metadata?.last_name,
      phone: profile.phone || authData.user.phone,
      role: userRole,
      isOnboarded: profile.is_onboarded,
      nic_number: profile.nic_number,
      avatar_url: profile.avatar_url,
      // Include role-specific profile data
      roleProfile: roleProfile,
    };

    const token = authData.session.access_token;
    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Get Me (current user) - returns global user record plus any role-specific profile
const getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    // fetch base user details from the users table (contains onboarding, nic urls, avatar, etc.)
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError) {
      throw userError;
    }

    // fetch role-specific profile
    const role = req.user.role || userRow.role?.toLowerCase();
    let roleProfile = null;
    
    if (role === "farmer") {
      const { data: farm, error: fErr } = await supabase
        .from("farmers")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (!fErr) roleProfile = farm;
    } else if (role === "buyer") {
      const { data: buy, error: bErr } = await supabase
        .from("buyers")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (!bErr) roleProfile = buy;
    } else if (role === "transporter") {
      const { data: t, error: tErr } = await supabase
        .from("transporters")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (!tErr) roleProfile = t;
    }

    // Return flat structure matching login response
    const user = {
      id: userId,
      email: userRow.email,
      first_name: userRow.first_name,
      last_name: userRow.last_name,
      phone: userRow.phone,
      role: role,
      isOnboarded: userRow.is_onboarded,
      nic_number: userRow.nic_number,
      avatar_url: userRow.avatar_url,
      roleProfile: roleProfile,
    };

    return res.json({ user });
  } catch (err) {
    console.error("GetMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get Farmer Profile - detailed profile for farmer with personal and farm details
const getFarmerProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user personal details
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, email, phone, first_name, last_name, avatar_url, created_at, nic_number")
      .eq("id", userId)
      .single();

    if (userError || !userRow) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch farmer-specific details
    const { data: farmerRow, error: farmerError } = await supabase
      .from("farmers")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (farmerError) {
      return res.status(404).json({ message: "Farmer profile not found" });
    }

    // Build farmer full name
    const fullName = `${userRow.first_name} ${userRow.last_name}`.trim();
    const memberSince = new Date(userRow.created_at).toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short' 
    });

    // Parse primary_crops (stored as text, likely JSON or comma-separated)
    let fruits = [];
    if (farmerRow.primary_crops) {
      try {
        fruits = typeof farmerRow.primary_crops === 'string' 
          ? JSON.parse(farmerRow.primary_crops)
          : (Array.isArray(farmerRow.primary_crops) ? farmerRow.primary_crops : []);
      } catch {
        fruits = [];
      }
    }

    // Build response with all profile details
    const profileData = {
      id: userRow.id,
      user_id: userRow.id,
      name: fullName || "User",
      first_name: userRow.first_name,
      last_name: userRow.last_name,
      email: userRow.email,
      phone: userRow.phone,
      avatar_url: userRow.avatar_url,
      member_since: memberSince,
      joined: memberSince,
      location: farmerRow.location,
      latitude: farmerRow.latitude,
      longitude: farmerRow.longitude,
      farm_size: farmerRow.farm_size,
      reputation: farmerRow.reputation,
      proof_of_farming_url: farmerRow.proof_of_farming_url,
      primary_crops: fruits,
      grows_these_fruits: fruits,
      personal: {
        id: userRow.id,
        email: userRow.email,
        phone: userRow.phone,
        first_name: userRow.first_name,
        last_name: userRow.last_name,
        full_name: fullName,
        avatar_url: userRow.avatar_url,
        joined: memberSince,
      },
      farm: {
        user_id: farmerRow.user_id,
        location: farmerRow.location,
        latitude: farmerRow.latitude,
        longitude: farmerRow.longitude,
        farm_size: farmerRow.farm_size,
        reputation: farmerRow.reputation,
        proof_of_farming_url: farmerRow.proof_of_farming_url,
        primary_crops: fruits,
      },
    };

    return res.json(profileData);
  } catch (err) {
    console.error("Get farmer profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { signup, login, getMe, getFarmerProfile };
