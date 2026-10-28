import { useEffect, useState, type RefObject } from "react";
import { time } from "./model";

// Audio ticks belong to this small control, not to the entire 10,000-track library.
export function Timeline({
  audio,
  trackId,
  duration,
  position,
}: {
  audio: RefObject<HTMLAudioElement | null>;
  trackId?: string;
  duration: number;
  position: number;
}) {
  const [elapsed, setElapsed] = useState(position);
  useEffect(() => {
    setElapsed(position);
    const element = audio.current;
    if (!element) return;
    const tick = () => setElapsed(element.currentTime);
    element.addEventListener("timeupdate", tick);
    element.addEventListener("seeked", tick);
    return () => {
      element.removeEventListener("timeupdate", tick);
      element.removeEventListener("seeked", tick);
    };
  }, [audio, trackId, position]);
  return (
    <div className="timeline">
      <span>{time(elapsed)}</span>
      <input
        aria-label="Playback position"
        type="range"
        min="0"
        max={duration || 1}
        step=".1"
        value={Math.min(elapsed, duration || 1)}
        disabled={!trackId}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (audio.current) audio.current.currentTime = value;
          setElapsed(value);
        }}
      />
      <span>−{time(Math.max(0, duration - elapsed))}</span>
    </div>
  );
}
