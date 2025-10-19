// src/config.js
const isProduction = import.meta.env.MODE === "production";

export const API_BASE_URL = isProduction
  ? "https://your-production-backend.com/api" // ✅ replace with your real domain
  : "http://localhost:8000/api"; // 👈 local dev
