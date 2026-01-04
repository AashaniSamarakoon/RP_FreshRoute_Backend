const bcrypt = require("bcryptjs");
const { supabase } = require("../../utils/supabaseClient");
const { generateToken } = require("../../Services/auth");
const { registerAndEnrollUser } = require("../../Services/blockchain/identityService");
const { getContract } = require("../../Services/blockchain/contractService"); // Import the gateway bridge

// Signup
const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const allowedRoles = ["farmer", "transporter", "buyer"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // 1. Check if email exists
    const { data: existingUsers } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert user into Supabase
    const { data: insertedUsers, error: insertError } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
        role,
      })
      .select("id, name, email, role");

    if (insertError || !insertedUsers) {
      return res.status(500).json({ message: "Failed to create user" });
    }

    const user = insertedUsers[0];

    // 4. Create role-specific entry in DB
    let roleTable = role === "farmer" ? "farmer" : role === "buyer" ? "buyers" : "transporter";
    const { error: roleError } = await supabase
      .from(roleTable)
      .insert({ user_id: user.id });

    if (roleError) {
      await supabase.from("users").delete().eq("id", user.id);
      return res.status(500).json({ message: `Failed to create ${role} entry` });
    }

    // ==========================================
    // 5. BLOCKCHAIN IDENTITY (Fabric CA)
    // ==========================================
    console.log(`Registering ${role} on blockchain CA...`);
    const identitySuccess = await registerAndEnrollUser(user.id, role);
    let ledgerStatus = "Pending";

    if (!identitySuccess) {
      console.error("CRITICAL: Supabase user created but Blockchain identity failed.");
      ledgerStatus = "Identity Failed";
    } else {
        // ==========================================
        // 6. BLOCKCHAIN LEDGER (CouchDB Profile)
        // ==========================================
        try {
            console.log("Connecting to Gateway to register participant on Ledger...");
            
            // Connect to the 'UserContract' specifically using the new user's credentials
            const { contract, close } = await getContract(user.id, 'UserContract');

            try {
                // Call RegisterParticipant(id, name, role)
                await contract.submitTransaction(
                    'RegisterUser', 
                    user.id, 
                    name, 
                    role
                );
                console.log("Successfully registered participant on CouchDB Ledger.");
                ledgerStatus = "Registered on Ledger";
            } catch (txError) {
                console.error("Ledger Transaction Failed:", txError);
                ledgerStatus = "Identity Created, Ledger Failed";
            } finally {
                close(); // Always close the gateway connection
            }

        } catch (gatewayError) {
            console.error("Gateway Connection Failed:", gatewayError);
            ledgerStatus = "Gateway Error";
        }
    }

    const token = generateToken(user);
    
    res.status(201).json({ 
      token, 
      user, 
      blockchainStatus: ledgerStatus 
    });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 1. Find user by email
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, password_hash, role")
      .eq("email", email);

    if (error || !users || users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    // 2. Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3. Generate token
    const token = generateToken(user);
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