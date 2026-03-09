# Car Racing Game

## Current State
New project with default Motoko backend and React frontend template. No game logic exists yet.

## Requested Changes (Diff)

### Add
- Top-down 3D car racing game using React Three Fiber
- Player car controlled by arrow keys or WASD
- Infinite scrolling road/track with lane markings
- Obstacle cars in different lanes spawning and approaching the player
- Speed increases progressively over time
- Score counter based on distance traveled
- Game over screen with final score and restart button
- High score persistence stored in Motoko backend
- Colorful visual design: player car, NPC obstacle cars, road, environment (grass/sidewalk)
- Start screen with game title and play button

### Modify
- Default backend: add `saveHighScore` and `getHighScore` query/update methods

### Remove
- Default counter example from template

## Implementation Plan
1. Backend: Add high score storage (save/get) in Motoko
2. Frontend:
   - Game canvas using React Three Fiber with perspective camera angled top-down
   - Road mesh: infinite scrolling via tiling technique (move road segments)
   - Player car: 3D colored box-car shape, WASD/arrow key controls for left/right lane changes
   - NPC obstacle cars: spawn at top, move toward player, different colors/lanes
   - Collision detection: AABB check between player and NPCs
   - Speed system: starts slow, accelerates over time
   - Score: increments based on elapsed time/distance
   - UI overlay: score display, speed indicator
   - Start screen: title, instructions, play button
   - Game over screen: final score, high score, restart button
   - High score fetch/save on game over via backend
