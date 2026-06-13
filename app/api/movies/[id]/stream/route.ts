import { createClient } from "@/lib/supabase/server";
import { generateSignedUrl } from "@/lib/bunny";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success } = await rateLimit(`stream:${ip}`, 20, 60);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get movie
  const { data: movie, error } = await supabase
    .from("movies")
    .select("id, bunny_video_id, video_url, is_premium")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (error || !movie) {
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  // Determine video URL
  let url: string;

  if (movie.bunny_video_id) {
    // Use Bunny.net signed URL
    url = generateSignedUrl(movie.bunny_video_id);
  } else if (movie.video_url) {
    // Use direct video URL
    url = movie.video_url;
  } else {
    // Fallback: return a sample video for testing
    url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  }

  return NextResponse.json({ url });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { progress, completed } = body;

  const update: Record<string, unknown> = {
    last_watched_at: new Date().toISOString(),
  };
  if (typeof progress === "number") update.progress = progress;
  if (typeof completed === "boolean") update.completed = completed;

  await supabase
    .from("watch_history")
    .upsert(
      { user_id: user.id, movie_id: id, ...update },
      { onConflict: "user_id,movie_id" }
    );

  return NextResponse.json({ success: true });
}
