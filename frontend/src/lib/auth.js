// src/lib/auth.js
import { supabase } from "./supabaseClient";

const API_URL = import.meta.env.VITE_API_URL;

// Register
export async function signUp(email, password) {
  return await supabase.auth.signUp({ email, password });
}

// Login
export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

// Logout
export async function signOut() {
  return await supabase.auth.signOut();
}

// 🔍 Get current user (from backend)
export async function getUser() {
  // 1️⃣ Get Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) return null;

  // 2️⃣ Call backend to get full user info
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.warn("⚠️ Failed to fetch backend user:", res.status);
    return null;
  }

  // 3️⃣ Return backend user record
  const backendUser = await res.json();
  return backendUser;
}


  export async function linkPhone(phone) { // Removed 'token' argument
    
    // 1️⃣ Get Supabase session and token internally
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token; // Use optional chaining for safety

    if (!token) {
      throw new Error("User session not found. Please log in.");
    }

    console.log("Token being sent:", session.access_token); // Should now show the actual token

    // 2️⃣ Make the API call using the retrieved token
    const response = await fetch(`${import.meta.env.VITE_FLASK_API_URL}/api/auth/link_phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // Use the internally retrieved token
      },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Handle specific 401 unauthorized errors more explicitly if needed
      throw new Error(errorData.detail || "Failed to link phone number");
    }

    return await response.json();
  }