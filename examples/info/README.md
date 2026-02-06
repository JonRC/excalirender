# Info Example: Legend of Zelda Inventory

A Zelda-themed item inventory diagram with diverse element types, multiple colors, two font families, and a frame — designed to produce rich metadata output.

## File

- `zelda-inventory.excalidraw` — 22 elements: 8 item rectangles (Master Sword, Hylian Shield, Fairy Bow, Bombs, Hookshot, Boomerang, Megaton Hammer, Ocarina of Time), a Triforce ellipse, 2 section labels, 1 arrow, and a "Weapons" frame

## Commands

```bash
# Text output (default)
excalirender info zelda-inventory.excalidraw

# JSON output
excalirender info zelda-inventory.excalidraw --json

# From stdin
cat zelda-inventory.excalidraw | excalirender info -
```

## Sample Text Output

```
File: zelda-inventory.excalidraw
Size: 12.5 KB
Version: 2
Source: example

Elements: 22
  text: 11
  rectangle: 8
  frame: 1
  arrow: 1
  ellipse: 1

Canvas: 730 x 416 px
Background: #ffffff

Fonts:
  Excalifont
  Virgil

Colors:
  Stroke: #0c8599, #1971c2, #1e1e1e, #2b8a3e, #495057, #6741d9, #bbb, #c2255c, #c92a2a, #e67700, #ffffff
  Fill: #74c0fc, #868e96, #99e9f2, #a5d8ff, #b2f2bb, #d0bfff, #f783ac, #ffc9c9, #ffd43b

Frames:
  Weapons
```

## What Makes This File Interesting for `info`

| Property | Value | Why |
|----------|-------|-----|
| Element types | 5 (text, rectangle, frame, arrow, ellipse) | Shows element breakdown |
| Fonts | 2 (Excalifont, Virgil) | fontFamily 1 and 5 mixed |
| Stroke colors | 11 distinct | Rich palette |
| Fill colors | 9 distinct | Multiple item categories |
| Frames | 1 ("Weapons") | Frame detection |
| Canvas size | 730 x 416 px | Bounding box calculation |
