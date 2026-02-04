/**
 * Unit tests for the diff command.
 *
 * Usage:
 *   bun run test:diff
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDefaultDiffOutput } from "../../src/cli.js";
import { computeDiff } from "../../src/diff-core.js";
import { exportDiffToExcalidraw } from "../../src/diff-excalidraw.js";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "diff", "temp");

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  PASS  ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  FAIL  ${name}`);
  console.log(`        ${error}`);
}

function cleanup() {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
}

function createExcalidrawFile(elements: object[]): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "test",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
  });
}

function createRectElement(id: string, x = 0, y = 0): object {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 100,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: 1,
    angle: 0,
    groupIds: [],
    boundElements: null,
    isDeleted: false,
  };
}

function createTextElement(id: string, text: string, x = 0, y = 0): object {
  return {
    id,
    type: "text",
    x,
    y,
    width: 100,
    height: 20,
    text,
    fontSize: 20,
    fontFamily: 1,
    textAlign: "left",
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: 1,
    angle: 0,
    isDeleted: false,
  };
}

function createLineElement(
  id: string,
  points: [number, number][],
  x = 0,
  y = 0,
): object {
  return {
    id,
    type: "line",
    x,
    y,
    width: 100,
    height: 100,
    points,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: 1,
    angle: 0,
    isDeleted: false,
  };
}

function setupTempDir() {
  cleanup();
  mkdirSync(TEMP_DIR, { recursive: true });
}

// ============================================================================
// Unit Tests for computeDiff
// ============================================================================

async function testDiffBasic() {
  const testName = "computeDiff: correctly identifies added/removed/unchanged";
  try {
    // Old file: elements A, B, C
    const oldFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-b", 100, 0),
      createRectElement("elem-c", 200, 0),
    ]);

    // New file: elements A, C, D (B removed, D added)
    const newFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-c", 200, 0),
      createRectElement("elem-d", 300, 0),
    ]);

    const oldPath = join(TEMP_DIR, "old-basic.excalidraw");
    const newPath = join(TEMP_DIR, "new-basic.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 1) {
      fail(testName, `Expected 1 added, got ${diff.added.length}`);
      return;
    }
    if (diff.added[0].id !== "elem-d") {
      fail(
        testName,
        `Expected added element to be elem-d, got ${diff.added[0].id}`,
      );
      return;
    }
    if (diff.removed.length !== 1) {
      fail(testName, `Expected 1 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.removed[0].id !== "elem-b") {
      fail(
        testName,
        `Expected removed element to be elem-b, got ${diff.removed[0].id}`,
      );
      return;
    }
    if (diff.unchanged.length !== 2) {
      fail(testName, `Expected 2 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffIdenticalFiles() {
  const testName = "computeDiff: identical files have no diff";
  try {
    const file = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-b", 100, 0),
    ]);

    const oldPath = join(TEMP_DIR, "identical-old.excalidraw");
    const newPath = join(TEMP_DIR, "identical-new.excalidraw");
    writeFileSync(oldPath, file);
    writeFileSync(newPath, file);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 0) {
      fail(testName, `Expected 0 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 0) {
      fail(testName, `Expected 0 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.unchanged.length !== 2) {
      fail(testName, `Expected 2 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffAllAdded() {
  const testName = "computeDiff: empty old file = all added";
  try {
    const oldFile = createExcalidrawFile([]);
    const newFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-b", 100, 0),
    ]);

    const oldPath = join(TEMP_DIR, "all-added-old.excalidraw");
    const newPath = join(TEMP_DIR, "all-added-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 2) {
      fail(testName, `Expected 2 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 0) {
      fail(testName, `Expected 0 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffAllRemoved() {
  const testName = "computeDiff: empty new file = all removed";
  try {
    const oldFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-b", 100, 0),
    ]);
    const newFile = createExcalidrawFile([]);

    const oldPath = join(TEMP_DIR, "all-removed-old.excalidraw");
    const newPath = join(TEMP_DIR, "all-removed-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 0) {
      fail(testName, `Expected 0 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 2) {
      fail(testName, `Expected 2 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffCompletelyDifferent() {
  const testName = "computeDiff: completely different files";
  try {
    const oldFile = createExcalidrawFile([
      createRectElement("old-1", 0, 0),
      createRectElement("old-2", 100, 0),
    ]);
    const newFile = createExcalidrawFile([
      createRectElement("new-1", 0, 0),
      createRectElement("new-2", 100, 0),
      createRectElement("new-3", 200, 0),
    ]);

    const oldPath = join(TEMP_DIR, "different-old.excalidraw");
    const newPath = join(TEMP_DIR, "different-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 3) {
      fail(testName, `Expected 3 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 2) {
      fail(testName, `Expected 2 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffIgnoresDeletedElements() {
  const testName = "computeDiff: ignores deleted elements";
  try {
    const oldFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      { ...createRectElement("elem-deleted", 100, 0), isDeleted: true },
    ]);
    const newFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);

    const oldPath = join(TEMP_DIR, "deleted-old.excalidraw");
    const newPath = join(TEMP_DIR, "deleted-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    // The deleted element should not appear in removed
    if (diff.removed.length !== 0) {
      fail(testName, `Expected 0 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.unchanged.length !== 1) {
      fail(testName, `Expected 1 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffInvalidFile() {
  const testName = "computeDiff: throws on invalid file";
  try {
    const validFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const invalidFile = "not valid json";

    const oldPath = join(TEMP_DIR, "invalid-old.excalidraw");
    const newPath = join(TEMP_DIR, "invalid-new.excalidraw");
    writeFileSync(oldPath, validFile);
    writeFileSync(newPath, invalidFile);

    try {
      computeDiff(oldPath, newPath);
      fail(testName, "Expected error to be thrown");
    } catch (e) {
      if (String(e).includes("Failed to parse")) {
        pass(testName);
      } else {
        fail(testName, `Wrong error: ${e}`);
      }
    }
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffWrongFileType() {
  const testName = "computeDiff: throws on wrong file type";
  try {
    const validFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const wrongTypeFile = JSON.stringify({
      type: "not-excalidraw",
      elements: [],
    });

    const oldPath = join(TEMP_DIR, "wrongtype-old.excalidraw");
    const newPath = join(TEMP_DIR, "wrongtype-new.excalidraw");
    writeFileSync(oldPath, validFile);
    writeFileSync(newPath, wrongTypeFile);

    try {
      computeDiff(oldPath, newPath);
      fail(testName, "Expected error to be thrown");
    } catch (e) {
      if (String(e).includes("Invalid file format")) {
        pass(testName);
      } else {
        fail(testName, `Wrong error: ${e}`);
      }
    }
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Unit Tests for Modified Detection
// ============================================================================

async function testModifiedPositionChange() {
  const testName = "computeDiff: detects position change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    // Same ID but different position
    const newFile = createExcalidrawFile([createRectElement("elem-a", 50, 50)]);

    const oldPath = join(TEMP_DIR, "modified-pos-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-pos-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.modified[0].old.id !== "elem-a") {
      fail(testName, `Expected modified element to be elem-a`);
      return;
    }
    if (diff.modified[0].new.x !== 50 || diff.modified[0].new.y !== 50) {
      fail(testName, `Expected new position to be (50, 50)`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedSizeChange() {
  const testName = "computeDiff: detects size change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    // Same ID but different size
    const newElement = { ...createRectElement("elem-a", 0, 0), width: 200, height: 200 };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-size-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-size-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedColorChange() {
  const testName = "computeDiff: detects color change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    // Same ID but different color
    const newElement = { ...createRectElement("elem-a", 0, 0), strokeColor: "#ff0000" };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-color-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-color-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedMixedChanges() {
  const testName = "computeDiff: correctly categorizes mixed changes";
  try {
    // Old: A, B, C
    const oldFile = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
      createRectElement("elem-b", 100, 0),
      createRectElement("elem-c", 200, 0),
    ]);

    // New: A (modified), C (unchanged), D (added), B removed
    const newFile = createExcalidrawFile([
      { ...createRectElement("elem-a", 50, 50) }, // modified position
      createRectElement("elem-c", 200, 0), // unchanged
      createRectElement("elem-d", 300, 0), // added
    ]);

    const oldPath = join(TEMP_DIR, "modified-mixed-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-mixed-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 1) {
      fail(testName, `Expected 1 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 1) {
      fail(testName, `Expected 1 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 1) {
      fail(testName, `Expected 1 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    // Verify specific elements
    if (diff.added[0].id !== "elem-d") {
      fail(testName, `Expected added to be elem-d`);
      return;
    }
    if (diff.removed[0].id !== "elem-b") {
      fail(testName, `Expected removed to be elem-b`);
      return;
    }
    if (diff.modified[0].old.id !== "elem-a") {
      fail(testName, `Expected modified to be elem-a`);
      return;
    }
    if (diff.unchanged[0].id !== "elem-c") {
      fail(testName, `Expected unchanged to be elem-c`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedIgnoresTransientFields() {
  const testName = "computeDiff: ignores seed changes (transient field)";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    // Same element but different seed (should be unchanged, not modified)
    const newElement = { ...createRectElement("elem-a", 0, 0), seed: 9999 };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-seed-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-seed-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    // Seed is a transient field, so element should be unchanged
    if (diff.modified.length !== 0) {
      fail(testName, `Expected 0 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 1) {
      fail(testName, `Expected 1 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

async function testModifiedBackgroundColorChange() {
  const testName = "computeDiff: detects backgroundColor change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newElement = {
      ...createRectElement("elem-a", 0, 0),
      backgroundColor: "#ff0000",
    };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-bgcolor-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-bgcolor-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedStrokeWidthChange() {
  const testName = "computeDiff: detects strokeWidth change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newElement = { ...createRectElement("elem-a", 0, 0), strokeWidth: 4 };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-strokewidth-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-strokewidth-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedOpacityChange() {
  const testName = "computeDiff: detects opacity change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newElement = { ...createRectElement("elem-a", 0, 0), opacity: 50 };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-opacity-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-opacity-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedAngleChange() {
  const testName = "computeDiff: detects angle/rotation change as modified";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newElement = {
      ...createRectElement("elem-a", 0, 0),
      angle: Math.PI / 4,
    };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-angle-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-angle-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedTextChange() {
  const testName = "computeDiff: detects text content change as modified";
  try {
    const oldFile = createExcalidrawFile([
      createTextElement("text-1", "Hello", 0, 0),
    ]);
    const newElement = { ...createTextElement("text-1", "Hello", 0, 0), text: "World" };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-text-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-text-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedPointsChange() {
  const testName = "computeDiff: detects points array change as modified";
  try {
    const oldFile = createExcalidrawFile([
      createLineElement("line-1", [[0, 0], [100, 100]], 0, 0),
    ]);
    const newElement = {
      ...createLineElement("line-1", [[0, 0], [100, 100]], 0, 0),
      points: [[0, 0], [200, 200]],
    };
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "modified-points-old.excalidraw");
    const newPath = join(TEMP_DIR, "modified-points-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.modified.length !== 1) {
      fail(testName, `Expected 1 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffFileNotFound() {
  const testName = "computeDiff: throws on file not found";
  try {
    const validFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const oldPath = join(TEMP_DIR, "exists.excalidraw");
    const newPath = join(TEMP_DIR, "does-not-exist.excalidraw");
    writeFileSync(oldPath, validFile);
    // Don't create newPath

    try {
      computeDiff(oldPath, newPath);
      fail(testName, "Expected error to be thrown");
    } catch (e) {
      if (String(e).includes("ENOENT") || String(e).includes("no such file")) {
        pass(testName);
      } else {
        fail(testName, `Wrong error: ${e}`);
      }
    }
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffBothFilesEmpty() {
  const testName = "computeDiff: both files empty returns empty diff";
  try {
    const oldFile = createExcalidrawFile([]);
    const newFile = createExcalidrawFile([]);

    const oldPath = join(TEMP_DIR, "both-empty-old.excalidraw");
    const newPath = join(TEMP_DIR, "both-empty-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    if (diff.added.length !== 0) {
      fail(testName, `Expected 0 added, got ${diff.added.length}`);
      return;
    }
    if (diff.removed.length !== 0) {
      fail(testName, `Expected 0 removed, got ${diff.removed.length}`);
      return;
    }
    if (diff.modified.length !== 0) {
      fail(testName, `Expected 0 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 0) {
      fail(testName, `Expected 0 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedAngleUndefinedVsZero() {
  const testName = "computeDiff: angle undefined vs 0 treated as equal";
  try {
    // Old element has angle: 0 (from createRectElement)
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    // New element has angle: undefined (explicitly removed)
    const newElement = createRectElement("elem-a", 0, 0) as Record<string, unknown>;
    delete newElement.angle;
    const newFile = createExcalidrawFile([newElement]);

    const oldPath = join(TEMP_DIR, "angle-undef-old.excalidraw");
    const newPath = join(TEMP_DIR, "angle-undef-new.excalidraw");
    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    const diff = computeDiff(oldPath, newPath);

    // undefined angle should be treated as 0, so element should be unchanged
    if (diff.modified.length !== 0) {
      fail(testName, `Expected 0 modified, got ${diff.modified.length}`);
      return;
    }
    if (diff.unchanged.length !== 1) {
      fail(testName, `Expected 1 unchanged, got ${diff.unchanged.length}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Output Option Tests
// ============================================================================

async function testDefaultOutputBasic() {
  const testName = "generateDefaultDiffOutput: basic filenames";
  try {
    const result = generateDefaultDiffOutput("old.excalidraw", "new.excalidraw");
    if (result !== "old_vs_new.png") {
      fail(testName, `Expected "old_vs_new.png", got "${result}"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDefaultOutputWithPaths() {
  const testName = "generateDefaultDiffOutput: with directory paths";
  try {
    const result = generateDefaultDiffOutput(
      "/path/to/old.excalidraw",
      "/other/path/new.excalidraw",
    );
    if (result !== "old_vs_new.png") {
      fail(testName, `Expected "old_vs_new.png", got "${result}"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDefaultOutputSpecialNames() {
  const testName = "generateDefaultDiffOutput: special characters in names";
  try {
    const result = generateDefaultDiffOutput(
      "file-v1.excalidraw",
      "file-v2.excalidraw",
    );
    if (result !== "file-v1_vs_file-v2.png") {
      fail(testName, `Expected "file-v1_vs_file-v2.png", got "${result}"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testExcalidrawOutputFormat() {
  const testName = "exportDiffToExcalidraw: creates valid JSON with correct structure";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newFile = createExcalidrawFile([
      createRectElement("elem-a", 50, 50), // modified
      createRectElement("elem-b", 100, 0), // added
    ]);

    const oldPath = join(TEMP_DIR, "excalidraw-out-old.excalidraw");
    const newPath = join(TEMP_DIR, "excalidraw-out-new.excalidraw");
    const outputPath = join(TEMP_DIR, "output.excalidraw");

    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    await exportDiffToExcalidraw(oldPath, newPath, {
      outputPath,
      scale: 1,
      hideUnchanged: false,
      showTags: true,
    });

    // Verify file exists
    if (!existsSync(outputPath)) {
      fail(testName, "Output file was not created");
      return;
    }

    // Verify valid JSON
    const content = readFileSync(outputPath, "utf-8");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      fail(testName, "Output is not valid JSON");
      return;
    }

    // Verify structure
    if (parsed.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${parsed.type}"`);
      return;
    }
    if (!Array.isArray(parsed.elements)) {
      fail(testName, "Missing elements array");
      return;
    }
    if (typeof parsed.appState !== "object" || parsed.appState === null) {
      fail(testName, "Missing appState object");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testExcalidrawOutputHasTags() {
  const testName = "exportDiffToExcalidraw: includes diff tags as text elements";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newFile = createExcalidrawFile([
      createRectElement("elem-b", 100, 0), // added (elem-a removed)
    ]);

    const oldPath = join(TEMP_DIR, "tags-old.excalidraw");
    const newPath = join(TEMP_DIR, "tags-new.excalidraw");
    const outputPath = join(TEMP_DIR, "tags-output.excalidraw");

    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    await exportDiffToExcalidraw(oldPath, newPath, {
      outputPath,
      scale: 1,
      hideUnchanged: false,
      showTags: true,
    });

    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content) as { elements: Array<{ type: string; text?: string }> };

    // Find text elements that are tags
    const textElements = parsed.elements.filter((el) => el.type === "text");
    const tagTexts = textElements.map((el) => el.text);

    // Should have "added" and "removed" tags
    const hasAddedTag = tagTexts.some((t) => t === "added");
    const hasRemovedTag = tagTexts.some((t) => t === "removed");

    if (!hasAddedTag) {
      fail(testName, "Missing 'added' tag text element");
      return;
    }
    if (!hasRemovedTag) {
      fail(testName, "Missing 'removed' tag text element");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testExcalidrawOutputNoTagsOption() {
  const testName = "exportDiffToExcalidraw: respects showTags=false option";
  try {
    const oldFile = createExcalidrawFile([createRectElement("elem-a", 0, 0)]);
    const newFile = createExcalidrawFile([createRectElement("elem-b", 100, 0)]);

    const oldPath = join(TEMP_DIR, "notags-old.excalidraw");
    const newPath = join(TEMP_DIR, "notags-new.excalidraw");
    const outputPath = join(TEMP_DIR, "notags-output.excalidraw");

    writeFileSync(oldPath, oldFile);
    writeFileSync(newPath, newFile);

    await exportDiffToExcalidraw(oldPath, newPath, {
      outputPath,
      scale: 1,
      hideUnchanged: false,
      showTags: false, // Disable tags
    });

    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content) as { elements: Array<{ type: string; text?: string }> };

    // Find text elements that are tags
    const textElements = parsed.elements.filter((el) => el.type === "text");
    const tagTexts = textElements.map((el) => el.text);

    // Should NOT have "added" or "removed" tags
    const hasAddedTag = tagTexts.some((t) => t === "added");
    const hasRemovedTag = tagTexts.some((t) => t === "removed");

    if (hasAddedTag || hasRemovedTag) {
      fail(testName, "Tags should not be present when showTags=false");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("Diff Unit Tests");
  console.log("=".repeat(50));

  setupTempDir();

  console.log("\nUnit Tests (computeDiff - basic):");
  await testDiffBasic();
  await testDiffIdenticalFiles();
  await testDiffAllAdded();
  await testDiffAllRemoved();
  await testDiffCompletelyDifferent();
  await testDiffIgnoresDeletedElements();
  await testDiffInvalidFile();
  await testDiffWrongFileType();

  console.log("\nUnit Tests (computeDiff - modified detection):");
  await testModifiedPositionChange();
  await testModifiedSizeChange();
  await testModifiedColorChange();
  await testModifiedMixedChanges();
  await testModifiedIgnoresTransientFields();

  console.log("\nUnit Tests (computeDiff - additional edge cases):");
  await testModifiedBackgroundColorChange();
  await testModifiedStrokeWidthChange();
  await testModifiedOpacityChange();
  await testModifiedAngleChange();
  await testModifiedTextChange();
  await testModifiedPointsChange();
  await testDiffFileNotFound();
  await testDiffBothFilesEmpty();
  await testModifiedAngleUndefinedVsZero();

  console.log("\nUnit Tests (output options):");
  await testDefaultOutputBasic();
  await testDefaultOutputWithPaths();
  await testDefaultOutputSpecialNames();
  await testExcalidrawOutputFormat();
  await testExcalidrawOutputHasTags();
  await testExcalidrawOutputNoTagsOption();

  cleanup();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
