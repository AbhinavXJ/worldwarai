import type { Faction } from "@/lib/game/types";

const SRC: Record<Faction, string> = {
  dot: "/assets/dots/posters/alfred.webp",
  muse: "/assets/muse/jolly.png",
  grok: "/assets/grok/grok-bot-circle.svg",
};

/** The faction's real mascot art (official Dot poster, Jolly, Grok Bot mark), loaded from /public/assets. */
export function MascotIcon({ faction, className = "" }: { faction: Faction; className?: string }) {
  return <img className={`amb-mascot-icon m-${faction} ${className}`} src={SRC[faction]} alt="" draggable={false} />;
}
