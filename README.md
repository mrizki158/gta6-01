# Solmaris Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mrizki158/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mrizki158/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down 2D open-world crime game, built for make.fun's **gta6-01** bounty. Explore the coastal city of Solmaris on foot or by car: steal vehicles, outrun a five-star wanted system with police pursuit, fight with fists or a pistol, and work a five-mission story chain for fixer Mara Voss. Traffic AI, pedestrians who flee trouble, a HUD with a live minimap, start and pause screens, a localStorage save, and synthesized WebAudio sound — all in vanilla JavaScript ES modules with no build step and no network loads. Every name, place and line of art is its own; nothing is borrowed from any commercial game.

## The five jobs

1. **First Wheels** — lift any car and deliver it to the chop yard.
2. **Hot Property** — steal the marked car at the marina and deliver it under police attention.
3. **Dockside Disagreement** — settle a three-man dock crew; Mara leaves you a pistol.
4. **The Long Way Home** — a package run across the city against a two-minute clock.
5. **Solmaris Heat** — load the bonded cargo at the docks, then disappear to the hideout with every siren in the city awake.

## Play it

Open `game/index.html` in a browser through any static server, or run:

```sh
node serve.ts
```

then open http://localhost:8080.

Controls: WASD move · Shift run · F enter/leave a car · E talk · Q swap weapon · mouse aims, left click attacks · P or Esc pauses. Stealing cars, brawling and gunfire all raise your stars; stay out of sight to cool them down, and do not let an officer corner you on foot — the BUSTED meter fills fast.

## Hand-in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are real renders of the game's own staged scenes (`game/src/shots.js`, listed in `shots.json`), captured in a browser at 1280×720.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qe91xxve&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
