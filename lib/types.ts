export type ContentType = "movie" | "documentary";

export interface Movie {
  id: string;
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  video_url: string;
  trailer_url: string | null;
  rating: number;
  rating_count: number;
  year: number;
  duration: number;
  genre: string[];
  director: string | null;
  cast_members: string[];
  is_published: boolean;
  is_premium: boolean;
  type: ContentType;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  movie_id: string;
  created_at: string;
}

export interface WatchProgress {
  id: string;
  user_id: string;
  movie_id: string;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}

export interface WatchStats {
  total_seconds: number;
  movies_watched: number;
  documentaries_watched: number;
}
