# Galactic Empires — Prototype Specification

## Product goal

Galactic Empires is a real-time browser strategy game about expanding from one homeworld into a contested star system. Most play happens on the space map; planets open focused economy, production, and ground-battle views.

## Core loop

1. A new campaign opens on a setup screen. The player chooses the Human Coalition, Brood, Aegis Directorate, or Iron Covenant; a Compact (7 worlds), Standard (11 worlds), Expansive (15 worlds), or Colossal (21 worlds) galaxy; and Cadet, Commander, or Admiral enemy difficulty. Difficulty changes AI construction cadence, attack frequency, combat strength, and escort size. The campaign can instead launch as a two-to-four-empire competitive match from a lobby with a six-character code.
2. The player and hostile AI each begin on exactly one colonized planet with no ground units or ships, so every empire must produce its first forces. Mineral economies begin with Metal, Crystal, and Gold plus one of each mine, a Ground Factory, and a Space Yard. The Brood instead begins with Biomass, a Ground Factory, and a Space Yard because its worlds grow resources without mines. Every unclaimed planet begins with a deterministic garrison of one or two neutral ground units.
3. Mines add Metal, Crystal, and Gold to a shared imperial stockpile indefinitely. Base collection runs at four times the prototype's original rate so the opening economy reaches useful decisions quickly. The Brood gains four Biomass per second from every controlled planet and recovers additional Biomass from destroyed forces in ground or orbital battles in which it participates. Planets and resources never deplete.
4. The player spends resources on additional buildings, units, ships, and research. Ground Factories, Advanced Ground Factories, Space Yards, and Advanced Space Yards have no per-planet construction limit; all other structures retain their planetary maxima. The hostile empire runs its own independent economy under the same construction rules. While neutral worlds remain, its transport missions follow a two-expansions-to-one-invasion cadence, choose the nearest reachable target of the preferred type, and fall back to the other mission type when necessary. Combat fleets operate independently of transports: rear colonies retain a difficulty-scaled defensive reserve and deploy their surplus warships to threatened colonies, active invasion targets, or hostile systems.
5. Every planet is surrounded by a 600-pixel-radius gravity well on a 12800 × 8800 tactical canvas. Ship centers are capped at a 528-pixel radius and crowded fleets fill bounded concentric orbit rings, keeping even large formations visibly inside the system. Ship artwork remains large while its central interaction hitbox is only 32 pixels, allowing dense fleets to overlap visually without blocking nearby orders. The well is click-through for maneuver orders, while the planet center remains a docking target. Ships have persistent orbit positions and can be drag-box selected, Shift-selected, and moved as formations within the well. Valid live coordinates inside the boundary are never rewritten by overlap detection: dense formations may temporarily overlap or cross paths without any ship being teleported into an automatic orbit slot near the planet. Selecting one or more player ships opens a compact fleet HUD with one ship glyph per unit and separate, unlabeled hull and shield bars directly beneath every glyph. Clicking a hostile ship, including one drawn in the large-fleet canvas layer or making a landing approach, opens a hostile inspection HUD with separate hull and shield bars but grants no movement authority. Left-click is reserved for selection and inspection; right-clicking an open point inside the fleet's current gravity well issues a maneuver order. Clicking empty space outside the selected fleet's current well clears ship selection. Orbital movement and landing approaches are deliberately slow and occur visibly over time rather than teleporting to the destination.
6. Holding W, A, S, or D continuously pans the galaxy camera up, left, down, or right, including diagonal movement when two keys are held. Scrollbars are hidden so navigation is handled directly on the map. Dedicated zoom-out, zoom-in, and 1:1 controls are always visible; the mouse wheel zooms around the pointer from 25% to 150%. Claimed planets use redundant ownership cues: their sphere tint, orbit ring, and badge immediately adopt the current owner's color, using cyan and YOU for the local commander with magenta, gold, and violet identities for rival empires plus a counted faction legend. Planet centers use 160-pixel interaction targets, orbiting ships use 32-pixel targets, and transports display a high-contrast 12-pixel cargo badge with a distinct full-hold state.
7. Nearby gravity wells are joined by long, thin phase lanes. Selecting a fleet reveals visible JUMP gates just beyond its gravity-well line on every outbound lane. Right-clicking a connected star system or its gate sends the fleet across that lane; right-clicking a system two or more lanes away automatically plots the shortest available route across the network. Ships first move slowly from their current orbit to the outbound system border, hold there for a two-second gate charge, then travel through the phase tunnel faster than the previous lane speed. Transit ships appear as unlabeled moving hulls on the galaxy map. During system exit and gate charging, player ships remain selectable and a local maneuver order cancels the jump at their exact current position; entering the phase tunnel commits the jump. Route phase and arrival timing remain available in the destination panel. Multi-lane routes repeat the slow cross-system exit and gate charge at every intermediate waypoint. At the final destination, ships stop at the outer edge with no automatic inward orbit; player ships are selectable immediately and can maneuver, dock, land, or jump onward without an arrival lock.
8. Moving a Transport onto the planet center begins a visible embarkation approach and automatically loads up to four available squads only after the ship reaches the planet. Embarking transports remain targetable and are prioritized by hostile orbital forces; if one is destroyed before loading completes, its waiting ground squads remain on the planet. A loaded Transport emerging from a phase lane must cross the gravity well on a visible landing approach before unloading at the planet. Player landing craft remain selectable throughout the approach. After unloading, the Transport stays docked at the planet center instead of snapping back into orbit. Defending ships and orbital weapons prioritize landing craft during this interception window; destroying the transport also destroys its embarked army. Landing on an unclaimed planet starts a real-time battle against any neutral garrison; the planet is colonized only after that resistance is defeated. Landing on an enemy planet follows the same ground-battle rules. Additional transports landing while that battle is active reinforce the matching side, so simultaneous armies join one engagement without being overwritten.
9. Victory adds the planet to the empire. Defeat destroys the invading force.

## Resources

- Metal, Crystal, and Gold are global stockpiles for the Human Coalition, Aegis Directorate, and Iron Covenant.
- The Brood replaces all three mineral stockpiles and costs with Biomass. It cannot construct mineral mines.
- Every Brood-controlled planet naturally produces 4 Biomass per second. Quantum Extraction increases that planetary output by 25 percent.
- After a battle casualty, every participating Brood empire recovers 35 percent of the destroyed units' converted Biomass value. Enemy and friendly ground units, friendly or hostile ships, and dead embarked cargo all count.
- Resources on every planet are unlimited and never run dry.
- Each planet has a different maximum number of Metal Mines, Crystal Extractors, and Gold Mines, plus limits for its defensive and support structures. Both Ground Factory types and both Space Yard types are unlimited.
- Metal Mine costs Crystal + Gold.
- Crystal Extractor costs Metal + Gold.
- Gold Mine costs Metal + Crystal.
- Buildings have no tiers or upgrades. Capped structures show `built / maximum`; Ground Factories and Space Yards show `built / ∞` and can always receive another construction order when their resource and research requirements are met.

## Playable factions

- The Human Coalition is the balanced combined-arms baseline with broad technology and no severe weakness.
- The Brood is the growth and swarm faction. Its first implemented faction mechanic is the complete Biomass economy; its dedicated living unit roster will replace the temporary baseline production roster in the next faction pass.
- The Aegis Directorate is the planned armored-advance faction, centered on heavy shields, defensive coordination, and siege formations. Its identity and campaign selection are persisted now; its Shield Monitor, Bastion Tank, Citadel Carrier, and supporting roster are the next production pass.
- The Iron Covenant is the planned mechanical-attrition faction, centered on repair systems, salvage, and modular machines. Its identity and campaign selection are persisted now; its Repair Drone, Salvage Frigate, Assembly Ark, and supporting roster are the next production pass.
- Faction identity is stored separately from map ownership, allowing any multiplayer command seat to carry its own civilization, economy, and future roster through perspective translation.

## Multiplayer

- Multiplayer is a two-to-four-player free-for-all. The host controls Empire 1 and each joining commander receives a separate Empire 2, 3, or 4 rather than sharing units, colonies, resources, production, research, or targeting orders.
- Starting multiplayer opens a lobby with a case-insensitive six-character code. Join Game appears immediately below Start Multiplayer and accepts that code.
- The lobby holds up to four empire slots. Only the host can start, and launch remains disabled until at least one rival human or AI empire has joined. The host can add or remove AI empire slots before launch; a disconnected human empire transfers to AI control so the remaining match can continue.
- Every empire begins on its own homeworld with its selected faction's starting economy and structures; empires using the same faction receive symmetric starts. Matches with three or four empires automatically use the Colossal 21-world frontier. Human-only slots disable strategic AI; configured AI slots use the chosen difficulty.
- The host owns the deterministic simulation clock and validates every empire's commands. Guests send build, research, fleet, maneuver, and targeting orders to the host, then each receives the authoritative state translated into their own empire's perspective.
- Browser peers connect through WebRTC. Authoritative snapshots use PeerJS binary serialization so large late-game states are automatically chunked, and full-state synchronization is capped at four updates per second to prevent channel-buffer overload. Player commands remain immediate. The lobby exists only while the host remains online; no account or cloud save is required.
- Multiplayer signaling has a finite connection timeout, authoritative snapshots are validated before installation, and the host can continue after an individual guest disconnects.

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

The Ground Factory produces Infantry, Anti-Vehicle Infantry, Light Recon Vehicles, Light Tanks, and Light Artillery. Advanced Ground Factories produce shielded Shock Troopers after Ground Warfare and add Railgun Tanks, Plasma Tanks, and long-range Siege Walkers after Heavy Armor. The Space Yard produces Transports, Escort Frigates, Missile Frigates, and researched Light Cruisers. Advanced Space Yards add Phase Destroyers after Orbital Engineering, eight-squad Assault Carriers after Carrier Operations, Battlecruisers after Capital Ship Doctrine, and the Titan Dreadnought after Titan Engineering. Every ship class uses its own top-down hull artwork in production, force lists, orbit, selection status, and phase transit; map scale increases visibly from transports through frigates, cruisers, carriers, battlecruisers, and dreadnoughts. Ship art has no circular marker background. Player-controlled ships use a square control frame that brightens when selected, while hostile ships remain unframed. Ships turn to face their current maneuver or route direction and retain their last heading when stationary. Every ground-force class, including deployed Defense Turrets, uses distinct top-down artwork in production, force lists, and tactical battles.

Advanced units require both their listed research project and the matching advanced factory. Standard and advanced factories still contribute together to local production speed; advanced hull orders must specifically target Advanced Space Yards.

Production uses real-time queues. Every standard or advanced Ground Factory on a planet adds another 1× of ground-production speed, immediately accelerating the active queue. Completed ground units deploy to the planet; completed ships deploy into distinct orbital slots instead of stacking at the planet center.

Every standard or advanced Space Yard appears as its own selectable station in the planet's gravity well and owns an independent production queue. Normal hull orders automatically rotate across all compatible yards: the first order goes to Yard 1, the second to Yard 2, and so on before wrapping back to the shortest queue. Clicking a yard inspects it without disabling automatic distribution. Shift-clicking two or more yards creates an explicit group; in that mode, one separately paid ship is added to every grouped yard. Advanced hulls auto-route only among Advanced Space Yards. Legacy planet-level ship queues are migrated into yard queues when a local save loads.

## Enemy AI

- The hostile empire has a separate Metal, Crystal, and Gold stockpile and earns unlimited income from mines on enemy worlds.
- Starting from one world and no units, enemy governors spend the same starting stockpile on mines, factories, research labs, advanced factories, defensive bases, and production queues under the normal costs, research gates, and planet limits.
- Enemy factories maintain ground and ship queues, unlock advanced technology over time, and produce stronger late-game forces when they can afford them.
- Once a carrier and landing force are ready, the AI selects a reachable player colony, sends escorts over the phase-lane network, automatically lands troops, and can capture that planet through the same real-time ground-combat rules.
- On every fleet-operation cycle, each eligible rear colony forms a transport-independent combat fleet from its surplus warships. These fleets reinforce friendly systems under orbital attack first, coordinate with active invasions next, and otherwise strike reachable hostile colonies. Each origin retains a defensive reserve; Cadet fleets are smaller and more conservative, while Admiral fleets launch earlier and at greater strength.
- Campaign difficulty controls enemy construction cadence, attack frequency, escort size, and combat strength rather than granting extra starting worlds or units.

## Combat and recovery

- Ground battles run in real time on a scrollable 2600 × 1600 spatial planetary battlefield. The oversized tactical zone provides wide deployment areas and room for formations to close over distance. The player opens a contested planet from the galaxy map and exits with the white back arrow in the upper-left.
- Every ground unit has a battlefield position, movement speed, HP, shields, and its own named weapon with a distinct range, damage, projectile count, reload interval, and visual effect. The player can click or Shift-click friendly mobile troops to select a formation, then right-click the battlefield to send it to a destination. Ordered units hold their assigned positions instead of resuming an automatic advance.
- Ground units automatically fire deterministic weapon salvos at any hostile already inside range, including while following a manual movement order. When a unit takes fire from outside its own range, it abandons its current waypoint, pursues the strongest attacker, and returns fire once that attacker is in range; a new manual order can cancel that pursuit. Weapon ranges are visible around units, selected troops and their destination lines are highlighted, and high-contrast, glow-backed weapon-specific projectile artwork connects attackers to targets at a readable tactical scale. The number of visible bolts matches each weapon's projectile count, while beam weapons stretch between attacker and target. The player can still select an enemy to focus allied targeting.
- Space encounters resolve in real time on the galaxy map when hostile ships share an orbit, but an attacker fires only while its target is inside that hull's weapon range. Every ship has a named, discrete weapon profile and reload cadence: Escort Frigates maintain frequent three-emitter laser fire, Missile Frigates launch one powerful missile only after a long reload, carriers deploy strike-drone volleys, and cruisers and capital ships use their own pulse, kinetic, railgun, or siege batteries. Ships do not automatically close distance, so positioning and gravity-well maneuver orders determine which weapons can engage; selected ships show their range ring. Missile Frigates outrange Escort Frigates, while capital hulls and installations have their own finite ranges. Visible weapon fire uses distinct transparent artwork for laser, missile, pulse, kinetic, artillery, railgun, plasma, siege, and drone effects. Projectile sprites render at a readable, high-contrast scale and sustained installation fire keeps cycling instead of disappearing after its first animation. Projectiles animate from attacker to target, lasers and siege weapons appear as continuous beams, and a Missile Frigate shows only one missile during its infrequent firing window. Those windows come from the same targeting and reload calculation as combat damage. Orbital Defense platforms have persistent hull and shields, visibly fire on hostile ships within range, receive in-range return fire, and are removed when destroyed. When player ships are present, an enemy platform can be clicked to mark it as the priority target.
- Large fleets remain fully simulated while their presentation uses a bounded rendering budget. Non-interactive hostile and transit hulls are drawn together on a viewport-sized canvas instead of creating one filtered DOM layer per ship, offscreen player markers are culled, and a rotating sample of at most 32 orbital salvos per system is visualized without dropping any combat damage. Peaceful single-faction systems bypass hostile-target searches, and local campaign autosaves are serialized at most once per second rather than on every simulation frame.
- After a ground battle, surviving ground units restore all HP and shields.
- Every ship continuously restores 5 shield points per second in friendly, hostile, or neutral orbit and throughout phase transit. Ships restore hull HP only while orbiting a friendly planet.
- Orbital Defense platforms continuously regenerate 16 shield points and 2 hull points per second, capped at their normal maximums. Platform shields therefore recover eight times faster than platform hull.
- Ship salvo damage, Orbital Defenses, and Anti-Space Batteries receive the 4× orbital-combat multiplier. A properly positioned Escort Frigate can destroy a full-health Transport during its complete landing approach despite normal shield regeneration.

## Research

Research is an empire-level top navigation tab rather than a planet-panel section. It requires a Research Lab and is purchased with the empire's faction resource. The visual four-tier tree begins with Advanced Industry, then branches into Ground Warfare, Fleet Logistics, Orbital Engineering, and Quantum Extraction. Ground Warfare leads to Heavy Armor; Fleet Logistics leads to Carrier Operations; Orbital Engineering leads through Capital Ship Doctrine to Titan Engineering. Quantum Extraction permanently increases mineral mine income or Brood planetary Biomass income by 25 percent. Every node visibly lists what it unlocks, and larger late-game construction must be researched first.

## Prototype acceptance criteria

- Interactive map and planet selection.
- Symmetric one-world, zero-unit starts for player and AI.
- Pre-campaign starter-faction, map-size, and enemy-difficulty selection with persistent configuration and materially different generated campaigns.
- Per-empire Human, Brood, Aegis, and Iron Covenant identities, with a functional Brood Biomass economy funded by controlled planets and friendly or hostile combat casualties.
- Code-based two-to-four-player competitive lobby with separate empires, optional AI slots, a host-controlled launch, and synchronized authoritative simulation.
- Unlimited planet economy with local mine-count limits and output modifiers.
- Quantity-based construction with per-planet maxima, costs, and research gates.
- Ground and space production queues.
- Visible, selectable and groupable orbital Space Yards with independent production queues, plus quantity-based Ground Factory production speed.
- Automatic round-robin hull distribution across compatible Space Yards, with grouped multi-build as an explicit override.
- Non-instant gravity-well maneuvering, shortest-path multi-lane travel, automatic Transport embarkation, unloading, colonization, and hostile invasion.
- Expanded 600-pixel gravity wells and empty-space deselection outside the active well.
- Four-times-larger galaxy canvas with long thin lanes, hidden scrollbars, continuous WASD camera panning, and 25%–150% map zoom.
- Produced and docked ships receive distinct persistent orbit positions. Phase arrivals emerge in formation and hold at the system edge under immediate player control; loaded transports still begin a defendable landing approach that can be redirected before troops deploy.
- Oversized, scrollable 2600 × 1600 real-time ground battlefield with click/Shift-click troop selection, right-click formation movement, automatic reload-based weapon salvos, weapon-specific animated projectile images, range rings, focus fire, functional Ground Defense turrets, and an upper-left white exit arrow.
- Automated space combat and correct recovery rules.
- Bounded large-fleet rendering that keeps every ship in the simulation while batching hostile and transit hulls, culling offscreen player markers, and limiting visual-only orbital salvos.
- Clickable hostile ships with separate hull and shield inspection bars, including canvas-batched fleets and landing approaches, without enabling player orders.
- Research- and advanced-factory-gated Shock Troopers, Railgun Tanks, Plasma Tanks, Siege Walkers, Phase Destroyers, Assault Carriers, Battlecruisers, and Titan Dreadnoughts.
- A deterministic enemy economy that builds bases and units, launches invasion and independent combat fleets, reinforces threatened systems, and can capture player colonies.
- Separate empire-level research tab with a visible prerequisite technology tree.
- Local save/reset controls.
- Automated tests covering the rules above.

## Out of scope for this prototype

Accounts, matchmaking, dedicated relay hosting, reclaiming an AI-controlled empire after disconnect, team multiplayer, a full long-horizon AI strategic planner, campaign narrative, final art/audio, and extensive balance tuning are deferred.
