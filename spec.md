# Galactic Empires — Prototype Specification

## Product goal

Galactic Empires is a real-time browser strategy game about expanding from one homeworld into a contested star system. Most play happens on the space map; planets open focused economy, production, and ground-battle views.

## Core loop

1. A new campaign opens on a setup screen. The player chooses a Compact (7 worlds), Standard (11 worlds), or Expansive (15 worlds) galaxy and selects Cadet, Commander, or Admiral enemy difficulty. Difficulty changes hostile construction cadence, attack frequency, combat strength, and escort size in single-player. The campaign can instead launch as a two-player competitive match from a lobby with a six-character code.
2. The player and hostile AI each begin on exactly one colonized planet with equal stockpiles, one Metal Mine, one Crystal Extractor, one Gold Mine, a Ground Factory, and a Space Yard. Neither faction starts with ground units or ships; both must produce their first forces. Every unclaimed planet begins with a deterministic garrison of one or two neutral ground units.
3. Mines add Metal, Crystal, and Gold to a shared imperial stockpile indefinitely. Base collection runs at four times the prototype's original rate so the opening economy reaches useful decisions quickly. Planets differ by their mine limits and output modifiers, but resources never deplete.
4. The player spends resources on additional buildings, units, ships, and research. The hostile empire runs its own independent economy and uses the same production limits to reinforce its worlds. While neutral worlds remain, its transport missions follow a two-expansions-to-one-invasion cadence, choose the nearest reachable target of the preferred type, and fall back to the other mission type when necessary.
5. Every planet is surrounded by a 600-pixel-radius gravity well on a 12800 × 8800 tactical canvas. The well is click-through for maneuver orders, while the planet center remains a docking target. Ships have persistent, non-overlapping orbit positions and can be drag-box selected, Shift-selected, and moved as formations within the well. Clicking empty space outside the selected fleet's current well clears ship selection. Orbital movement and landing approaches are deliberately slow and occur visibly over time rather than teleporting to the destination.
6. Moving the pointer near any edge of the galaxy viewport continuously pans the camera in that direction. Scrollbars are hidden so navigation is handled directly on the map. Dedicated zoom-out, zoom-in, and 1:1 controls are always visible; the mouse wheel zooms around the pointer from 25% to 150%. Claimed planets use redundant ownership cues: cyan solid rings and YOU badges for the player, magenta double rings and ENEMY badges for opponents, plus a counted faction legend.
7. Nearby gravity wells are joined by long, thin phase lanes. Selecting a fleet reveals visible JUMP gates just beyond its gravity-well line on every outbound lane. Clicking a gate or any reachable destination automatically plots the connected route. Ships first move slowly from their current orbit to the outbound system border, hold there for a two-second gate charge, then travel through the phase tunnel faster than the previous lane speed. Multi-lane routes repeat the slow cross-system exit and gate charge at every intermediate waypoint before arriving at the outer edge of the destination gravity well.
8. Moving a Transport onto the planet center docks it and automatically embarks up to four available squads. A loaded Transport emerging from a phase lane must cross the gravity well on a visible landing approach before unloading at the planet. Player landing craft remain selectable throughout the approach. After unloading, the Transport stays docked at the planet center instead of snapping back into orbit. Defending ships and orbital weapons prioritize landing craft during this interception window; destroying the transport also destroys its embarked army. Landing on an unclaimed planet starts a real-time battle against any neutral garrison; the planet is colonized only after that resistance is defeated. Landing on an enemy planet follows the same ground-battle rules.
9. Victory adds the planet to the empire. Defeat destroys the invading force.

## Resources

- Metal, Crystal, and Gold are global stockpiles.
- Resources on every planet are unlimited and never run dry.
- Each planet has a different maximum number of Metal Mines, Crystal Extractors, and Gold Mines, plus limits for its other structures.
- Metal Mine costs Crystal + Gold.
- Crystal Extractor costs Metal + Gold.
- Gold Mine costs Metal + Crystal.
- Buildings have no tiers or upgrades. The player constructs additional copies until the planet-specific maximum is reached, shown as `built / maximum`.

## Multiplayer

- Multiplayer is competitive: the host controls the first empire and the joining commander controls the opposing empire.
- Starting multiplayer opens a lobby with a case-insensitive six-character code. Join Game appears immediately below Start Multiplayer and accepts that code.
- The lobby holds exactly two commanders. Only the host can start, and launch remains disabled until the rival has joined.
- Both empires begin with equal resources, structures, production capabilities, unit statistics, and collection rates. Multiplayer ignores AI difficulty bonuses and disables the strategic AI.
- The host owns the deterministic simulation clock and validates both sides' commands. The rival sends build, research, fleet, maneuver, and targeting orders to the host, then receives the authoritative state from their own empire's perspective.
- Browser peers connect through WebRTC. The lobby exists only while the host remains online; no account or cloud save is required.

## Buildings

- Metal Mine, Crystal Extractor, Gold Mine
- Ground Factory and Advanced Ground Factory
- Space Yard and Advanced Space Yard
- Ground Defenses, Anti-Space Battery, Space Defenses
- Research Lab

Advanced factory types are gated by research, but individual buildings never have tiers.
Every Space Defense is represented by a distinct armed orbital platform inside its planet's gravity well. Platforms use the owning faction's color and automatically damage hostile ships in that well.
Every Ground Defense deploys one stationary, long-range Defense Turret whenever its planet is invaded, even if no mobile ground troops are present. Turrets are visible and targetable on the ground battlefield. A destroyed turret removes its corresponding Ground Defense building; surviving installations remain ready for later invasions.

## Units and production

The Ground Factory produces Infantry, Anti-Vehicle Infantry, Light Recon Vehicles, Light Tanks, and Light Artillery. Advanced Ground Factories produce shielded Shock Troopers after Ground Warfare and add Railgun Tanks, Plasma Tanks, and long-range Siege Walkers after Heavy Armor. The Space Yard produces Transports, Escort Frigates, Missile Frigates, and researched Light Cruisers. Advanced Space Yards add Phase Destroyers after Orbital Engineering, eight-squad Assault Carriers after Carrier Operations, Battlecruisers after Capital Ship Doctrine, and the Titan Dreadnought after Titan Engineering.

Advanced units require both their listed research project and the matching advanced factory. Standard and advanced factories still contribute together to local production speed; advanced hull orders must specifically target Advanced Space Yards.

Production uses real-time queues. Every standard or advanced Ground Factory on a planet adds another 1× of ground-production speed, immediately accelerating the active queue. Completed ground units deploy to the planet; completed ships deploy into distinct orbital slots instead of stacking at the planet center.

Every standard or advanced Space Yard appears as its own selectable station in the planet's gravity well and owns an independent production queue. Normal hull orders automatically rotate across all compatible yards: the first order goes to Yard 1, the second to Yard 2, and so on before wrapping back to the shortest queue. Clicking a yard inspects it without disabling automatic distribution. Shift-clicking two or more yards creates an explicit group; in that mode, one separately paid ship is added to every grouped yard. Advanced hulls auto-route only among Advanced Space Yards. Legacy planet-level ship queues are migrated into yard queues when a local save loads.

## Enemy AI

- The hostile empire has a separate Metal, Crystal, and Gold stockpile and earns unlimited income from mines on enemy worlds.
- Starting from one world and no units, enemy governors spend the same starting stockpile on mines, factories, research labs, advanced factories, defensive bases, and production queues under the normal costs, research gates, and planet limits.
- Enemy factories maintain ground and ship queues, unlock advanced technology over time, and produce stronger late-game forces when they can afford them.
- Once a carrier and landing force are ready, the AI selects a reachable player colony, sends escorts over the phase-lane network, automatically lands troops, and can capture that planet through the same real-time ground-combat rules.
- Campaign difficulty controls enemy construction cadence, attack frequency, escort size, and combat strength rather than granting extra starting worlds or units.

## Combat and recovery

- Ground battles run in real time on a scrollable 2600 × 1600 spatial planetary battlefield. The oversized tactical zone provides wide deployment areas and room for formations to close over distance. The player opens a contested planet from the galaxy map and exits with the white back arrow in the upper-left.
- Every ground unit has a battlefield position, movement speed, weapon range, damage value, HP, and shields. Units advance toward their target, stop at effective range, and fire only while the target is inside that range. Artillery holds and fires from farther away than infantry or armor.
- Weapon ranges are visible around units and active fire is drawn between attacker and target. The player can select an enemy to focus allied targeting.
- Space encounters resolve in real time on the galaxy map when hostile ships share an orbit. Escort Frigates and other armed ships automatically attack hostile ships, with visible weapon traces matching their current target. Orbital Defense platforms have persistent hull and shields, visibly fire on hostile ships, receive return fire, and are removed when destroyed. When player ships are present, an enemy platform can be clicked to mark it as the priority target.
- After a ground battle, surviving ground units restore all HP and shields.
- Space units restore shields anywhere. They restore hull HP only while orbiting a friendly planet.
- All ship weapons, Orbital Defenses, and Anti-Space Batteries deal 4× orbital-combat damage. A lone Escort Frigate can destroy a full-health Transport during its complete landing approach despite normal shield regeneration.

## Research

Research is an empire-level top navigation tab rather than a planet-panel section. It requires a Research Lab and is purchased with resources. The visual four-tier tree begins with Advanced Industry, then branches into Ground Warfare, Fleet Logistics, Orbital Engineering, and Quantum Extraction. Ground Warfare leads to Heavy Armor; Fleet Logistics leads to Carrier Operations; Orbital Engineering leads through Capital Ship Doctrine to Titan Engineering. Quantum Extraction permanently increases all player mine income by 25 percent. Every node visibly lists what it unlocks, and larger late-game construction must be researched first.

## Prototype acceptance criteria

- Interactive map and planet selection.
- Symmetric one-world, zero-unit starts for player and AI.
- Pre-campaign map-size and enemy-difficulty selection with persistent configuration and materially different generated campaigns.
- Code-based two-player competitive lobby with separate empires, a host-controlled launch, and synchronized authoritative simulation.
- Unlimited planet economy with local mine-count limits and output modifiers.
- Quantity-based construction with per-planet maxima, costs, and research gates.
- Ground and space production queues.
- Visible, selectable and groupable orbital Space Yards with independent production queues, plus quantity-based Ground Factory production speed.
- Automatic round-robin hull distribution across compatible Space Yards, with grouped multi-build as an explicit override.
- Non-instant gravity-well maneuvering, shortest-path multi-lane travel, automatic Transport embarkation, unloading, colonization, and hostile invasion.
- Expanded 600-pixel gravity wells and empty-space deselection outside the active well.
- Four-times-larger galaxy canvas with long thin lanes, hidden scrollbars, continuous four-edge camera panning, and 25%–150% map zoom.
- Produced and docked ships receive distinct persistent orbit positions. Phase arrivals emerge in formation at the system edge, then visibly maneuver inward; loaded transports expose a defendable landing-approach window before troops deploy.
- Oversized, scrollable 2600 × 1600 real-time ground battlefield with movement, weapon ranges, target lines, focus fire, functional Ground Defense turrets, and an upper-left white exit arrow.
- Automated space combat and correct recovery rules.
- Research- and advanced-factory-gated Shock Troopers, Railgun Tanks, Plasma Tanks, Siege Walkers, Phase Destroyers, Assault Carriers, Battlecruisers, and Titan Dreadnoughts.
- A deterministic enemy economy that builds bases and units, launches invasion fleets, and can capture player colonies.
- Separate empire-level research tab with a visible prerequisite technology tree.
- Local save/reset controls.
- Automated tests covering the rules above.

## Out of scope for this prototype

Accounts, matchmaking, dedicated relay hosting, reconnecting to an abandoned lobby, team multiplayer, a full long-horizon AI strategic planner, campaign narrative, final art/audio, and extensive balance tuning are deferred.
