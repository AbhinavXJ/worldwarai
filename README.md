# AI MASCOT BATTLE — Dots vs Muses vs Grok Bots

A frontend-only 3D arcade brawler in which the internet's AI mascots have a very silly war.
Pick a faction, survive 3 minutes of chaos on a floating island, and keep your combo going.

```bash
npm install
npm run dev        # http://localhost:3000  (full cinematic intro)
                   # http://localhost:3000/game  (straight to fighter select)
npm run build      # static-friendly production build, deploys to Vercel as-is
```

There is no backend, database, auth or API. Best score lives in `localStorage`.

## Controls

| | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrows | left-side joystick |
| Aim | mouse | auto-aim |
| Primary | left mouse (hold) | FIRE (hold) |
| Special | right mouse | SPECIAL |
| Dash | SPACE / Shift | DASH |
| Interact (pickups, selfies) | E | E |
| Ultimate (100 energy) | Q | ULT |
| Pause | P / ESC | ❚❚ |

Add `?fps` to the URL to show a frame counter.

## Factions

- **Dots**: Dot Shot, Dot Swarm (homing), Token Dash, and the CONTEXT OVERFLOW ultimate, which buries the arena in thousands of dots.
- **Muses**: Spark, Creative Storm, Reality Shift (teleport plus paint), and the MUSE MOMENT ultimate, which freezes time, turns the world into art, and explodes.
- **Grok Bots**: LOL LASER, CHAOS MISSILE (bounces everywhere), YOLO BOOST, and the WHO GAVE HIM ACCESS? ultimate, which drops a building-sized Grok Bot on the arena.

## The mascots

| Faction | Looks like | Built from |
| --- | --- | --- |
| Dots | OpenAI's felt Dots: Alfred, Todd, Felipe, Jojo | OpenAI's published GLB models (`public/assets/dots/*.glb`) with a runtime felt/fur shader |
| Muses | Meta Muse's Jolly (plus Agrippa and headphones variants) | Procedural three.js model traced from Meta's reference art |
| Grok Bots | xAI's Grok Bot circle, triangle and diamond | Extruded from xAI's official Grok Bot SVG mark (`lib/game/grokMark.ts`) |

Enemies cycle through every variant, so a fight always has the whole cast. If the Dot
models fail to load, a procedural felt Dot takes their place.

## Architecture

```
app/                    Next.js App Router (/, /game)
components/Experience   phase → overlay switcher
components/game/        R3F canvas, post FX, HUD, select, end, touch controls
lib/game/engine.ts      imperative Game class (all three.js state lives here)
lib/game/*              world, characters, physics, combat, AI, NPCs, events,
                        props, abilities, spawning, secrets, particles, audio
```

React renders only the HUD and menus. A zustand store receives HUD updates at about 15 Hz.
The 3D world is a plain three.js object graph driven by one `useFrame` call. Crowds,
particles, projectiles, grass, the city and blob shadows are all `InstancedMesh` or GPU
points with pooled slots, so nothing is allocated during combat.

## Random events

Roughly every 30–60 seconds one of these hits: SERVER UPDATE, CONTEXT LIMIT, RATE LIMIT,
MODEL HALLUCINATION, or CEO SPAWN.

## Secrets

There are a few. The moon, standing very still, something golden, and the bottom of the map.

## Assets and trademarks

The mascots are the property of OpenAI, Meta and xAI. This is an unofficial, non-commercial
fan parody. Sources and terms are listed in `public/assets/ATTRIBUTIONS.md`. Read that before
deploying publicly, and remove the brand assets for any commercial use.
