---
name: visual-qa
description: "Visual QA loop for StravaViz: take screenshots via Playwright, evaluate UI appearance, and suggest or apply CSS/component fixes. Use this skill whenever the user asks to check how something looks, verify visual changes, fix spacing/alignment/sizing issues, do a visual review, or says things like 'does it look right', 'check the screenshot', 'the spacing is off', 'fix the layout', 'how does it look', 'take a screenshot', or any visual polish/refinement task. Also use after integrating new images or making frontend changes that affect appearance."
---

# Visual QA Loop

Iterative visual refinement for StravaViz. The app runs on `http://localhost:8080` in Docker. Use Playwright MCP tools to screenshot, evaluate, and fix until the UI matches expectations.

## The loop

Visual work is inherently iterative — expect 2-4 rounds per change. The goal is to evaluate and fix proactively rather than showing the user broken screenshots.

### 1. Ensure the app is running

```bash
curl -s http://localhost:8080/api/health | python3 -m json.tool
```

If it's not running: `docker compose up -d --build`

### 2. Navigate and screenshot

Use Playwright MCP tools in **headless mode** (never pop up a visible Chrome window):

```
browser_navigate → http://localhost:8080
browser_take_screenshot
```

For specific pages:
- Dashboard: `http://localhost:8080/` (default view)
- Gear: click the "Gear" tab or navigate directly if routed
- Trophies: click the "Trophies" tab
- Activity detail: click any activity card from the feed
- Landing page: `http://localhost:8080/` (if on v3-landing-page branch)

### 3. Evaluate the screenshot

Before showing anything to the user, evaluate against these criteria:

**Layout**
- Is the content centered and properly contained?
- Are there unexpected horizontal scrollbars?
- Do cards/sections have consistent spacing?
- Is the responsive layout working (no overflow, no cramped elements)?

**Dark mode**
- Is the background the expected dark color (gray-900/gray-950)?
- Is text readable against the background (gray-100/gray-200 for body, white for headings)?
- Are there any "white flash" elements (unstyled components defaulting to light)?
- Color palette should be indigo/teal/emerald — NOT orange/Strava brand colors

**Images**
- Do images render at the correct size?
- Are logos/icons properly transparent (no white rectangles on dark background)?
- Are gear photos the right product/colorway?
- Any broken image icons?

**Typography**
- Heading hierarchy makes sense (h1 > h2 > h3)?
- No text truncation hiding important info?
- Numbers and metrics are readable and well-formatted?

**Charts (Recharts)**
- Axes labeled and readable?
- Legend present and accurate?
- Colors distinguishable and consistent with the palette?
- Tooltip works on hover?

### 4. Fix issues before reporting

If you spot problems, fix them directly:

**CSS/Tailwind fixes** — Edit the component file, rebuild, re-screenshot:
```
Edit the .tsx file → fix Tailwind classes
docker compose up -d --build
browser_navigate → http://localhost:8080
browser_take_screenshot
```

**Common Tailwind fixes:**
- Spacing: `space-y-4`, `gap-4`, `p-4`, `px-6`, `py-3`
- Alignment: `flex items-center justify-between`
- Overflow: `overflow-hidden`, `max-w-full`, `truncate`
- Dark mode: always pair with `dark:` variant (e.g., `bg-white dark:bg-gray-900`)
- Responsive: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

**Image sizing:**
- Constrain: `max-w-[200px]`, `h-auto`, `object-contain`
- Aspect ratio: `aspect-square`, `aspect-video`

**Important:** Check for inline styles in React components that might override Tailwind classes. Components like DataTable or Recharts often use programmatic style objects — prefer `style_data_conditional` or component props over CSS class overrides.

### 5. Show the user

Only show the screenshot to the user after you've evaluated it and fixed any obvious issues. If you made fixes, show a before/after comparison or describe what you changed.

If the screenshot looks good, say so briefly: "Looks correct — [specific thing] renders as expected."

### 6. Handle user feedback

The user will often request fine-tuning:
- "Move it up/down/left/right" → adjust margins/padding
- "Make it bigger/smaller" → adjust size classes or max-width
- "The color is wrong" → check Tailwind color and dark mode variant
- "Too much space" / "Too cramped" → adjust spacing scale

After each change: edit → rebuild docker → re-screenshot → evaluate → show if good.

## Specific pages to check

### Landing page (v3-landing-page branch)
- Scroll-driven animations with GSAP ScrollTrigger
- Floating brands marquee
- Logo placement and sizing
- Dot curtain parallax effect
- Navigate and scroll: `browser_press_key → ArrowDown` or `browser_evaluate → window.scrollTo(0, 500)`

### Dashboard
- Metric cards row (should be responsive grid)
- Trend chart (Recharts line chart with period selector)
- Activity feed with pagination
- Sport filter dropdown

### Gear gallery
- Shoe image cards with brand/model info
- Click-through to gear detail with activity list

### Activity detail
- Splits table with pace bars
- HR zone chart (horizontal bars, Zone 5 on top)
- Summary stats at the top

## Troubleshooting

### Playwright won't connect
```bash
# Kill stale Playwright processes
rm -rf /Users/ecevans/Library/Caches/ms-playwright/mcp-chrome-*/SingletonLock
```
Then retry the browser_navigate call.

### Screenshot is blank/white
The app might not have finished loading. Use `browser_wait_for` to wait for a specific element before screenshotting.

### Docker not reflecting changes
Make sure you used `--build`: `docker compose up -d --build`
