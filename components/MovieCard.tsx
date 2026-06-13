"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Play } from "lucide-react";
import { motion } from "framer-motion";

interface Movie {
  id: string;
  title: string;
  poster_url: string;
  rating: number;
  year: number;
  genre: string;
}

export default function MovieCard({ movie }: { movie: Movie }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-lg overflow-hidden bg-gray-900 shadow-lg"
    >
      <Link href={`/movies/${movie.id}`}>
        <div className="relative aspect-[2/3] w-full">
          <Image
            src={movie.poster_url}
            alt={movie.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center">
              <Play className="w-6 h-6 text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-white font-semibold text-sm truncate">{movie.title}</h3>
          <div className="flex items-center justify-between mt-1">
            <span className="text-gray-400 text-xs">{movie.year}</span>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
              <span className="text-yellow-400 text-xs">{movie.rating.toFixed(1)}</span>
            </div>
          </div>
          <span className="text-gray-500 text-xs mt-1 block">{movie.genre}</span>
        </div>
      </Link>
    </motion.div>
  );
}
