import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types";
import { supabase } from "../lib/supabase";
import { mapProfile } from "../lib/mappers";
import { removeAvatarFile, uploadAvatar } from "../lib/avatar";

export type AvatarChange = { type: "keep" } | { type: "remove" } | { type: "replace"; blob: Blob };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Saves name/phone and (optionally) a new, removed or unchanged profile picture. */
  saveProfile: (input: { name: string; phone: string; avatar: AvatarChange }) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const NOT_STAFF = "This account is not a staff account. Customers should use the LabaHub mobile app.";

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "This email has not been confirmed yet. Check the inbox, or confirm the user in Supabase.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Can't reach the server. Check your internet connection and your .env settings.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Loads the profile and only accepts STAFF accounts.
  // (The database ALSO refuses to show orders to non-staff, so this is not the only protection.)
  const loadStaffProfile = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) return { user: null as User | null, error: error?.message ?? "Profile not found." };
    if (data.role !== "staff") return { user: null as User | null, error: NOT_STAFF };
    return { user: mapProfile(data, email), error: undefined };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const res = await loadStaffProfile(data.session.user.id, data.session.user.email ?? "");
        if (!active) return;
        if (res.user) setUser(res.user);
        else await supabase.auth.signOut();
      }
      if (active) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadStaffProfile]);

  const login = useCallback<AuthContextValue["login"]>(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user) return { ok: false, error: friendlyError(error?.message ?? "Unable to sign in.") };
      const res = await loadStaffProfile(data.user.id, data.user.email ?? "");
      if (!res.user) {
        await supabase.auth.signOut();
        return { ok: false, error: res.error };
      }
      setUser(res.user);
      return { ok: true };
    },
    [loadStaffProfile]
  );

  const logout = useCallback(async () => {
    setUser(null);
    await supabase.auth.signOut();
  }, []);

  const saveProfile = useCallback<AuthContextValue["saveProfile"]>(
    async ({ name, phone, avatar }) => {
      if (!user) return { ok: false, error: "You are signed out." };
      const cleanName = name.trim();
      const cleanPhone = phone.trim();
      if (!cleanName) return { ok: false, error: "Please enter your name." };
      if (cleanName.length > 80) return { ok: false, error: "Your name is too long (80 characters max)." };
      if (cleanPhone.length > 30) return { ok: false, error: "That phone number is too long." };

      const oldPath = user.avatarPath;
      let newPath: string | undefined;
      try {
        // 1) Upload the new picture first, under a brand-new file name.
        if (avatar.type === "replace") newPath = await uploadAvatar(user.id, avatar.blob);

        // 2) Save the profile row.
        const patch: Record<string, unknown> = { name: cleanName, phone: cleanPhone };
        if (avatar.type === "replace") patch.avatar_path = newPath;
        if (avatar.type === "remove") patch.avatar_path = null;
        const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select("*").single();
        if (error || !data) throw new Error(error?.message ?? "Could not save your profile.");

        // 3) Success: remove the OLD picture so no duplicates pile up.
        if (oldPath && oldPath !== data.avatar_path) removeAvatarFile(oldPath).catch(() => {});
        setUser(mapProfile(data, user.email));
        return { ok: true };
      } catch (e) {
        // Not saved: don't leave the file we just uploaded lying around.
        if (newPath) removeAvatarFile(newPath).catch(() => {});
        return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Please try again." };
      }
    },
    [user]
  );

  return <AuthContext.Provider value={{ user, loading, login, logout, saveProfile }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
