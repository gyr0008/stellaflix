import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnqatjzcyttrgczhrqmk.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";
  return createBrowserClient(supabaseUrl, supabaseKey);
}
