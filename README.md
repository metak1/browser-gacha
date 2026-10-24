# Starlit Summons

A turn-based gacha RPG that runs in the browser. You summon heroes, build a team of four, gear them up with loot, fight through a campaign against AI enemies, and climb a PvP arena ladder.

## Running it

Requires Node 22.13 or newer. The server uses the built-in `node:sqlite`.

```bash
npm install
npm run dev        # API on :3000, Vite client on :5173 (open http://localhost:5173)
```

Production:

```bash
npm run build      # builds the client into apps/client/dist
npm start          # one server on :3000 serves both the API and the client
```

Other commands:

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm test`          | Runs the engine, gacha and API integration tests (Vitest)          |
| `npm run typecheck` | Typechecks every workspace                                         |
| `npm run make-admin` | Gives a player the admin role, which unlocks the Admin panel. With no name it picks whoever played most recently. Add `--revoke` to undo it. |
| `npm run grant-all` | Dev cheat: gives a player every character. With no name it picks whoever played most recently. Examples: `npm run grant-all -- myname --level 40` |
| `npm run max-heroes` | Dev cheat: maxes every hero a player owns (level, ascension, skill and ultimate levels, C6). Never lowers anything. With no name it picks whoever played most recently. Add `--no-constellation` to leave constellations alone. Run `grant-all` first to max the whole roster. |
| `npm run reset-password` | Sets a new password for a linked account: `npm run reset-password -- <username> <new password>` (8+ characters). |
| `npm run assets`    | Imports art from `asset-packs/` (sprite strips and the icon sheet) into the client and regenerates the sprite manifest. Re-run after adding packs. |
| `npm run format`    | Formats all TypeScript with Prettier (`.prettierrc.json`: single quotes, 160 columns). `npm run format:check` only checks. CSS and Markdown are left as written |
| `npm run balance`   | Auto-battles every stage of the *default* content at several levels and prints win rates and 3★ rates (`win% / 3★%`). For live content, use the stage simulator in the admin panel. Heroes are ascended as their level needs. Pass a team: `npm run balance -- zephyr,gaia,marina,yuki`, and add `--hard` (hard mode) or `--dungeons` (dungeon tiers). `--progression` models a free player day by day and prints how many days each chapter takes under the current stamina rules and a few alternatives |

Server environment variables: `PORT` (3000), `HOST`, `DB_PATH` (`apps/server/data/game.db`), `COOKIE_SECURE=true` (set this behind HTTPS), and `LOG=false`.

## Layout

```
packages/shared   Game rules and content, used by both server and client
  src/battle/       Deterministic battle engine, enemy AI, replay verification
  src/gacha.ts      Rates, pity, 50/50
  src/gear.ts       Gear rolls, upgrades, how gear changes stats
  src/arena.ts      Elo rating, tiers, weekly seasons
  src/content/      Content types, zod schemas, cross-reference validation, the default content
  src/api.ts        Request/response types for the HTTP API
apps/server       Fastify + SQLite
  src/db/           Connection wrapper and versioned migrations
  src/repos/        SQL only, one class per table group
  src/services/     Business rules (auth, player, gacha, battle, missions, content, admin)
  src/http/         Routes (routes.ts for players, admin.ts for admins), input validation (zod), session cookie
  src/scripts/      Dev commands (make-admin, grant-all, max-heroes, reset-password)
apps/client       React + Vite
  src/screens/      Home, Campaign, Arena, Battle, Summon, Roster (heroes and gear), Missions, Account
  src/admin/        Admin panel (loaded only when an admin opens it)
  src/battle/       useBattle hook that drives the engine, plus battle UI
```

## How it works

**The server decides every outcome.** Gems, gold, pity counters and the roster all live on the server. Every summon is rolled on the server with a cryptographic RNG.

**Battles are played on the client and checked on the server.**

1. When a battle starts, the server saves a snapshot of the team and a random seed.
2. The client runs the shared engine with that seed. Player turns are instant and enemy turns animate.
3. When the battle ends, the client sends the list of player actions. The server replays them through the same engine and pays out only if the replay ends in a victory.

A forged or illegal action log is rejected, and each battle can be claimed only once. The enemy AI never draws from the battle's random number sequence, so turning auto-battle on or off doesn't change what happens.

**Accounts.** Every player starts as a guest. A session token is kept in an httpOnly cookie, and only a hash of it is stored in the database. Linking a username and password (hashed with scrypt) turns the guest into a full account. Logging in on another device then loads the same progress. The login and link endpoints are rate-limited.

## Editing the game (admin panel)

All game content lives in the database and can be edited while the game is running:

- **Units:** stats, element, role, rarity, spells
- **Enemies**
- **Spells:** effects, targeting, cooldown
- **Chapters**
- **Stages:** enemies, levels, rewards
- **Banners:** featured units, on or off
- **Missions**
- **Settings:** economy, level-up costs, starter heroes, gacha rates

To get access, run `npm run make-admin` and reload. An **Admin** entry then appears in the ⚙ menu (or **More** on phones).

- **Validation:** every save checks the whole game, including cross-references. A unit can't use a spell that doesn't exist, a spell can't be deleted while a unit uses it, and a featured ★5 must actually be ★5. Problems are listed above the form, and nothing is saved until they're fixed.
- **Live updates:** after a save, the server hands the client the new content right away. Other players get it the next time they load the game.
- **Battles in progress:** when a battle starts, the server stores a full copy of every unit and spell it uses. Edits never change a fight already underway, and the server can still replay it to check the result.
- **Simulator:** the stage editor includes one. It auto-battles the saved stage many times on the server against any team and level, and reports the win rate.
- **Players tab:** search players, grant currency, unlock all heroes, set levels, or make someone an admin.
- **Import / Export:** download the full content as JSON, restore it from a file, or reset to the built-in defaults.

The defaults the database is first filled with are in [defaults.ts](packages/shared/src/content/defaults.ts).

**Missions** come in two kinds:

- **Counters:** win battles, summon, level up, or claim daily supplies. These count actions that happen after the mission is created.
- **Progress checks:** own N heroes, or clear a specific stage. These are worked out from the player's current progress.

A mission can be one-time or daily; daily missions reset at 00:00 UTC.

## Hero progression

- **Teams:** up to 5 named teams. The Roster shows them as tabs: click one to switch, click the active one to rename it. A new team starts as a copy of the current one, then edit it as usual.
  - Every battle prep screen has a team switcher with portraits: the campaign stage panel, the open dungeon, event stages and the guild boss. Switch to a Flame team for a Frost dungeon, a tanky team for a boss, and so on.
  - Battles always use the active team. Switching saves the current team into its own slot first, so nothing is lost. (Stored in `team_presets`; the active team stays in `teams`, DB migration v10.)
- **Level up in bulk:** next to Level up, "+5" and "To Lv N" buttons show the levels and total gold you can afford (up to the cap). The server does them in one go (`POST /roster/:id/level-up { count }`), and each level counts for missions.
- **Auto-equip:** the hero's Gear header has an "Auto-equip" button that shows the power it would add. It puts the best gear from your bag in each slot, judged by the hero's resulting stats. Gear worn by another hero is never taken. When nothing would improve, it says "already best".
  - **Aim for a set:** next to it, "Aim for" picks a gear set per hero (saved on the account). Auto-equip then puts a piece of that set in every slot it can, and the strongest gear in the rest, even if that costs some raw power.
- **Gear lock:** 🔒 Lock on any item (in the bag or on the loot screen) protects it: it can't be salvaged or sold, and bulk salvage and Sell all skip it. Locked items show a 🔒 on their tile.
- **Gear bag filters:** besides slot and sort, filter by set, main stat, rarity, and worn / free / locked, with a count of matching items and a Clear button.
- **Roster:** your heroes first, sorted by power (final stats with gear), level, rarity, element or name (the choice is remembered on the device). Filter by rarity and element.
  - Heroes you haven't found yet are in a collapsible **Collection** section underneath.
- **Ascension:** heroes start with a level cap of 20. Ascending costs gold, essence of the hero's own element, and Star Crystals at higher ranks. Each ascension raises the cap (30 → 40 → 50 → 60) and adds a permanent HP/ATK/DEF bonus.
- **Skill levels:** each hero's skill and ultimate level from 1 to 5 with gold and Skill Tomes. Every level adds +10% to the spell's damage, heal and shield multipliers.
- **Lore:** heroes have a title and story entries. Later chapters unlock at higher ascension ranks.
- **Materials:** essences, crystals and tomes come from:
  - stage drop tables (essence for each enemy element; bosses also drop crystals and tomes)
  - mission and arena-tier rewards
  - the Materials shop (in the Roster) for gold or stardust
- **Editing:** every number is editable in **Admin → Settings → Hero progression**: caps, costs, stat bonuses, skill costs and power, and shop prices. Materials have their own admin tab, and the unit editor has a story editor.
- **In battle:** ascension bonuses and skill levels are part of the battle snapshot, so the server's replay check still covers them. Arena bots are ascended to match their level.
- **Migrated saves:** heroes above level 20 in older saves were given the ascension ranks their level needs, so nobody lost levels.

## Art assets

The game uses third-party pixel art alongside its own generated visuals:

| Pack | Used for | By |
| ---- | -------- | -- |
| [Tiny RPG Character Asset Pack](https://zerie.itch.io/tiny-rpg-character-asset-pack) (full, 22 characters) | Animated unit sprites | Zerie |
| [Tiny RPG Character Asset Pack 02](https://zerie.itch.io/tiny-rpg-character-asset-pack-02) (full, 20 characters) | Animated unit sprites | Zerie |
| [Raven Fantasy Icons](https://clockworkraven.itch.io/raven-fantasy-icons) (free) | Spell, gear, status and currency icons | Clockwork Raven Studios |

The game also shows these credits on the Account page.

**How it works.**
- **Importing:** unzip the packs into `asset-packs/` (git-ignored), then run `npm run assets`. [import-assets.ts](tools/import-assets.ts) copies each character's animation strips into `apps/client/public/assets/sprites/<id>/`. It also measures each character's pixel bounds, so the feet line up on the ground and sprites of any size scale to the same height. Finally it copies the 16px icon sheet and writes [assets.generated.ts](packages/shared/src/assets.generated.ts).
- **Assigning art:** units have an optional `sprite`, and spells and gear templates have an optional `icon`. Set them in the admin panel, which has an animated sprite preview and an icon browser. Anything without art falls back to its emoji. Missing art never breaks stored content.
- **In battle:** sprites play their attack animation when acting (basic, skill and ultimate each use a different attack), hurt when hit, and death when defeated. Enemies are mirrored to face left. Pixel art is drawn with `image-rendering: pixelated`, and icons are scaled by whole pixels.
- **Animation names:** the importer reads each character's strips by name and picks one source per clip.
  - `Flying` stands in for idle and walk on the bats and ghosts.
  - `Attack`, `Heal`, `Summon`, `Attack3` and `Walk01` fill the attack and walk clips when the usual names are missing.
  - Strips "With magic effects" are preferred, because they show the spell in-frame. "No ... effects" variants are only a fallback.
  - Projectile folders are skipped.
- **Where the art is used:**
  - Six sprite heroes: Elara (wizard), Varek (knight templar, on the limited *Order of the Templar* banner), Sir Roland (knight), Sister Celeste (priest), Kael (swordsman) and Fenn (archer). Aldric uses the Soldier.
  - Twenty-two enemies use matching sprites. Nine were added with this pack (Skeleton Warrior, Skeleton Archer, Hellhound, Lava Slime, Minotaur, Watcher Eye, Orc Rider, Black Knight, Ghostfire); they stand in for same-element enemies in a few stages and dungeon tiers, with matching stats.
  - Every other character is available in the admin sprite picker.
- **Adding art:** unzip new packs into `asset-packs/` and re-run `npm run assets`. Existing sprite ids keep their names.

## Presentation

The whole game uses a pixel-art look to match the Tiny RPG sprites. Sound and music are synthesized with Web Audio.

- **Pixel backdrops:** [pixelScene.ts](apps/client/src/components/pixelScene.ts) paints each theme procedurally at 320×180, from a fixed seed: dithered skies, ridges with snow caps, pixel trees and clouds, castles, a volcano, a temple and lava cracks. It caches the result as an image, which is scaled up with `image-rendering: pixelated` and anchored to the ground. Weather particles (snow, embers, rain, bubbles) are square pixels on top.
  - **Themes (11):** meadow, ember, frost, storm, deep, cosmos, plus five medieval ones:
    - **kingdom:** a royal castle on a hill with banners, torches, a portcullis and a cobbled road; falling petals.
    - **village:** thatched cottages, a windmill, a chapel and wheat fields at golden hour; drifting chaff.
    - **forest:** a dark enchanted wood with giant trunks, glowing mushrooms and fog; fireflies.
    - **ruins:** a broken arch and colonnade overgrown with ivy at sunset, with crows; falling leaves.
    - **camp:** a war camp at dusk with striped tents, a palisade, banners and campfires; rising sparks.
  - **Where they're used:** any chapter, dungeon or event can pick one in admin. The Armory uses camp and the Bastion uses ruins (content upgrade v29, only if they were still on their old themes). Arena fights take place in the kingdom. The endless tower cycles through all 11, ten floors each.
- **Pixel emoji:** heroes and enemies without a sprite are drawn as pixel art by [`PixelEmoji`](apps/client/src/components/Art.tsx). The emoji is rendered at 16px on a canvas, its edges hardened, its colours posterised and a dark outline added like the sprites, then it is scaled up crisply.
- **Pixel UI:** [pixel-theme.css](apps/client/src/pixel-theme.css) sets the fonts (self-hosted in `public/fonts`, both SIL Open Font License): **Tiny5** for text, because it stays crisp at small sizes, and **Pixelify Sans** for big titles. Pixel fonts have one weight and faux bold is disabled. Panels and buttons get squarer corners, hard stepped shadows and bevels instead of soft blurs, HP bars are flat pixel bars, and damage numbers have a pixel outline.

- **Battle playback:** the engine resolves each action instantly and returns a list of events. A "director" in [useBattle.ts](apps/client/src/battle/useBattle.ts) plays those events back one at a time: lunges, impacts, skill banners, floating numbers and sounds. While an event plays, a separate display copy of the battle state is updated by [display.ts](apps/client/src/battle/display.ts), so HP bars drop at the moment each hit lands.
- **Battle stage:** sized in CSS container units, so it scales like a fixed game canvas. On phones it switches to a taller shape.
- **Spell effects:** the importer also takes the projectile and magic strips that ship next to some characters.
  - Arrows and cannonballs fly from attacker to target; magic, fire and heal effects play on the target.
  - Units with an effect for an attack fight from where they stand instead of lunging.
  - See [SpellFx.tsx](apps/client/src/battle/SpellFx.tsx) and the `fx` field in the sprite manifest.
- **Sprite timing:** strips animate by background-position percentages with `steps()`: `steps(n, jump-none)` for one-shots and `steps(n, jump-end)` for loops, so every step lands exactly on a frame. The old pixel `calc()` version drifted between frames.
- **Music:** [music.ts](apps/client/src/audio/music.ts) generates looping chiptune tracks: a calm lobby loop, a battle beat, and a tense boss track for any fight with a boss. Tracks cross-fade. It starts after the first click or keypress, as browsers require. Toggle music and sound from the ⚙ menu.
- **Navigation** ([Nav.tsx](apps/client/src/components/Nav.tsx)):
  - Desktop: Home · Play ▾ · Summon · Heroes · Missions · Social, then the counters, the ⚙ menu (music, sound, account, admin) and the account chip.
  - **Play** opens a menu of game modes with a status line each: the next campaign stage, the running event and its currency, dungeons open today, and lock requirements.
  - Phones get a bottom tab bar (Home, Play, Summon, Heroes, More). Play and More open sheets from the bottom.
  - Red badges show what's waiting: the daily reward on Home, missions to claim, and friend requests plus guild attacks left on Social. The server sends the social counts as `profile.notices`.
- **Phones:** the top bar is a single row of counters, the lobby is taller so the buttons don't cover the team, and the battle HUD uses compact portraits with the skill text above the action buttons.
- **Settings:** mute, music, battle speed (1×/2×/3×), repeat and **Larger text** (⚙ menu, or More on phones) are saved per device. Auto-salvage is saved on the account.
- **Readability:** no text is smaller than 0.72rem (the pixel font gets hard to read below that), except tiny fixed boxes like skill pips. Body text is in rem, so Larger text (`html.large-text`, 112.5%) scales the whole UI.

## Ultimates, gear and the arena

**Ultimates.**
- **Energy:** every unit has an energy bar. It starts at 20, then gains +25 for a basic attack, +35 for a skill and +8 each time the unit is hit.
- **Using it:** when the bar reaches 100, the unit's ultimate unlocks (the R key or the big round button). It plays a full-screen cinematic and empties the bar.
- **Who has one:** every default hero and boss has an ultimate. In the admin panel an ultimate is just a spell, assigned in the unit editor. The energy rules are in [engine.ts](packages/shared/src/battle/engine.ts).

**Gear.**
- **Slots:** each hero has a weapon, armor, charm and **boots** slot.
  - **Main stats are random:** every drop rolls its main stat from its slot's pool, so the same template can drop with different mains.

    | Slot | Main stat can roll |
    |---|---|
    | ⚔️ Weapon | ATK, ATK %, Crit Rate, Crit DMG |
    | 🛡️ Armor | HP, HP %, DEF, DEF %, Effect RES |
    | 📿 Charm | ATK %, HP %, DEF %, Crit Rate, Crit DMG, Effect Hit, Effect RES |
    | 👢 Boots | SPD, ATK %, HP %, DEF % |

  - **SPD as a main stat only exists on boots.** Content validation enforces it.
  - **Main values:** they come from a per-stat table (`MAIN_BASE` in [gear.ts](packages/shared/src/gear.ts), ★4 values; ★3 ×0.65 and ★5 ×1.5).
  - **Fixed mains:** admins can still pin a template to a fixed main stat in **Admin → Gear** ("🎲 Random" is the default). The preview lists every main the slot can roll.
  - **Upgrade:** content upgrade v16 switched the default templates to random; templates an admin had edited keep their fixed main.
  - The six boots (Clover Sandals ★3; Ranger Boots, Iron Greaves and Pilgrim Treads ★4; Featherstep Boots and Warlord Sabatons ★5) drop from every chapter.
  - The old SPD charms (Lucky Clover, Swift Feather) became Clover Sandals and Featherstep Boots in content upgrade v15. Players' existing SPD gear moved to their boots slot (DB migration v12), still worn by the same hero.
- **Drops:** stages drop gear by chance, using a drop table per stage that you can edit. Each drop rolls a main stat from its slot's pool, plus random bonus stats: one, two or three for ★3, ★4 or ★5.
- **Upgrades and salvage:** upgrading costs gold. It raises the main stat, and every 3 levels it adds a bonus stat (up to 4) or boosts an existing one. Salvage turns unwanted gear into gold.
- **Templates:** admins edit gear templates and the gear settings. Editing a template only affects future drops; items players already own keep their numbers.
- **In battle:** gear is included in the battle snapshot, so the server's replay check still covers it.

**Arena (async PvP).**
- **Defense teams:** each player sets a defense team. Others fight it with the AI controlling it, using the defender's current levels and gear.
- **Opponents:** the server picks them (2 real players near your rating, topped up with bots) and remembers what it offered, so a client can't choose or invent a target. Bots copy your team's size and the rarity of each hero, at levels from slightly easier to slightly harder.
- **Ratings:** Elo. Attackers use K=32 and defenders move by half as much.
- **Limits and rewards:** you get a daily ticket allowance, and each win pays gold and gems.
- **Seasons:** each season is one ISO week. Your first arena visit in a new week pays your tier's reward and moves your rating halfway back toward the starting rating.
- **Settings:** tiers, rewards and every number above are editable in the admin Settings panel.

**Upgrading older saves.** Database migration v3 adds the gear and arena tables. On startup the server also runs content upgrades ([upgrade.ts](packages/shared/src/content/upgrade.ts)). These merge the new default ultimates, gear templates, drop tables and missions into content saved by an earlier version, without overwriting anything an admin changed.

## Campaign, hard mode and dungeons

- **Chapters:** six chapters with 24 stages:
  - Whispering Meadow, Ember Peaks and Frozen Citadel
  - **Storm Spire**, **Sunken Temple** and **Starfall Abyss**, for levels 27–54. These add the Storm and Deep scenes.
- **Waves:** a stage can have extra waves. When every enemy is down, the next wave arrives and the defeated enemies leave. Heroes keep their HP, energy and cooldowns. A "Wave 2/3" banner and chip show progress.
- **Summons:** spells can summon enemy units with the `summon` effect. Three bosses use it: the Thunderbird, the Orc Warlord and the Demon Lord.
  - Summoned units are minions with 60% of normal stats.
  - A side never has more than 5 living units.
  - A unit can't summon again while any minion it called is still standing.
- **Difficulty curve:** recommended levels rise smoothly from Lv 1 (1-1) to Lv 52 (6-4), and enemies sit one level below.
  - Each stage has an **enemy stat multiplier** (`statMult`) on HP/ATK/DEF that does the fine tuning. It was calibrated so the starter team, with no gear, at the recommended level wins about 85% of auto-battles on normal stages and 65%+ on bosses. Chapter 1 is never made harder than base stats.
  - Before this, bosses were walls (2-4 won 21% and 3-4 7% at their recommended level), and the next chapter's first stages were far easier than labelled.
  - The 3★ action budgets were recalibrated for the new curve: about what the starter team needs in its quicker fights five levels above recommended.
  - Rerun it after changing enemies or heroes with `npm run balance -- --calibrate`, then paste the printed `STAGE_TUNING` (content/defaults.ts) and `ACTION_BUDGETS` (content/passives.ts). `npm run balance` prints the win%/3★% table by level.
  - The stage panel warns when your team's average level is below the recommended level, more strongly at 5+ levels, with a link to level up.
  - Content upgrades v11 and v12 move existing content onto the new curve. Only stages still on their old defaults change (budgets from the first star release, which used a formula, count as defaults); anything an admin edited is kept.
- **Hard mode:** a chapter opens on hard once all its normal stages are cleared. Hard stages then unlock in order. You switch with the Normal/Hard toggle on the campaign page.
  - Enemies get +10 levels and ×1.2 HP/ATK/DEF.
  - Rewards: ×2 gold and materials, ×1.5 gear drop chance, and 100 gems on each first hard clear.
  - Hard mode has no stars; clears are tracked separately (as `hard:1-1`).
  - Every number is under **Admin → Settings → Hard mode & dungeons**.
- **Two tabs:** the Dungeons page has a header panel with two tabs, **⚔️ Gear** (the default) and **✨ Essence** (`/dungeons?tab=essence`). Leaving a fight goes back to the tab that dungeon is on.
- **Daily dungeons:** six elemental dungeons, one per weekday from Monday to Saturday, and all of them open on Sunday (UTC). Each is the place to farm that element's essence.
  - Three tiers (recommended Lv 10/25/45). Each tier unlocks after the one before it is cleared, and the top tiers add Skill Tomes and Star Crystals.
  - No daily limit: each run costs ⚡10 like every other level, paid at the start and refunded on a loss. Set it per tier in **Admin → Dungeons → Stamina per run**.
  - Edit them in **Admin → Dungeons**: days, tiers, enemies, waves and drops.
- **Gear dungeons:** three dungeons that are open every day and drop **only gear** (no essence, a little gold). Each drops two gear sets and has its own hidden enemy mechanic (the same challenges as the tower; it isn't shown on the page, so players find out in the fight):

  | Dungeon | Sets | Mechanic |
  |---|---|---|
  | 🪓 The Armory | Precision, Ruin | Ironhide: enemies have 2.5× DEF and +10% HP |
  | 🏰 The Bastion | Vitality, Bulwark | Empowered: enemies start with ATK Up and DEF Up, and may buff again each turn |
  | 🌪️ Windspire | Fury, Gale | Swift: enemies have +10% SPD and a big head start |

  - **Random sets:** there is no set choice. Each drop is one of the dungeon's two sets at random, with a random slot, main stat and bonus stats.
  - **Loot screen:** after a win or a sweep, tap any item to inspect its set, main stat and bonus stats, then keep or sell it. Selling is salvaging: gold, plus reforge stones for ★4/★5. **Sell all** sells the whole haul, except locked or equipped items.
    - **Compare:** the inspect panel compares the item on a hero (by default whoever in your team it helps most; any hero can be picked): what it replaces, each stat that changes, and the power difference. **Equip on …** puts it on right there, and **Lock** keeps it safe.
  - **Tiers:** the same for all three (enemy levels differ per dungeon):

    | Tier | Recommended | Gear per win | Rarity odds |
    |---|---|---|---|
    | I | Lv 15 | 2 | ★3 60% · ★4 40% |
    | II | Lv 30 | 2 | ★3 20% · ★4 65% · ★5 15% |
    | III | Lv 45 | 3 | ★4 60% · ★5 40% |
    | IV | Lv 55 | 3 | ★4 30% · ★5 70% |

  - **Rules:** same ⚡10 per run as every other level. Auto-salvage and the gear bag limit apply.
  - **Tuning:** enemy levels were tuned with `npm run balance -- --dungeons` (mechanic included) so each tier is winnable around its recommended level.
  - **Editing:** any dungeon tier can become a gear tier. In **Admin → Dungeons**, **Gear drops** sets gear per win and rarity weights, **Gear sets dropped** sets which sets drop, and **Mechanic** sets the enemy challenge.
  - **Upgrades:** content upgrade v20 adds the Armory, and v21 fixes its first-draft levels. v22 narrows the Armory to Precision/Ruin with Ironhide and adds the Bastion and Windspire. v23 finishes v22 for content left in an in-between state. v24 removes the "bring …" advice from their descriptions. v25 replaces the daily run limit with a stamina cost per tier. v26 sets every level to ⚡10 (costs still on their old defaults), and v27 lowers XP per stamina from 10 to 6 so a campaign win still gives 60 XP. Edited dungeons are left alone.
- **New missions:** boss clears for chapters 4–6, daily and lifetime dungeon runs, and hard-mode clears.

## Endless tower

- **What it is:** an endless climb, opened after clearing 2-4 (**Admin → Settings → Feature unlocks**). It's in the Play menu.
- **Floors** are generated, so the tower never ends:
  - Enemies are level 6 on floor 1 and gain a level per floor up to the level cap. After that, a growing stat multiplier keeps them getting stronger.
  - Every 5th floor is guarded by a chapter boss, with its charge, enrage and adds.
  - Floors from 20 on bring a second wave.
  - The same floor always has the same enemies.
- **Rules:** only your next floor can be fought, and there is no stamina cost.
  - Each floor pays once: 💎20 and 🪙300 + 40 × floor.
  - Every 10th floor adds a milestone reward: 💎150, ✨10, a Star Crystal and a Skill Tome.
  - Wins give dungeon-level XP.
- **Page:** the next floor's enemies, rewards and recommended level (with an under-level warning), a team switcher, the next milestones, and a leaderboard of the top 20 by best floor with your own rank.
- **Tuning:** a starter team with no gear at each floor's recommended level clears regular and boss floors alike up to the level cap (around floor 55). Past that, real teams, gear and ascensions decide how far you go. Every number is under **Admin → Settings → Endless tower**.
- **Under the hood:** progress is stored with stage clears as `tower:<floor>` (no migration). The generator is `towerFloor()` in [tower.ts](packages/shared/src/tower.ts).

## Boss mechanics

Every chapter boss has scripted behaviour, run by the shared engine, so the server's replay checks it too.

- **Charged attacks:** every few turns the boss spends its turn charging a big spell, and unleashes it on its next turn.
  - A banner says what is coming and how much damage breaks it. The boss glows, and a break bar under its HP fills as you hit it.
  - Deal that much damage before its next turn and the charge **breaks**: the spell is cancelled and the boss is stunned for a turn.
  - Auto-battle focuses a charging boss, but manual play (skills and ultimates on the boss) breaks far more often.
- **Enrage:** once below an HP threshold, ATK and SPD go up for the rest of the fight.
- **Adds:** at HP thresholds the boss calls minions (60% stats, at most 5 units per side).

| Boss | Charged attack | Every | Break at | Also |
|---|---|---|---|---|
| Abyssal Kraken (1-4) | Tidal Crush | 3 turns | 15% HP | — |
| Ashen Wyrm (2-4) | Inferno Breath | 3 | 11% | enrages below 30% |
| Frost Lich (3-4) | Absolute Zero | 4 | 8% | calls a Skeleton at 50% |
| Thunderbird (4-4) | Judgment Bolt (single target) | 3 | 5% | enrages below 40% |
| Orc Warlord (5-4) | Cataclysm Slam | 4 | 15% | enrages below 50% |
| Demon Lord (6-4) | Hellgate | 4 | 10% | enrages below 30%, calls a Hellhound at 50% |

- **Tuning:** break thresholds were set by simulating each boss fight with auto-battle (with and without mechanics), so win rates at the recommended level stay close to what they were, while auto-battle breaks roughly 20–80% of charges.
- **Guild bosses** use the same mechanics. The break threshold comes from the boss's normal HP, not the guild's damage pool, so breaking still works there.
- **Editing:** **Admin → Enemies → Boss mechanics** turns each part on or off and sets the spell, timing, break %, enrage numbers and adds. Any enemy can have them.

## Player level, titles and the login calendar

- **Account XP:** you get XP for every win:
  - 10 per stamina spent (campaign, hard, events and sweeps)
  - 50 per dungeon run
  - 40 per arena win
  - 40 per guild attack

  Each level up pays 💎50 and ⚡30. The level shows on the account chip and on the Account page.
- **Titles:** unlocked at levels 5, 15, 30, 50 and 80 (Adventurer … Mythic), and by claiming any one-time mission (its name becomes a title). Pick one on the Account page; it shows to friends and guildmates.
- **Login calendar:** each daily-supplies claim also pays the next day of a 7-day reward track, which cycles. It is shown on Home.

## Daily loop

- **Today panel (Home):** one panel for the whole day: the daily supplies and login calendar, the activity chests, then every daily mission with its progress, rewards and activity points, and a button to get it done. Finished missions fold into a "✓ N finished" line. (The Progress meters moved to the Account page.)
  - **Claim** when it is complete.
  - **Go** takes you to the right screen (campaign, summon, roster, arena, dungeons, guild).
  - 🔒 shows the stage that unlocks it, and **Collect** claims the daily supplies right there.

  It also shows how many tasks are done and the time until the 00:00 UTC reset.
- **Activity points:** claiming a daily mission adds its points (10–20 each, 135 a day if everything is unlocked).
- **Daily chests:** at 30, 60 and 100 points:
  - 30: 🪙3,000 and a Skill Tome
  - 60: 💎100 and a Star Crystal
  - 100: 💎200 and ✨20

  They show along the points bar on Home and Missions, and glow when ready. Ready chests count toward the Missions badge.
- **Editing:** set each daily mission's points in **Admin → Missions**, and the chests in **Admin → Settings → Daily activity**.
- **Upgrades:** existing content gets the boss mechanics and mission points through content upgrade v10. Nothing an admin changed is overwritten.

## Events

- **What's in an event:** an event has dates (inclusive UTC days), a theme, its own currency, a few stages that unlock in order, and an exchange shop.
  - Stages cost stamina like the campaign and pay currency, gold and first-clear gems.
  - Shop items have per-player limits, and can sell a hero copy (duplicates become constellation and stardust, as from the gacha).
- **Harvest Moon Festival** runs 2026-10-15 to 2026-11-15. You trade 🍬 Moon Candy for **Hollow, the Pumpkin Knight**, a limited 4★ who isn't in the gacha.
- **Where it appears:** while an event is running it gets an entry in the Play menu and a Home banner.
- **Editing:** create or edit events in **Admin → Events**: dates, stages with waves, currency and the shop.

## Friends and guilds

- **Friends:** add friends by their 10-character friend code (Social → Friends). Each player picks a support hero.
  - Before a campaign or event battle, you can bring one friend's support hero as a 5th ally, once per friend per UTC day.
  - The lender earns 🪙200 each time.
- **Guilds:** found one for 🪙5,000, or join an open guild (up to 20 members).
  - **Weekly boss:** a rotating boss (Wyrm, Kraken, Lich, Thunderbird). Its HP pool is 150–180k per member, and every member gets 3 timed attacks a day (40 turns each).
  - **Scoring:** damage to the boss counts toward the guild's weekly total. Members ranked by damage are listed on the guild page.
  - **Chests:** they open at 25/50/75/100% of the pool, for every member who attacked that week.
  - **Leader:** when the leader leaves, the longest-standing member takes over.
- **Engine:** battles can set a `turnLimit`, and guild attacks use it.
- **Editing:** everything is tunable in **Admin → Settings**: player level, login calendar, friends and guilds.

## Gear salvage

- **Auto-salvage:** in **Roster → Gear**, choose Off, ★3, or ★3–4. Matching drops turn into gold the moment they drop, including during sweeps, and the result screen shows how much was salvaged.
- **Salvage spares:** a one-click clear-out of unequipped, unupgraded ★3 (or ★3–4) gear.
- **Reforge Stones:** salvaging gives 1 per ★4 and 3 per ★5 (auto-salvage too). Tower milestones give 3 more.

## Gear forge

Open any item (**Roster → Gear**, or from a hero's gear slot) and expand **🔨 Forge**. Every bonus stat shows its roll quality: how close its value is to the best possible for the number of rolls it holds (gold bar = perfect). Bonus stats that suit the hero wearing the item are marked ✓.
- **🎲 Reforge** a bonus stat (🪙 2,000 × rarity and 1 stone). It becomes a different **random** stat with fresh values; there is no way to choose the result.
  - It never becomes the main stat or a duplicate of another bonus stat.
  - It **keeps its roll count**, so upgrade boosts aren't lost.
- **Roll counts:** substats store their roll count (`rolls`). Older items have it estimated from their value.
- **Storage:** the Reforge Stone was added to existing content in content upgrade v13. The gear table's `forge` column (DB migration v11) is left over from an early version with a "perfect" option and is unused.
- **Editing:** every number is under **Admin → Settings → Gear forge**.

## Recommended builds

Each hero's sheet (**Roster → hero → Overview**, under Gear) shows a recommended build for their role.
- **What it covers:** the main stat to look for in each slot (weapon, armor, charm, boots), and the bonus stats to look for in priority order, with a one-line reason.
- **Fit count:** it says how many of the hero's equipped bonus stats are on the list.

| Role | Weapon | Armor | Charm | Boots | Bonus stats |
|---|---|---|---|---|---|
| 🗡️ Fighter | Crit DMG / Crit Rate | HP % | Crit Rate / Crit DMG | ATK % / SPD | Crit Rate › Crit DMG › ATK % › SPD |
| 🛡️ Tank | ATK % | HP % / DEF % / Effect RES | HP % / DEF % | HP % / DEF % | HP % › DEF % › Effect RES › HP |
| 💚 Healer | ATK % | HP % / Effect RES | ATK % / HP % | SPD / HP % | ATK % › SPD › HP % › Effect RES |
| 🎶 Support | ATK % | HP % / Effect RES | Effect Hit / HP % | SPD | SPD › Effect Hit › HP % › Effect RES |

Builds adapt to what a hero's skill and ultimate scale with:
- **DEF:** DEF % › DEF › HP % › Effect RES.
- **Max HP:** HP % › HP › SPD › Effect RES.
- **SPD:** SPD first, then crits for Fighters.

The builds live in [builds.ts](packages/shared/src/builds.ts).

## Stamina, sweep and repeat

- **Stamina:** every level costs ⚡10: campaign, hard mode, events and every dungeon tier. Wins give 6 XP per stamina spent (60 XP a run). Stamina regenerates 1 point every 5 minutes up to 200 (raised from 120 by content upgrade v28, so checking in two or three times a day loses nothing to a full bar).
  - Losing a battle refunds it.
  - Click the ⚡ counter in the top bar to buy +60 for 50 gems. Refills can go above the max.
  - Dungeons cost stamina too (⚡10 a run), and wins give XP per stamina spent like the campaign. There is no daily run limit.
- **Sweep:** once a stage has every star (or is cleared on hard), **⏩ Sweep** repeats it instantly for the same loot, at the same stamina cost per run. Cleared dungeon tiers can be swept too, for their stamina cost per run. One sweep does up to 10 runs.
- **Battle speed** goes up to 3×.
- **🔁 Repeat:** after an auto victory, the next run starts after a 3-second countdown. It stops on a defeat, when you can't afford another run, or when you press Stop.
- Tune it all in **Admin → Settings → Stamina**, plus "Most runs per sweep" under Hard mode & dungeons.

## Onboarding

- **Tutorial** ([Guide.tsx](apps/client/src/components/Guide.tsx), steps in [onboarding.ts](packages/shared/src/onboarding.ts)): new players are walked through welcome → first battle (1-1) → level up a hero → the free first 10× summon → a wrap-up card.
  - Each step spotlights the next thing to tap on whatever screen the player is on: the Adventure button, the Heroes tab, Level up, the Summon tab, then the banner, the pity bar and Summon ×10. The page stays usable underneath.
  - After winning 1-1, the result screen shows **Continue tutorial** instead of the next stage.
  - Progress is stored in account flags (`guide-welcome`, `guide-levelup`, `first-summon`, `guide-done`), so it resumes on any device. **Skip tutorial** on any card ends it.
  - Accounts that were already playing (past 1-1, or have summoned) don't get it.
- **Free first 10× summon:** the first 10× on any banner costs nothing, and if none of the ten is a ★5, the last pull is brought to hard pity so it is one (the banner's rate-up and 50/50 still decide which ★5). The server sets the `first-summon` flag when it is used. Single pulls don't use it up. Turn either part off under **Admin → Settings → Economy**.
- **Guided first battle:** the first time a player reaches their turn in stage 1-1, a spotlight tour explains turn order, basic attacks, skills and cooldowns, energy and ultimates, targeting and elements, then AUTO and speed. Finishing or skipping it sets the `tutorial-battle` flag on the account, so it never shows again, on any device.
- **Feature unlocks:** the Arena opens after clearing 1-4 and Dungeons after 2-1.
  - Until then, the Play menu shows them with a 🔒 and the stage that unlocks them, and their pages explain how to unlock them.
  - The server refuses arena and dungeon battles too.
  - The result screen celebrates a new unlock. Change the stages under **Admin → Settings → Feature unlocks**.
- **Next step:** the home screen suggests one thing to do next: play the first battle, claim finished missions, summon, level up a hero who can afford it, or work toward the next unlock.

## Stars and chapter chests

- **Objectives:** each stage has up to three star objectives. The defaults are: win, have no hero defeated, and win within an action limit (your team's moves only). The limits are tuned with `npm run balance`, so the starter team gets 3★ about five levels above a stage's recommended level.
- **Best stars:** the server scores objectives from its own replay of the battle and keeps each stage's best result. Any victory earns at least one star; clears from older saves count as one star.
- **Chests:** chapters have chests at star thresholds (4/8/12 by default) holding gems, gold, stardust and materials. Open them from the campaign map; each opens once.
- **Editing:** stage objectives are under **Admin → Stages → Star objectives**. The stage simulator also reports the all-stars rate and actions per win. Chests are under **Admin → Chapters → Star chests**.

## Combat stats and stat-scaling spells

- **Combat stats:** besides HP/ATK/DEF/SPD, every unit has four:
  - **Crit Rate:** chance to crit.
  - **Crit DMG:** crits deal 1 + this.
  - **Effect Hit:** raises the chance its debuffs land.
  - **Effect RES:** lowers the chance debuffs land on it.

  They don't grow with level. They're shown under the main stats on the hero sheet.
- **Where they come from:**
  - **Base:** 10% Crit Rate and 50% Crit DMG (the old fixed crits).
  - **Role:** Fighters +5% Crit Rate and +10% Crit DMG, Tanks +15% RES, Healers +10% RES, Supports +15% Effect Hit.
  - **Gear:** the new bonus stats Crit Rate, Crit DMG, Effect Hit and Effect RES. They roll on drops and upgrades, and can be reforged into.
  - **Passives:** the "Crit / effect stat" rule.
- **Debuff chance:** base chance (100% if the spell has none) × (1 + caster's Effect Hit) × (1 − target's Effect RES). Buffs and allies' statuses are never resisted.
- **Spell scaling:** damage, heals and shields can scale with **ATK** (default), **DEF**, the caster's **max HP**, or **ATK × SPD/100**. (SPD doesn't grow with level, so it boosts ATK instead.) Set it per effect in **Admin → Spells** ("× N of ...").
- **New stat-scaling spells:**
  - DEF-scaled shields and hits for the tanks Gaia, Pebble, Drip, Bramble (whose ultimate now also deals thorns damage), Sir Roland (Shield Bash) and Varek.
  - Max-HP heals for Mossy and Sister Celeste.
  - SPD-boosted strikes for Zephyr and Gusty.
  - Numbers were converted to keep their power about the same. Content upgrade v14 updates only spells still on their old defaults.
- **Older battles:** setups saved before combat stats existed replay exactly as before (fixed crits, no resistance).

## Combat rules

- **Turn order:** speed-based. Each unit has an action gauge, and the unit closest to zero acts next. The strip above the battlefield shows the predicted order.
- **Actions:** every hero has a basic attack, a skill with a cooldown, and an ultimate powered by energy. Skills can deal damage, heal, shield, apply buffs and debuffs (Burn, Stun, ATK/DEF/SPD Up, DEF Down, Taunt), or move allies' turns forward.
- **Elements:** they form a cycle (Flame → Frost → Gale → Stone → Volt → Tide → Flame). Hitting the element you beat does +30% damage; hitting the one that beats you does -20%.
- **Passives:** every hero, and a few enemies and bosses, has an always-on passive. Its rules can be:
  - stat bonuses (+% HP/ATK/DEF/SPD, also shown in the Roster stats)
  - extra crit chance
  - bonus damage against targets with a status, or while the unit is below an HP threshold
  - effects triggered at battle start, at the start of the unit's turn, when hit (the attacker is the target), or after a kill, each with an optional chance

  Triggers can also grant ultimate energy or heal the most injured ally. Effects from passives never set off further "when hit" triggers, so retaliation can't loop. Edit passives in **Admin → Units/Enemies → Passive**.
- **Progression:** spend gold to level heroes (up to 60, with ascension). Duplicate pulls raise a hero's constellation (up to C6, +6% stats each), and extra copies past that turn into stardust.
