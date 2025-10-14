import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState, useCallback } from "react";
import { notify } from "@/utils/toastHelper";
import { Upload } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();

  const [profileData, setProfileData] = useState({});
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch Profile
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, bio, avatar_url")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setProfileData(data);
        setFullName(data.full_name || "");
        setBio(data.bio || "");
      } else {
        setProfileData({ full_name: "", bio: "", avatar_url: "" });
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      notify.error("Failed to Load Profile", "Unable to fetch your profile data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ✅ Avatar Upload with proper MIME handling
  const handleAvatarUpload = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        return notify.error("Invalid File", "Please select an image file.");
      }
      if (file.size > 2 * 1024 * 1024) {
        return notify.error("Too Large", "Image must be below 2MB.");
      }

      setUploading(true);
      const fileExt = file.name.split(".").pop().toLowerCase();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      // ✅ Upload with correct MIME - delete old file first if exists
     // ✅ Upload with correct MIME - delete old file first if exists
      const oldPath = `${user.id}/`;
      const { data: existingFiles } = await supabase.storage
        .from("avatars")
        .list(oldPath);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map((f) => `${oldPath}${f.name}`);
        await supabase.storage.from("avatars").remove(filesToDelete);
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = publicData?.publicUrl;

      // ✅ Update Supabase profile record
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // ✅ Update UI instantly
      setProfileData((prev) => ({ ...prev, avatar_url: avatarUrl }));
      notify.success("Avatar Updated", "Your profile picture has been updated!");
      console.log('File type:', file.type);
      console.log('File name:', file.name);
      console.log('File size:', file.size);
    } catch (err) {
      console.error("Upload failed:", err.message);
      notify.error("Upload Failed", err.message || "Unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  };

  // Save Profile
  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const updates = {
      id: user.id,
      full_name: fullName.trim(),
      bio: bio.trim(),
      updated_at: new Date(),
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(updates, { onConflict: "id" });

    if (error) {
      console.error(error);
      notify.error("Save Failed", "Failed to save profile changes.");
    } else {
      setProfileData((prev) => ({ ...prev, ...updates }));
      notify.success("Profile Saved", "Your profile information has been updated!");
    }
    setSaving(false);
  };

  // Change Email
  const handleChangeEmail = async () => {
    if (!newEmail)
      return notify.error("Validation Error", "Please enter a valid email address.");
    setChangingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      console.error(error);
      notify.error("Update Failed", "Error changing email: " + error.message);
    } else {
      notify.info("Verification Required", "Check your inbox to verify the new email.");
      setNewEmail("");
    }
    setChangingEmail(false);
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6)
      return notify.error("Validation Error", "Password must be at least 6 characters.");
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error(error);
      notify.error("Update Failed", "Error changing password: " + error.message);
    } else {
      notify.success("Password Updated", "Your password has been changed successfully!");
      setNewPassword("");
    }
    setChangingPassword(false);
  };

  // Delete Account
  const handleDeleteAccount = async () => {
    if (
      !confirm(
        "Are you sure you want to permanently delete your account? This cannot be undone."
      )
    )
      return;

    setDeleting(true);
    try {
      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.signOut();
      notify.info("Account Deleted", "Your account has been removed from this app.");
      window.location.reload();
    } catch (err) {
      console.error("Delete failed:", err);
      notify.error("Deletion Failed", "Failed to delete your account.");
    }
    setDeleting(false);
  };

  if (!user)
    return <div className="p-6 text-center">Please log in to view your profile.</div>;

  return (
    <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
        Profile Settings ⚙️
      </h1>

      {loading ? (
        <div className="text-center py-6 text-slate-500 dark:text-slate-400">
          Loading profile...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Avatar */}
          <section className="border-b border-slate-200 dark:border-slate-700 pb-6">
            <div className="flex items-center gap-5">
              <div className="relative">
                {profileData.avatar_url ? (
                  <img
                    src={profileData.avatar_url}
                    alt="Avatar"
                    className="w-24 h-24 rounded-full border-2 border-slate-300 dark:border-slate-600 object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-indigo-500 text-white flex items-center justify-center text-3xl font-semibold">
                    {user.email?.[0]?.toUpperCase()}
                  </div>
                )}

                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 bg-indigo-600 hover:bg-indigo-700 p-2 rounded-full cursor-pointer transition shadow-lg"
                >
                  <Upload className="w-4 h-4 text-white" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {profileData.full_name || user.email.split("@")[0]}
                </h2>
                <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
                {uploading && (
                  <p className="text-xs text-indigo-400 mt-2 animate-pulse">
                    Uploading avatar...
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Personal Info */}
          <section className="space-y-4 border-b border-slate-200 dark:border-slate-700 pb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Personal Information
            </h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Bio / Summary
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="A short summary about yourself..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 font-medium"
            >
              {saving ? "Saving..." : "Save Profile Details"}
            </button>
          </section>

          {/* Account Management */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Account Management
            </h2>

            {/* Email */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="email"
                placeholder="Enter new email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <button
                onClick={handleChangeEmail}
                disabled={changingEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 font-medium whitespace-nowrap"
              >
                {changingEmail ? "Updating..." : "Change Email"}
              </button>
            </div>

            {/* Password */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="password"
                placeholder="Enter new password (min 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition disabled:opacity-50 font-medium whitespace-nowrap"
              >
                {changingPassword ? "Updating..." : "Change Password"}
              </button>
            </div>

            {/* Delete Account */}
            <div className="pt-4">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="w-full bg-red-600 text-white py-2 rounded-xl hover:bg-red-700 transition disabled:opacity-50 font-medium"
              >
                {deleting ? "Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
