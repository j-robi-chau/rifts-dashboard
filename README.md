# RIFTS Stat Dashboard

A lightweight browser-based dashboard for tracking common RIFTS combat/session resources:

- PPE, MDC, SDC, ISP, and HP tracking
- Multiple custom stat blocks (with labels + source fields)
- Per-stat block delete button when effects/equipment expire
- Ammunition by weapon
- Action log (editable, table-friendly wording) that can be appended into encounter notes
- Session notes

All values are saved in browser local storage, so your stats persist between refreshes on the same machine/browser profile.

## Run locally

Open `index.html` directly in your browser, or serve this folder with a simple local server:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
