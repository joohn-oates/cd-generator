# CD Generator

Design a 3D CD in the browser and embed it in Framer.

- **`index.html`**: the editor (label, colours, artwork, disc finish, motion).
- **`viewer.html`**: the page Framer embeds. It has a transparent background and shows only the CD.
- **`designs/`**: design files for CDs that use uploaded artwork.
- **`vendor/three/`**: a copy of [three.js](https://threejs.org) r160 (MIT), so there's no build step and nothing loads from a CDN.

## Using it

1. Open the editor and design your CD.
2. Click **Get embed link**.
   - Without uploaded artwork, the link holds the whole design and works straight away.
   - With uploaded artwork, download the design file and upload it to the `designs/` folder on GitHub. The link works about a minute later.
3. In Framer, go to **Insert → Embed**, set the type to **URL** and paste the link.

To change an existing CD, open its embed link with `index.html` in place of `viewer.html`. It loads into the editor.

## Running locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
