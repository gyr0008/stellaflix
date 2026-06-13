import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: progress, error } = await supabase
    .from("watch_progress")
    .select("position_seconds, movie:movies(type)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let totalSeconds = 0;
  let moviesWatched = 0;
  let documentariesWatched = 0;

  for (const item of progress ?? []) {
    totalSeconds += Number(item.position_seconds) || 0;
    const movieType = (item.movie as { type?: string })?.type;
    if (movieType === "documentary") {
      documentariesWatched++;
    } else {
      moviesWatched++;
    }
  }

  return NextResponse.json({
    total_seconds: Math.round(totalSeconds),
    movies_watched: moviesWatched,
    documentaries_watched: documentariesWatched,
  });
}
