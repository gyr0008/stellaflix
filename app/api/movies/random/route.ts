import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("movies")
    .select("id")
    .eq("is_published", true)
    .order("id")
    .limit(100);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: "No movies found" }, { status: 404 });
  }

  const randomIndex = Math.floor(Math.random() * data.length);
  return NextResponse.json({ id: data[randomIndex].id });
}
