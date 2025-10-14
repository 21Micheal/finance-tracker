import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import MainDashboard from "@/pages/transactions/MainDashboard";
import AnalyticsDashboard from "@/pages/analytics/AnalyticsDashboard";
import DashboardLayout from "@/layouts/DashboardLayout";
import Profile from "@/pages/Profile";
import Settings from "@/pages/settings/Settings";
import InsightsDashboard from "@/pages/ai/InsightsDashboard";
// import TransactionsView from "./pages/transactions/TransactionsView";
import TransactionsPage from "./pages/transactions/TransactionsPage";

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes with layout */}
          <Route
            element={
              <PrivateRoute>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route path="/dashboard" element={<MainDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/transactions" element={<TransactionsPage />} />
          </Route>
          
          {/* Redirect */}
          <Route path="*" element={<Navigate to="/dashboard" />} />
          
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Settings />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/insights"
            element={
              <PrivateRoute>
                <InsightsDashboard />
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
      
      <Toaster
        position="top-center"
        richColors
        closeButton
        theme="system"
        toastOptions={{
          style: {
            background: "var(--toast-bg)",
            color: "var(--toast-text)",
            borderRadius: "0.75rem",
            boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
            fontSize: "0.9rem",
            fontWeight: 500,
          },
          className:
            "dark:bg-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700",
          duration: 4000,
        }}
      />
    </div>
  );
}

export default App;