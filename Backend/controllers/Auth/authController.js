const { generateToken } = require("../../Services/auth");
const {
  registerAndEnrollUser,
} = require("../../Services/blockchain/identityService");
const { getContract } = require("../../Services/blockchain/contractService"); // Import the gateway bridge
const { supabase } = require("../../utils/supabaseClient");

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

    const user = authData.user;
    let ledgerStatus = "Pending";
    let identitySuccess = false;
    const fullName = `${first_name} ${last_name}`;

    // create a local profile row for the new account so the rest of the
    // backend can look it up by user_id. use the admin client to avoid any
    // RLS or permission issues (this runs on the server).
    try {
      if (normalizedRole === "BUYER") {
        await supabase.from("buyers").insert({ user_id: user.id });
      } else if (normalizedRole === "FARMER") {
        await supabase.from("farmers").insert({ user_id: user.id });
      } else if (normalizedRole === "TRANSPORTER") {
        await supabase.from("transporters").insert({ user_id: user.id });
      }
    } catch (profileErr) {
      console.error("Failed to create role profile", profileErr);
      // not fatal; the login can still succeed but later endpoints will
      // report "profile not found" and the client can prompt the user to
      // complete their account setup.
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
          await contract.submitTransaction(
            "RegisterUser",
            user.id,
            fullName,
            normalizedRole,
          );
          ledgerStatus = "Registered on Ledger";
        } catch (txError) {
          ledgerStatus = "Identity Created, Ledger Failed";
        } finally {
          close();
        }
      } catch (gatewayError) {
        ledgerStatus = "Gateway Error";
      }
    }

    const token = generateToken(user);
    return res
      .status(201)
      .json({ token, user, blockchainStatus: ledgerStatus });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // 'identifier' can be Email, Phone, or NIC

    if (!identifier || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 1. Identity Lookup: Find the user's primary email using the unified identifier
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("email, role, is_onboarded") // Add is_onboarded here
      .or(
        `email.eq.${identifier},phone.eq.${identifier},nic_number.eq.${identifier}`,
      )
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ message: "Account not found" });
    }

    // 2. Use the found email to sign in via Supabase
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

    if (authError || !authData.session) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = {
      ...authData.user,
      role: profile.role.toLowerCase(),
      isOnboarded: profile.is_onboarded, // Pass it to the frontend
    };

    const token = authData.session.access_token;
    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Get Me (current user)
const getMe = async (req, res) => {
  try {
    // User is attached by authMiddleware
    res.json({ user: req.user });
  } catch (err) {
    console.error("GetMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { signup, login, getMe };
