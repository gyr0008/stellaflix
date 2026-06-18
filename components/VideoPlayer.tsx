"use client";

import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onReady?: (player: HTMLVideoElement) => void;
}

export default function VideoPlayer({ src, poster, onReady }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.src = src;
    if (poster) video.poster = poster;

    const handleCanPlay = () => {
      onReady?.(video);
    };

    video.addEventListener("canplay", handleCanPlay, { once: true });

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [src, poster, onReady]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <video
        ref={videoRef}
        controls
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: "70vh" }}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
