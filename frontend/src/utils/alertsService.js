// src/utils/alertService.js
import { supabase } from "@/lib/supabaseClient";

// Allowed database-safe alert types - MUST match your DB constraint
const VALID_TYPES = ["warning", "success", "neutral"];

/**
 * Normalizes incoming alert types & icons before DB insert.
 * If the type is not valid, defaults to "neutral".
 */
function normalizeAlert(alert) {
  let normalizedType = alert.type?.toLowerCase() || "neutral";

  // Map emoji or custom types to DB-safe values
  const typeMap = {
    "🚨": "warning",
    "⚠️": "warning", 
    "❗": "warning",
    "🔥": "warning", // map error to warning
    "✅": "success",
    "💰": "success",
    "ℹ️": "neutral", // map info to neutral
    "info": "neutral",
    "warning": "warning",
    "error": "warning", // map error to warning
    "success": "success",
    "neutral": "neutral",
    "scale": "neutral", // fallback custom icons to neutral
    "dollar": "success", // fallback custom icons to success
  };

  // Normalize the type - ensure it's always one of VALID_TYPES
  normalizedType = typeMap[normalizedType] || 
                   (VALID_TYPES.includes(normalizedType) ? normalizedType : "neutral");

  // Final safety check - must be one of the valid types
  if (!VALID_TYPES.includes(normalizedType)) {
    normalizedType = "neutral";
  }

  return {
    user_id: alert.user_id,
    type: normalizedType,
    title: alert.title,
    message: alert.message,
    icon: alert.icon || null,
  };
}

/**
 * Helper function to check if alerts are similar (prevent duplicates)
 */
export function isSimilarAlert(existingAlert, newAlert) {
  return (
    existingAlert.title === newAlert.title &&
    existingAlert.message === newAlert.message &&
    existingAlert.type === newAlert.type
  );
}

/**
 * Fetch alerts for the current user
 */
export async function fetchAlerts(userId) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching alerts:", error);
    return [];
  }
  return data;
}

/**
 * Insert a new alert safely into the DB with duplicate prevention
 */
export async function createAlert(userId, alert) {
  const normalizedAlert = normalizeAlert({ ...alert, user_id: userId });

  console.log('Inserting alert:', normalizedAlert);

  const { error } = await supabase.from("alerts").insert([normalizedAlert]);

  if (error) {
    console.error("Error creating alert:", error);
    console.error("Alert data that failed:", normalizedAlert);
    throw error;
  }
  
  return { success: true };
}

/**
 * Create alert only if no similar unread alerts exist
 */
export async function createAlertIfNotExists(userId, alert) {
  // Check for existing similar alerts first
  const existingAlerts = await fetchAlerts(userId);
  const newAlertData = { ...alert, user_id: userId };
  
  const isDuplicate = existingAlerts.some(existingAlert => 
    isSimilarAlert(existingAlert, newAlertData) && !existingAlert.is_read
  );

  if (isDuplicate) {
    console.log("Similar alert already exists, skipping creation");
    return { success: false, reason: "duplicate" };
  }

  // Clean up old read alerts of the same type to prevent clutter
  const similarReadAlerts = existingAlerts.filter(existingAlert => 
    isSimilarAlert(existingAlert, newAlertData) && existingAlert.is_read
  );

  // Delete old similar read alerts (keep only the most recent one)
  if (similarReadAlerts.length > 0) {
    const alertsToDelete = similarReadAlerts.slice(1); // Keep the most recent one
    for (const alertToDelete of alertsToDelete) {
      await deleteAlert(alertToDelete.id);
    }
  }

  return await createAlert(userId, alert);
}

/**
 * Mark alert as read
 */
export async function markAlertRead(id) {
  const { error } = await supabase
    .from("alerts")
    .update({ is_read: true })
    .eq("id", id);

  if (error) {
    console.error("Error updating alert:", error);
    throw error;
  }

  return { success: true };
}

/**
 * Mark all alerts as read for a user
 */
export async function markAllAlertsRead(userId) {
  const { error } = await supabase
    .from("alerts")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    console.error("Error marking all alerts as read:", error);
    throw error;
  }

  return { success: true };
}

/**
 * Delete an alert
 */
export async function deleteAlert(id) {
  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting alert:", error);
    throw error;
  }

  return { success: true };
}

/**
 * Delete all read alerts for a user
 */
export async function deleteAllReadAlerts(userId) {
  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("user_id", userId)
    .eq("is_read", true);

  if (error) {
    console.error("Error deleting read alerts:", error);
    throw error;
  }

  return { success: true };
}

/**
 * Delete all alerts for a user (cleanup)
 */
export async function deleteAllUserAlerts(userId) {
  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting all user alerts:", error);
    throw error;
  }

  return { success: true };
}