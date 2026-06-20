import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnqatjzcyttrgczhrqmk.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJucWF0anpjeXR0cmdzemhycW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTAwMTYsImV4cCI6MjA5NjkyNjAxNn0.wDiRpbeuNvVNclVq2omkd64gCfPbYZOpdKIqA2TbQi0";
  return createBrowserClient(supabaseUrl, supabaseKey);
}
