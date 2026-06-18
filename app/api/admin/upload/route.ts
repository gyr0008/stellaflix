import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBunny, createStreamVideo, uploadToStream } from "@/lib/bunny";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success } = await rateLimit(`upload:${ip}`, 5, 300);
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

  // Check admin role
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const videoFile = formData.get("video") as File | null;
  const posterFile = formData.get("poster") as File | null;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const year = formData.get("year") as string;
  const genre = formData.get("genre") as string;
  const director = formData.get("director") as string;
  const cast = formData.get("cast") as string;
  const isPremium = formData.get("isPremium") === "true";

  if (!videoFile || !posterFile || !title) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    // 1. Upload poster to Bunny CDN
    const posterBuffer = Buffer.from(await posterFile.arrayBuffer());
    const posterUrl = await uploadToBunny(
      posterBuffer,
      `poster-${posterFile.name}`,
      posterFile.type
    );

    // 2. Create video in Bunny Stream
    const { guid: bunnyVideoId } = await createStreamVideo(title);

    // 3. Upload video to Bunny Stream
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    await uploadToStream(bunnyVideoId, videoBuffer, videoFile.type);

    // 4. Save movie record to database
    const genreArray = genre
      ? genre.split(",").map((g) => g.trim()).filter(Boolean)
      : [];
    const castArray = cast
      ? cast.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    const { data: movie, error } = await admin
      .from("movies")
      .insert({
        title,
        description: description || null,
        poster_url: posterUrl,
        bunny_video_id: bunnyVideoId,
        year: year ? parseInt(year) : null,
        genre: genreArray,
        director: director || null,
        cast_members: castArray,
        is_premium: isPremium,
        is_published: true,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, movieId: movie.id });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
