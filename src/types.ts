export interface ExcalidrawFile {
  type: "excalidraw";
  version: number;
  source: string;
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: Record<string, BinaryFileData>;
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  strokeWidth: number;
  roughness: number;
  opacity: number;
  seed: number;
  [key: string]: unknown;
}

export interface AppState {
  viewBackgroundColor: string;
  exportBackground: boolean;
  exportWithDarkMode: boolean;
  exportScale: number;
  [key: string]: unknown;
}

export interface BinaryFileData {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
}

export interface ExportOptions {
  outputPath: string;
  scale: number;
  background: string | null;
  darkMode: boolean;
  frameId?: string;
}
