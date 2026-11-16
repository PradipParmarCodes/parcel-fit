# Parcel Fit

Parcel Fit is a cozy truck-packing game. Turn and load cardboard parcels, send the truck on its way, and collect ten illustrated postcards. All 60 puzzles are free.

## Play

Open `play/index.html` in a desktop browser. The offline edition includes the whole game and can be copied to another computer. A hosted copy is preferable on phones. Saves are stored by the browser, so use the same browser and game location to continue.

- **Drag** a parcel or tap a parcel and then tap where its printed letter should go.
- **Rotate** changes its orientation, **Tray** takes it out of the truck, and **Undo** restores the last move or reset.
- **Hint** places a box. You have three hints per delivery; when a delivery is blocked, a hint makes room by returning as few boxes as possible. Undo restores the previous layout.
- On the board, press **1–6** to select a parcel, **arrow keys** to move its cursor, **Enter** to place it, and **R** to rotate.
- From **Home**, open **Delivery map** to explore the road through ten villages, or open **Levels** to filter deliveries by difficulty or route. Finish each delivery to unlock the next one, and replay completed deliveries anytime.
- Choose **Next delivery** after a win to watch the truck drive to your next stop. Use **Skip drive** to start packing right away.
- Visit **Achievements** and **Postcards** from Home to see what you have earned. Every six deliveries earn a postcard.
- Earn **3 stars** for a clean solve, **2 stars** after a few recoverable mistakes, and **1 star** after using a Hint or making a heavily assisted attempt. Your best rating is saved per level and can be improved by replaying.
- In **Settings**, turn the original instrumental music and sound effects on or off and adjust their volumes separately.

The first two levels introduce placement and rotation. The remaining difficulty order estimates how restrictive the puzzle is from its legal first moves, parcel count, cargo size, and fixed blocks. It can be adjusted after player testing. The order is stored separately from the original save indexes, so 5-, 15-, and 30-level saves migrate when the game is served from the same origin.

## Edit or host

Use Node.js and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite prints the local URL for development. Deploy the contents of `dist/` to a static host. Run `npm run build:offline` to generate a single self-contained `dist/offline.html`.

For ad testing, run the game locally and add `?ads=test` to the URL. Parcel Fit then uses a clearly labeled mock ad between eligible deliveries and for the bonus-hint flow; normal local sessions stay interruption-free. Use `?ads=off` to disable ads. The ad wrapper lives in `src/ads.ts`; production stays disabled until a host page provides a real `adBreak()` implementation. Real interstitials wait through the first two new deliveries, then use a three-delivery cadence and a 90-second cooldown; replays and the final celebration are never interrupted.

The project checks cover all solutions, hints, per-level saves and ratings, sound, reduced-motion feedback, postcard milestones, difficulty ordering, and canvas actions across desktop and phone-sized viewports.
