# Gear Image Fixes (TODO - next conversation)

## Status
Committed current work on `v3-landing-page` branch at `f1bcb99`. Docker image saved.
The landing page sections all work (heatmap, fitness, trophies, gear) but two shoe images need replacing.

## Fixes Needed

### 1. On Cloudsurfer Next — wrong colorway
- **Current:** Stone/Marsh (gray) — `cloudsurfer-next.png`
- **Correct:** Glacier | White — variant ID `#7615537105260`
- Try: `https://www.on.com/en-us/products/cloudsurfer-next-3me3002` and find the Glacier/White variant
- Need transparent PNG, same side-profile style

### 2. New Balance FuelCell Rebel v5 — wrong color variant
- **Current:** Red/Black (Urgent Red, SKU MFCXLA5) — `fuelcell-rebel-v5.png`
- **Correct:** Red/White version (the one with white upper, red midsole accents — as shown in user's reference screenshot)
- The user's photo shows: white upper, black N logo, coral/red midsole swoosh, white outsole
- Try NB scene7 CDN: `https://nb.scene7.com/is/image/NB/{sku}_nb_02_i?fmt=png-alpha&wid=1200&hei=1200`
- May need to find the correct SKU for the white/red colorway

### 3. All images should be transparent PNGs, similar dimensions
- Cloudsurfer Next PNG from on.com ctfassets CDN was ~8.8MB (good quality, transparent bg)
- Target similar quality for all three

## Files to update
- `frontend/public/gear/cloudsurfer-next.png` — replace with Glacier/White
- `frontend/public/gear/fuelcell-rebel-v5.png` — replace with red/white version
- `frontend/public/gear/cloudmonster-max.png` — this one is correct (Cloudsurfer Max Asphalt/Ice)
- `frontend/src/components/LandingGear.tsx` — no code changes needed unless names change

## Component location
- `frontend/src/components/LandingGear.tsx` — gear showcase section
- `frontend/src/components/LandingTrophies.tsx` — PR medals section
- `frontend/src/components/LandingHeatmap.tsx` — scroll-driven heatmap
- `frontend/src/components/LandingFitness.tsx` — scroll-driven fitness chart
- `frontend/src/views/LandingView.tsx` — landing page layout (order: Hero → Marquee → Heatmap → Fitness → Trophies → Gear → Activities)

## Docker
- Rebuild after fixing: `docker build -t stravviz .`
- Run with: `docker run -d --name stravviz -p 8080:8080 -v "$(pwd)/data:/data" --env-file .env -e DATABASE_URL=sqlite:////data/stravviz.db stravviz`
- Save: `docker save stravviz -o stravviz.tar`
