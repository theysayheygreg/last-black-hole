# Master Reference: Gameplay Affordances & Forgiveness Mechanics

> **"The invisible hands that bridge the gap between player intent and technical execution."**
> This document serves as a deep-dive into the mechanics that make games feel "responsive," "fair," and "fluid." It includes tuning parameters, implementation logic, and case studies from industry-leading titles.

---

## 1. Input & Timing Forgiveness (The "Feel" Layer)

These mechanics compensate for the "friction" of digital controls and human reaction latency.

### 1.1 Coyote Time (Grace Period)
*   **The Problem:** Players often press the jump button exactly as they visually leave a ledge, but the engine has already flagged them as "falling," leading to a "dropped" jump.
*   **The Fix:** A brief window (usually **5–10 frames** at 60fps) where a jump is still valid after leaving a platform.
*   **Tuning:** 
    *   *Standard:* 0.08s - 0.15s (5-9 frames).
    *   *Case Study:* **Celeste** uses exactly 5 frames. If the window is >15 frames, players may notice they are jumping on thin air.
*   **Implementation:** A `float lastGroundedTime` timer that resets when the player touches the floor. Jump is allowed if `currentTime - lastGroundedTime < coyoteWindow`.

### 1.2 Input / Jump Buffering
*   **The Problem:** Pressing a button slightly before a character is ready (e.g., mid-air or mid-animation) causes the input to be ignored.
*   **The Fix:** Storing (buffering) the input for a short window and executing it the first frame it becomes valid.
*   **Tuning:**
    *   *Standard:* 0.1s - 0.2s (6-12 frames).
    *   *Fighting Games:* **Street Fighter 6** uses a 4-5 frame link buffer to make combos more accessible.

### 1.3 Action Queuing (Input Buffering+)
*   **Case Study: Dark Souls / Elden Ring:** Known for an aggressive buffer (10–15 frames).
*   **Priority System:** Not all inputs are equal. **Attacks > Rolls/Parries > Items**.
*   **The "Phantom Roll":** A common side effect where a player is hit during hitstun, but because the roll was buffered, they roll automatically *after* the hitstun ends.

---

## 2. Navigation & Traversal (The "Flow" Layer)

Mechanics that ensure high-speed movement feels like a "dance" rather than a struggle with physics.

### 2.1 Ledge & Rail Magnetism
*   **The Problem:** In fast-paced traversal, a player may miss a handhold or rail by a few pixels, causing a "miss" and killing momentum.
*   **The Fix:** 
    *   **Search Cones:** The game casts a cone or "ring" around the player's movement vector. If a valid target (ledge/rail) is found within the cone, the character's velocity is subtly altered to "hit" it.
    *   **Snap-to-Ledge:** A **0.5m buffer** around ledges. If the character's hand-hitbox enters this radius, it snaps to the fixed ledge position.
*   **Case Studies:**
    *   **Skate (series):** Uses "Grind Assist" to pull the board onto rails. Even at "Zero Assist," subtle magnetism remains to prevent physics glitches.
    *   **Assassin's Creed:** Uses a "Search Cone" (30–45 degrees) to find the next jump target. Magnetism is stronger when the player is providing directional analog input.

### 2.2 Parkour "Safe Jump" Logic
*   **The Problem:** Players accidentally jumping off high buildings to their death when they intended to just stand at the edge.
*   **The Fix:** Contextual input.
    *   **Split Controls:** Holding "Parkour Up" prioritizes high targets; "Parkour Down" prioritizes safe descent.
    *   **Lethal Height Check:** The game disables the "auto-jump" if the drop would be lethal, requiring a manual button press to override the safety.
*   **Affordance:** **Visual Signifiers** (e.g., white scratches on walls, bird droppings on ledges) act as "Runner Vision" to guide the player's eye toward valid paths.

### 2.3 Corner Correction (The "Wiggle")
*   **The Fix:** 
    *   **Jump Correction:** If the player's head hits a corner, shift them **2–5 pixels** horizontally to clear it.
    *   **Dash Correction:** If a horizontal dash hits a ledge, pop the player **4 pixels** upward to land them on top.
*   **Case Study: Celeste:** Uses these pixel-offsets to make the movement feel "buttery."

---

## 3. Combat & Stealth Leniency (The "Fairness" Layer)

Mechanics that manage the "danger" level to keep the player in the "heroic" zone.

### 3.1 Detection Grace Periods
*   **The Problem:** Getting spotted instantly by a guard feels "unfair" or frustrating.
*   **The Fix:**
    *   **Awareness Filling:** Detection isn't binary. A "meter" (bolts, arcs, or sound) fills up based on distance and lighting.
    *   **Reflex Mode (MGSV):** When spotted, time slows down for ~3 seconds, giving the player a chance to neutralize the threat before the alert goes out.
    *   **Vertical Blindness:** AI in stealth games (e.g., *Dishonored*) often have a limited vertical FOV, allowing "safe" traversal on rooftops.

### 3.2 Health Gating & Last Stand
*   **The Fix:** The final 1–5% of the health bar is significantly more durable (Sliver of Health).
*   **The "First Shot Miss" Rule:** In games like *BioShock*, the first bullet an enemy fires in a new encounter is programmed to miss, acting as an audio-visual warning.

---

## 4. Vehicle & Racing Assist (The "Stability" Layer)

Translating binary stick inputs into nuanced physics.

### 4.1 Steering Filters (Normal vs. Simulation)
*   **Normal Steering:** Adds **damping** and **speed sensitivity**. If you flick the stick, the game slows the wheel movement to prevent an immediate spin. It automatically limits wheel "lock" at high speeds.
*   **Counter-Steer Assist:** Subtly helps the player "catch" a slide by damping the counter-steer motion, preventing "snap oversteer."
*   **Smart Steering (Mario Kart):** An "invisible nudge" that keeps the kart on the track by correcting steering when the player gets too close to a boundary.

---

## 5. Summary Tuning & Affordances Table

| Category | Mechanic | Tuning Window | Key Affordance (Cue) |
| :--- | :--- | :--- | :--- |
| **Platforming** | Coyote Time | 5 – 10 Frames | Character hair/cloak color change |
| **Parkour** | Ledge Magnetism | 0.5m Radius | White "scratches" or highlights |
| **Skating** | Grind Assist | High/Low Magnetism | Board "snaps" or sparks on contact |
| **Stealth** | Grace Period | 0.5s – 3.0s | "!" Sound or White Flash |
| **Racing** | Smart Steering | Active Correction | Yellow Antenna / Flashing icon |
| **Combat** | Health Gating | Last 1% - 5% | Screen red-flash / heartbeat sound |
| **Combat** | First Shot Miss | 1st Enemy Bullet | Near-miss "whiz" sound / spark |

---

## Final Takeaway for Last Black Hole
When implementing the **"Surfing" physics (Layer 0)**, don't rely on raw fluid dynamics.
1.  **Affordance:** Use **Color Temperature** (e.g., teal current = fast, deep blue = sluggish) and **ASCII Weight** (dense `@` = high force) to guide the player's path.
2.  **Magnetism:** If the player's ship is within a "Magnetic Radius" of a wave's center, subtly pull their trajectory into the "tube."
3.  **Buffer:** Allow the "Thrust" input to buffer for ~5 frames during a high-G turn, ensuring the ship accelerates exactly when the turn finishes.
