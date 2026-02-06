# Recursive Example: Lord of the Rings Maps

Three location maps from Middle-earth in separate subdirectories, demonstrating recursive batch conversion with the `-r` flag.

| The Shire | Gondor | Mordor |
|:---------:|:------:|:------:|
| ![Hobbiton](shire/hobbiton.png) | ![Minas Tirith](gondor/minas-tirith.png) | ![Mount Doom](mordor/mount-doom.png) |

## Directory Structure

```
recursive/
├── shire/
│   └── hobbiton.excalidraw       # Bag End → The Green Dragon → Bywater Pool
├── gondor/
│   └── minas-tirith.excalidraw   # Great Gate → White Tree → Tower of Ecthelion
└── mordor/
    └── mount-doom.excalidraw     # Black Gate → Plains of Gorgoroth → Mount Doom
```

## Commands

```bash
# Convert all files to PNG (default), output preserves folder structure
excalirender -r ./recursive/ -o ./output/

# Convert all to SVG
excalirender -r ./recursive/ -o ./output-svg/ -o output.svg

# Convert all to PDF
excalirender -r ./recursive/ -o ./output-pdf/ -o output.pdf

# Dark mode for all
excalirender -r ./recursive/ -o ./output-dark/ --dark
```

**Note:** The output directory and its subdirectories must exist before running. The recursive flag preserves the folder structure:

```
output/
├── shire/
│   └── hobbiton.png
├── gondor/
│   └── minas-tirith.png
└── mordor/
    └── mount-doom.png
```

## Maps

| Region | File | Color | Locations |
|--------|------|-------|-----------|
| The Shire | `shire/hobbiton.excalidraw` | Green (#b2f2bb) | Bag End, The Green Dragon, Bywater Pool |
| Gondor | `gondor/minas-tirith.excalidraw` | Grey (#dee2e6) | Great Gate, White Tree, Tower of Ecthelion |
| Mordor | `mordor/mount-doom.excalidraw` | Red (#ffc9c9) | Black Gate, Plains of Gorgoroth, Mount Doom |

Each file has 8 elements: 3 rectangles with bound text + 2 connecting arrows.
