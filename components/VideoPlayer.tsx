"use client";

import { useEffect, useRef } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onReady?: (player: videojs.Player) => void;
}

export default function VideoPlayer({ src, poster, onReady }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<videojs.Player | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const videoElement = document.createElement("video-js");
    videoElement.classList.add("vjs-big-play-centered");
    videoRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: "auto",
      fluid: true,
      responsive: true,
      sources: [{ src, type: "application/x-mpegURL" }],
      poster,
    });

    playerRef.current = player;
    onReady?.(player);

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, poster, onReady]);

  return (
    <div data-vjs-player className="w-full max-w-5xl mx-auto">
      <div ref={videoRef} />
    </div>
  );
}
