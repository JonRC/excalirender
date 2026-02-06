# Diff GIF Example: Hollow Knight Game Flow

A visual diff example using a Hollow Knight game completion flowchart. Two versions of the same diagram — one with mistakes, one correct — demonstrate all three diff types: **Added**, **Removed**, and **Modified**.

## Files

- `old.excalidraw` — incorrect flow with typos, a wrong area name, and a fake location
- `new.excalidraw` — corrected flow with fixes, a missing area added, and the fake location removed

## Commands

```bash
# Animated GIF (alternates between old and new every 1s)
excalirender diff old.excalidraw new.excalidraw -o diff.gif

# Slower animation (2s per frame)
excalirender diff old.excalidraw new.excalidraw -o diff.gif --delay 2000

# Static PNG with diff tags
excalirender diff old.excalidraw new.excalidraw -o diff.png

# Static SVG
excalirender diff old.excalidraw new.excalidraw -o diff.svg
```

## What Changed

| Element | old.excalidraw | new.excalidraw | Diff Tag |
|---------|---------------|----------------|----------|
| Crossroads text | "Forgoten Crossroads" (typo) | "Forgotten Crossroads" | Modified (grey) |
| Crystal area text | "Crystal Caves" (wrong name) | "Crystal Peak" | Modified (grey) |
| Final boss text | "Defeat the Hollow Night" (typo) | "Defeat the Hollow Knight" | Modified (grey) |
| Mushroom Market | Present (doesn't exist in game) | Absent | Removed (red) |
| Ancient Basin | Absent | Present (was missing) | Added (green) |

## Expected Output

The diff output shows a vertical flowchart with 8 main steps connected by arrows. Three text labels have grey "Modified" tags where typos/names were corrected. A yellow box ("Mushroom Market") branching from Greenpath has a red "Removed" tag. A green box ("Ancient Basin") branching from Crystal Peak has a green "Added" tag.

**Element counts:** Added 3, Removed 3, Modified 3, Unchanged 20.
