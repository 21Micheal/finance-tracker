// src/lib/settings.js
import { supabase } from "./supabaseClient";

export async function fetchSettings(userId) {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertSettings(userId, settings) {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ ...settings, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// lib/utils.js
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}