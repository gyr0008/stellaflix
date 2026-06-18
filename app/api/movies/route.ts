import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { success } = await rateLimit(`movies:${ip}`, 30, 60);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  const { searchParams } = request.nextUrl;

  const genre = searchParams.get("genre");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("movies")
    .select("id, title, poster_url, backdrop_url, rating, year, genre, is_premium, description", { count: "exact" })
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (genre) {
    query = query.contains("genre", [genre]);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    movies: data,
    total: count,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
