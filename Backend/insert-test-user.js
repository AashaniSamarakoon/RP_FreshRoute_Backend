const { supabase } = require("./utils/supabaseClient");
const bcrypt = require("bcryptjs");

async function insertTestUser() {
  const hashedPassword = await bcrypt.hash("password123", 10);

  const { error } = await supabase.from("users").insert({
    id: "5fa6ccfc-a21d-476b-b99f-9bc75e146e69",
    email: "farmer@test.com",
    password: hashedPassword,
    role: "farmer",
    name: "Test Farmer"
  });

  if (error) {
    console.error("Error inserting user:", error);
  } else {
    console.log("Test user inserted successfully");
  }
}

insertTestUser();