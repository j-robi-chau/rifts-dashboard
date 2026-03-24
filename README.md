# RIFTS Character + Party Dashboard (Static Site)

A lightweight **vanilla HTML/CSS/JavaScript** dashboard for table play that tracks character and party combat resources for RIFTS.

## What it does

- Tracks per-character:
  - Name
  - PPE (current/max)
  - SDC (current/max)
  - MDC (current/max)
  - Attacks per melee (current)
  - Optional ammo trackers (weapon + current/max)
- Provides quick stat controls (`-5`, `-1`, `+1`, `+5`) for fast in-session updates.
- Requires a **Log Entry reason** for stat/ammo changes.
- Stores both:
  - Character-specific history
  - Party-wide combined history
- Persists all data in `localStorage`.

## How to use

1. Open `index.html` directly in your browser, **or** host it on GitHub Pages.
2. Add one or more characters in the Party panel.
3. Open a character from the Party list to edit details.
4. Use quick buttons to adjust PPE/SDC/MDC/attacks/ammo.
5. Enter a short reason in the Log Entry dialog to record what happened.
6. Review recent entries in Character History and Party-wide History.

## Export / Import

- **Export JSON** downloads the full dashboard state as a `.json` file.
- **Import JSON** loads a previously exported file and restores all characters/history.
- Import prompts for confirmation before overwriting current state.

## Reset Data

- Use **Reset Data** to clear everything.
- Includes strong confirmation and requires typing `RESET`.

## Deploy on GitHub Pages

1. Push these files to your repository root on the `main` branch:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `README.md`
2. In GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set:
   - **Source**: Deploy from a branch
   - **Branch**: `main` / `/ (root)`
4. Save and wait for the site URL to appear.
