# CD Generator

Design a 3D CD in the browser and embed it in Framer.

- **`index.html`**: the editor (label, colours, artwork, disc finish, motion).
- **`viewer.html`**: the page Framer embeds. It has a transparent background and shows only the CD.
- **`designs/`**: design files for CDs that use uploaded artwork.
- **`fonts/`**: open-source fonts (SIL OFL) used to letter the brand fronts.
- **`vendor/three/`**: a copy of [three.js](https://threejs.org) r160 (MIT), so there's no build step and nothing loads from a CDN.

## Using it

1. Open the editor and design your CD.
2. Click **Get embed link**.
   - Without uploaded artwork, the link holds the whole design and works straight away.
   - With uploaded artwork, download the design file and upload it to the `designs/` folder on GitHub. The link works about a minute later.
3. In Framer, go to **Insert → Embed**, set the type to **URL** and paste the link.

To change an existing CD, open its embed link with `index.html` in place of `viewer.html`. It loads into the editor.

## Fronts

The front can be a blank CD-R style (TDK, Maxell, Imation, Verbatim or Sony) or a **custom print** with your own colours, text and artwork. The brand fronts model real CD-R faces. The face is a metallic lacquer, dark inks are matte, and knocked-out lettering is bare mirror that catches the rainbow. Brand names are set in similar typefaces, and the logo marks are not reproduced.

## Condition

Presets from **Mint** to **Trashed**, plus sliders for each kind of damage:
- **Scratches:** each one glints only when the light catches it.
- **Scuffs & haze:** cloudy worn patches.
- **Dust & grime:** specks and dirt.
- **Disc rot:** peeling foil, see-through holes and milky stains.
- **Chipped edge:** pieces broken off the edge, with cracks running inward.

**Re-roll** picks a new random damage pattern.

## Marker mode

Visitors can write on the CD like a 2000s burned disc. The marker button (bottom left of the embed) pauses the disc and turns it to face you. It has black, red and blue markers, fine or bold tips, Undo and Clear. **Done** starts the disc moving again, with the writing on it. Writing is temporary: it clears on reload. Turn it off per design with the "Visitors can write on it with a marker" option.

## Running locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
