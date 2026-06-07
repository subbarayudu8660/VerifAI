import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storageKey: "sb-cgcyyuappiuhbgcajecj-auth-token",
      storage: window.localStorage,
    },
  },
);
