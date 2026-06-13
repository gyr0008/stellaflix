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

  let url: string | null = null;

  // 1. Try Bunny.net
  if (movie.bunny_video_id) {
    url = generateSignedUrl(movie.bunny_video_id);
  }

  // 2. Try direct video_url
  if (!url && movie.video_url) {
    url = movie.video_url;
  }

  // 3. Try video_sources table
  if (!url) {
    const { data: sources } = await supabase
      .from("video_sources")
      .select("url")
      .eq("movie_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sources?.url) {
      // Check if it's a direct video URL
      if (/\.(mp4|m3u8|webm)(\?|$)/i.test(sources.url)) {
        url = sources.url;
      } else {
        // Try to resolve the video source URL
        try {
          const resolveRes = await fetch(
            `${request.nextUrl.origin}/api/video-sources/resolve`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: sources.url }),
            }
          );

          if (resolveRes.ok) {
            const { video_url } = await resolveRes.json();
            url = video_url;
          }
        } catch {
          // Resolution failed
        }

        // If resolution failed, use the original URL directly
        if (!url) {
          url = sources.url;
        }
      }
    }
  }

  if (!url) {
    return NextResponse.json({ error: "Video not available" }, { status: 404 });
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
