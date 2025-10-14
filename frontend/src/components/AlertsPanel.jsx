// src/components/AlertsPanel.jsx
import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle, Info, DollarSign, Scale, Trash2 } from "lucide-react";
import { fetchAlerts, createAlert, markAlertRead, deleteAlert } from "@/utils/alertsService";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { notify } from "@/utils/toastHelper"; // Use the notify helper

const iconMap = {
  warning: <AlertTriangle className="w-5 h-5 text-red-500" />,
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  error: <AlertTriangle className="w-5 h-5 text-red-600" />,
  scale: <Scale className="w-5 h-5 text-indigo-500" />,
  dollar: <DollarSign className="w-5 h-5 text-emerald-500" />,
};

// Helper function to check if alerts are similar (prevent duplicates)
const isSimilarAlert = (existingAlert, newAlert) => {
  return (
    existingAlert.title === newAlert.title &&
    existingAlert.message === newAlert.message &&
    existingAlert.type === newAlert.type
  );
};

export default function AlertsPanel() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchAlerts(user.id);
      setAlerts(data);
    } catch (err) {
      console.error("Error loading alerts:", err);
      notify.error("Load Failed", "Could not fetch your notifications."); // Notifiy update
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleMarkRead = async (id) => {
    try {
      await markAlertRead(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
      );
      notify.info("Alert Read", "Alert marked as read."); // Notify update
    } catch {
      notify.error("Update Failed", "Could not mark alert as read."); // Notify update
    }
  };

  const handleDeleteAlert = async (id) => {
    try {
      await deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      notify.success("Alert Removed", "Alert deleted successfully."); // Notify update
    } catch {
      notify.error("Delete Failed", "Could not delete alert."); // Notify update
    }
  };

  // Improved alert creation that checks for duplicates
  const handleCreateAlert = async (type, icon, title, message) => {
    if (!user?.id) return;

    // Check for existing similar alerts first
    const existingAlerts = await fetchAlerts(user.id);
    const newAlertData = { type, title, message, icon };

    const isDuplicate = existingAlerts.some(alert =>
      isSimilarAlert(alert, newAlertData) && !alert.is_read
    );

    if (isDuplicate) {
      notify.info("Alert Exists", "Similar unread alert already present."); // Notify update
      return;
    }

    // Clean up old read alerts of the same type to prevent clutter
    const similarReadAlerts = existingAlerts.filter(alert =>
      isSimilarAlert(alert, newAlertData) && alert.is_read
    );

    // Delete old similar read alerts (keep only the latest one)
    if (similarReadAlerts.length > 0) {
      const alertsToDelete = similarReadAlerts.slice(1);
      for (const alert of alertsToDelete) {
        // Run delete without awaiting to speed up the process, but log errors
        deleteAlert(alert.id).catch(err => console.error("Failed to clean up old alert:", err));
      }
    }

    try {
      await createAlert(user.id, newAlertData);
      loadAlerts();
      notify.success("New Alert Created", title); // Notify update
    } catch {
      notify.error("Creation Failed", "Could not create the test alert."); // Notify update
    }
  };

  const unreadAlerts = alerts.filter((a) => !a.is_read);
  const readAlerts = alerts.filter((a) => a.is_read);

  // Group similar alerts to show only unique ones for display
  const uniqueUnreadAlerts = unreadAlerts.filter((alert, index, self) =>
    index === self.findIndex(a =>
      a.title === alert.title &&
      a.message === alert.message &&
      a.type === alert.type
    )
  );

  const uniqueReadAlerts = readAlerts.filter((alert, index, self) =>
    index === self.findIndex(a =>
      a.title === alert.title &&
      a.message === alert.message &&
      a.type === alert.type
    )
  );

  const handleClearRead = () => {
    if (confirm("Are you sure you want to clear all read alerts? This action cannot be undone.")) {
      const deletionPromises = readAlerts.map(alert => handleDeleteAlert(alert.id));
      Promise.all(deletionPromises).then(() => {
        notify.success("Cleared", "All read alerts have been removed.");
        loadAlerts();
      }).catch(() => {
        notify.error("Bulk Delete Failed", "Some read alerts could not be deleted.");
      });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Financial Alerts
          {uniqueUnreadAlerts.length > 0 && (
            <span className="bg-red-500 text-white text-sm px-2 py-1 rounded-full">
              {uniqueUnreadAlerts.length} Unread
            </span>
          )}
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Total: {alerts.length} • Unread: {uniqueUnreadAlerts.length}
          </div>
          {alerts.length > 0 && (
            <button
              onClick={handleClearRead}
              className="text-xs text-slate-500 hover:text-red-500 px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
            >
              Clear Read
            </button>
          )}
        </div>
      </div>

      {!user ? (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            Please log in to view personalized alerts.
          </p>
        </div>
      ) : loading ? (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">Loading alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            No alerts at the moment
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Financial alerts will appear here when significant changes are detected
          </p>
          {/* Test button with unique alerts */}
          <div className="mt-4 space-x-2">
            <button
              onClick={() =>
                handleCreateAlert(
                  "warning",
                  "warning", // Icon map key
                  "Budget Alert",
                  "You've exceeded your monthly spending goal!"
                )
              }
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
            >
              Test Budget Alert
            </button>
            <button
              onClick={() =>
                handleCreateAlert(
                  "success",
                  "success", // Icon map key
                  "Savings Milestone",
                  "You've reached your savings target this month!"
                )
              }
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
            >
              Test Savings Alert
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Unread Alerts */}
          {uniqueUnreadAlerts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">
                New Alerts
              </h3>
              <div className="space-y-3">
                {uniqueUnreadAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    iconMap={iconMap}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDeleteAlert}
                    isUnread={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Read Alerts */}
          {uniqueReadAlerts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">
                Previous Alerts
              </h3>
              <div className="space-y-3">
                {uniqueReadAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    iconMap={iconMap}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDeleteAlert}
                    isUnread={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * AlertItem – Single alert card component (retained)
 */
const AlertItem = ({ alert, iconMap, onMarkRead, onDelete, isUnread }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    onClick={() => isUnread && onMarkRead(alert.id)}
    className={`flex items-start gap-4 p-4 rounded-xl transition-all shadow-sm border ${
      isUnread
        ? alert.type === "warning"
          ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30"
          : "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30"
        : "bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 cursor-default opacity-80"
    }`}
  >
    {/* Icon */}
    <div className="flex items-center justify-center min-w-[2rem]">
      {iconMap[alert.icon] ||
        iconMap[alert.type] ||
        alert.icon ||
        iconMap.scale}
    </div>

    {/* Content */}
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold ${isUnread ? "font-bold" : "line-through"}`}>
          {alert.title}
        </p>
        <div className="flex items-center gap-2">
          {isUnread && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(alert.id);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
            >
              Mark read
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(alert.id);
            }}
            className="text-xs text-slate-500 hover:text-red-500 px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <p className="text-sm mt-1 dark:text-gray-400">{alert.message}</p>
      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
        {new Date(alert.created_at).toLocaleString()}
        {!isUnread && <span className="ml-2 font-medium">(Read)</span>}
      </p>
    </div>
  </motion.div>
);