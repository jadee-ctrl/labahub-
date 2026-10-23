import { createClient } from "@supabase/supabase-js";

// These two values come from the file named ".env" in this folder (see SETUP-GUIDE.md).
// The key is the PUBLISHABLE key: it is meant to be in browser code.
// NEVER put a "secret" or "service_role" key in this project.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(
  supabaseUrl ?? "https://missing-env-file.invalid",
  supabaseKey ?? "missing-env-file"
);
