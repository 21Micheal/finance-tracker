import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Utility to call your FastAPI backend with Supabase JWT
async function apiFetch(path, options = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token;

  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// Create the context
const AuthContext = createContext();

// Hook to access context easily
export const useAuth = () => useContext(AuthContext);

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial session
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };

    getSession();

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    // Cleanup
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // 🔐 Login
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // 🔄 Trigger backend sync after login
    try {
      await apiFetch("/auth/sync_on_login", { method: "POST" });
      console.log("✅ Synced user with M-Pesa transactions.");
    } catch (err) {
      console.warn("⚠️ Sync failed:", err.message);
    }
  };

  // 🆕 Register
  const register = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  // 🚪 Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
