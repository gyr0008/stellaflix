import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const movieId = searchParams.get("movie_id");

  if (!movieId) {
    return NextResponse.json({ error: "movie_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("watch_progress")
    .select("position_seconds, duration_seconds, completed")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .single();

  if (error || !data) {
    return NextResponse.json({ position_seconds: 0 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { movie_id, position_seconds, duration_seconds, completed } = await request.json();

  const { error } = await supabase
    .from("watch_progress")
    .upsert(
      {
        user_id: user.id,
        movie_id,
        position_seconds,
        duration_seconds,
        completed: completed ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,movie_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Saved" });
}
