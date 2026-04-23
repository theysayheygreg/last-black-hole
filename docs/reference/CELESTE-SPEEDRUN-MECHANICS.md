# Research Digest: Celeste Speedrun Mechanics

> **Video:** [The Insanity of Celeste Speedruns Explained](https://www.youtube.com/watch?v=d4CxmxGf05s)  
> **Topic:** High-skill movement, momentum conservation, and physics exploitation.

---

## 1. Core Mechanics: The "Feel" of Movement

Celeste is built on a foundation of tight, responsive controls that prioritize "forgiveness" for the player while allowing for extreme skill expression.

*   **Dash Variants:** 
    *   **Super Dash:** Horizontal dash + jump. High vertical, moderate speed.
    *   **Hyper Dash:** Down-diagonal dash + jump. Low vertical, massive horizontal speed.
    *   **Wave Dash:** Hyper dash initiated from the air. The "staple" for maintaining high velocity.
*   **Momentum Conservation:** The game allows players to "extend" these dashes. If you jump ~10 frames after starting a dash, you keep the momentum but **regain your dash charge** mid-air. This allows for infinite chaining of speed.
*   **Forgiveness Mechanics:** 
    *   **Coyote Time:** A 5-frame window to jump after leaving a ledge.
    *   **Jump Buffering:** Allowing a jump input up to 4 frames before touching the ground.

### Translation to Last Singularity
- **Surfing "Extensions":** Just as Celeste has extended hypers, our "surfing" should have a mechanic for "perfect timing" when leaving a gravity wave to maintain velocity without burning fuel (or signal).
- **Forgiveness:** In a fluid sim, precision can be hard. Implementing "velocity buffering" (aligning ship orientation just before hitting a wave) could make the controls feel "smarter" than raw physics.

---

## 2. Advanced Techniques: Exploiting Physics

Speedrunners use frame-perfect tricks to multiply their speed far beyond what the developers originally intended (though many were later embraced as features).

*   **Ultra Dash:** Dashing down-diagonally while already moving at high speed. If you hit the ground after the dash ends, you get a **1.2x speed multiplier**. These can be chained for exponential speed.
*   **Corner Boosting:** Jumping off the very top edge of a wall to maintain horizontal speed while gaining height. Literally "kicking" off the geometry.
*   **Demo Dash (Crouch Dash):** Dashing with a smaller hitbox to pass through obstacles (spikes/dust bunnies) that would normally kill the player.

### Translation to Last Singularity
- **The "Slingshot" (Ultra Equivalent):** Catching a second gravity well while already moving at high velocity from a previous one should provide a multiplicative speed boost, not just additive.
- **Wreck "Kicking":** Allowing the ship to "bounce" or "kick" off civilization wrecks to change direction without losing momentum. This turns obstacles into movement tools.

---

## 3. The "Flow State" & Skill Ceiling

The video emphasizes that top-level speedrunning is about **routing** and **rhythm**.

*   **Rhythm-Based Movement:** Speedrunners don't react; they perform a rehearsed sequence of frame-perfect inputs. The movement becomes a "dance."
*   **Visual/Audio Cues:** Madeline's hair color changes to indicate dash availability. The sound of a successful wave dash provides immediate feedback.

### Translation to Last Singularity
- **Visual Feedback for Flow:** As the player maintains "surfing flow," the ASCII rendering could become "sharper" or shift color (e.g., from teal to bright cyan) to indicate they are in a high-efficiency movement state.
- **Audio Feedback:** The ambient drone should hum in a specific harmonic when the player is perfectly aligned with a gravity wave.

---

## 4. Physics and Level Design

Celeste's levels are designed to be "solved" with these mechanics. 

*   **The World as a Tool:** Every wall, bubble, and moving block is a potential momentum source.
*   **Risk/Reward:** High-speed routes are more dangerous but faster.

### Translation to Last Singularity
- **The Universe as a Clock:** The "dying universe" (black hole growth, portal evaporation) is the ultimate pressure. High-skill movement isn't just for style; it's necessary to reach the last loot and get to the final portal before collapse.
- **Scavenger AI:** Scavengers should use basic versions of these "surfing" tricks, but a high-skill player should be able to "out-surf" them to reach wrecks first.

---

## Summary for Agents

When tuning the **Layer 0 "Feel"**, refer to this digest. The goal isn't just "realistic fluid physics"; it's **momentum-based gameplay** that is easy to learn (drift with the current) but has a massive skill ceiling (chaining gravity boosts, wreck kicking, and perfect wave alignment).
