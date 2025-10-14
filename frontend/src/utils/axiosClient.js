// src/utils/axiosClient.js
import axios from "axios";

const axiosClient = axios.create({
  baseURL: "http://127.0.0.1:5000", // ✅ backend URL
});

// 🔹 Attach token before every request
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 🔹 Handle expired/invalid tokens globally
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login"; // force redirect
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
