---
name: image-asset
description: "Normalize, validate, and integrate image assets (logos, icons, shoe photos, brand images) into the StravaViz frontend. Use this skill whenever the user provides an image file to add to the project, asks about image dimensions or formats, wants to resize or crop images, needs to replace a shoe/gear image with the correct version, or mentions brand logos, gear photos, or visual assets. Also triggers for 'wrong image', 'fix the photo', 'replace with the right one', or 'the image looks off'."
---

# Image Asset Pipeline

Handle image assets for StravaViz — gear photos, brand logos, and UI images. This project has had recurring issues with wrong colorways, mismatched dimensions, missing transparency, and multi-commit fix cycles. This skill aims to get it right in one pass.

## Asset locations

| Type | Path | Naming convention |
|------|------|-------------------|
| Gear shoe photos | `frontend/public/gear/` | `<model-slug>.png` (e.g., `cloudmonster-2.png`) |
| Brand logos/icons | `frontend/public/brands/` | `<brand>-<type>.png` (e.g., `strava-logo.png`, `fitbod-icon.png`) |
| App logos | `frontend/public/` | `logo-text.png`, `logo-icon.png` |

## When the user provides an image

### 1. Validate before integrating

Before copying an image into the project, check it:

```bash
# Get dimensions, format, color space, alpha channel
sips -g all <path-to-image>
```

Check for:
- **Format**: Should be PNG for logos/icons (transparency needed), JPEG acceptable for photos
- **Dimensions**: Gear photos should be roughly square or landscape, max 800px wide. Brand logos vary but should be reasonable (not 3000x3000)
- **Transparency**: Brand logos and icons MUST have transparent backgrounds — if they don't, flag it
- **File size**: Anything over 500KB for a UI asset is worth optimizing

### 2. Resize if needed

Use `sips` (macOS built-in) for resizing:

```bash
# Resize to max 400px width, maintaining aspect ratio
sips --resampleWidth 400 <input> --out <output>

# Resize to max 400px on longest side
sips --resampleHeightWidthMax 400 <input> --out <output>
```

Target sizes:
- Gear photos: 400px wide max
- Brand logos in marquee: 120-200px wide max (they display small in the floating brands component)
- App logo: 200-300px wide

### 3. Copy to the right location

```bash
cp <source> frontend/public/<type>/<filename>.png
```

Use the naming conventions from the table above. Slugify model names: lowercase, hyphens instead of spaces (e.g., "FuelCell Rebel v5" -> `fuelcell-rebel-v5.png`).

### 4. Verify in the build

```bash
cd frontend && npx vite build 2>&1 | tail -5
ls dist/<type>/  # Verify the file made it into the build output
```

### 5. Visual check

After rebuilding Docker, take a Playwright screenshot to verify the image looks correct in context:

```
Navigate to http://localhost:8080
Take a screenshot
```

Look for: wrong aspect ratio, missing transparency (white box around logo), blurry upscaling, color mismatch with dark theme.

## Common issues and fixes

### Wrong colorway / wrong product
The user needs to provide the correct image — you can't fix this programmatically. Ask them to confirm: "Is this the right colorway? The current image shows [description]. You mentioned wanting [description]."

### White background on a dark theme
The image needs transparency. If it's a PNG with a solid background:
1. Ask the user if they have a transparent version
2. If not, suggest they remove the background using an external tool (Preview.app, remove.bg, or Photoshop)
3. Don't attempt automated background removal — it's unreliable for product photos

### Image too large (slow page load)
```bash
# Check current size
ls -lh frontend/public/<type>/<file>

# Resize to reasonable web dimensions
sips --resampleHeightWidthMax 400 <file> --out <file>
```

### Image not appearing after deploy
Check that:
1. The file is in `frontend/public/` (not `frontend/src/`)
2. The path in the component matches the filename exactly (case-sensitive)
3. The Docker build copied it: `docker compose exec stravviz ls /app/frontend/dist/<type>/`

## Component references

Gear images are referenced in `frontend/src/components/GearGallery.tsx` using the gear's model slug:
```typescript
<img src={`/gear/${slug}.png`} />
```

Brand images are referenced in `frontend/src/components/FloatingBrands.tsx` with explicit paths per brand.

When adding a new brand or gear image, check the relevant component to see how images are loaded and make sure the filename matches what the code expects.

## Checklist (do all of these every time)

1. Validate dimensions and format with `sips -g all`
2. Resize if over target dimensions
3. Copy to correct `frontend/public/<type>/` path
4. Verify the component references the correct filename
5. Build frontend: `cd frontend && npx vite build`
6. Rebuild Docker: `docker compose up -d --build`
7. Visual check in browser or via Playwright screenshot
