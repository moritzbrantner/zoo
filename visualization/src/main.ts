// @ts-nocheck
import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildingManifest, fenceManifest, resourceManifest } from "./assets/assetManifest";
import {
  DEFAULT_ENTRY_FEE,
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE,
  WORKER_WALK_SPEED,
  testMode,
} from "./config/runtime";
import { createHotkeyBadge, installHotkeys, setButtonLabelWithHotkey } from "./hotkeys";
import { baseResourceState, animalAttractionProfiles } from "./state/baseState";
import { createZooClient } from "./sync/zooClient";

const canvas = document.querySelector("#zoo-scene");
const mainMenuEl = document.querySelector(".main-menu");
const startZooEl = document.querySelector("#start-zoo");
const startZooLabelEl = document.querySelector("#start-zoo-label");
const mainMenuSummaryEl = document.querySelector("#main-menu-summary");
const mainMenuToggleEl = document.querySelector("#main-menu-toggle");
const openSettingsEls = document.querySelectorAll("[data-open-settings]");
const openWikiEls = document.querySelectorAll("[data-open-wiki]");
const settingsPanelEl = document.querySelector(".settings-panel");
const closeSettingsEl = document.querySelector("#close-settings");
const wikiPanelEl = document.querySelector(".wiki-panel");
const closeWikiEl = document.querySelector("#close-wiki");
const wikiSectionsEl = document.querySelector("#wiki-sections");
const simSpeedEl = document.querySelector("#sim-speed");
const simSpeedValueEl = document.querySelector("#sim-speed-value");
const motionEffectsEl = document.querySelector("#motion-effects");
const shadowToggleEl = document.querySelector("#shadow-toggle");
const gameplayEls = document.querySelectorAll(".hud, .inspector, .build-menu, .controls");
const clockEl = document.querySelector("#clock");
const phaseEl = document.querySelector("#phase-label");
const syncStatusEl = document.querySelector("#sync-status");
const entryFeeEl = document.querySelector("#entry-fee");
const entryFeeValueEl = document.querySelector("#entry-fee-value");
const willingnessValueEl = document.querySelector("#willingness-value");
const demandValueEl = document.querySelector("#demand-value");
const resourceListEl = document.querySelector("#resource-list");
const inspectorTitleEl = document.querySelector("#inspector-title");
const inspectorSummaryEl = document.querySelector("#inspector-summary");
const inspectorActionsEl = document.querySelector("#inspector-actions");
const animalRosterEl = document.querySelector("#animal-roster");
const animalRosterSummaryEl = document.querySelector("#animal-roster-summary");
const animalRosterListEl = document.querySelector("#animal-roster-list");
const inspectorDetailsEl = document.querySelector("#inspector-details");
const contextMenuEl = document.querySelector(".context-menu");
const contextMenuTitleEl = document.querySelector("#context-menu-title");
const contextMenuSummaryEl = document.querySelector("#context-menu-summary");
const contextMenuInspectEl = document.querySelector("#context-menu-inspect");
const contextMenuBuildEl = document.querySelector("#context-menu-build");
const contextMenuWorkerEl = document.querySelector("#context-menu-worker");
const contextMenuResetEl = document.querySelector("#context-menu-reset");
const buildMenuEl = document.querySelector(".build-menu");
const buildMenuToggleEl = document.querySelector("#build-menu-toggle");
const closeBuildMenuEl = document.querySelector("#close-build-menu");
const buildOptionsEl = document.querySelector("#build-options");
const buyLandEl = document.querySelector("#buy-land");
const fenceOptionsEl = document.querySelector("#fence-options");
const buildMenuStatusEl = document.querySelector("#build-menu-status");
const drawPathEl = document.querySelector("#draw-path");
const confirmPathEl = document.querySelector("#confirm-path");
const cancelPathEl = document.querySelector("#cancel-path");
const drawAreaEl = document.querySelector("#draw-area");
const confirmAreaEl = document.querySelector("#confirm-area");
const drawFenceEl = document.querySelector("#draw-fence");
const confirmFenceEl = document.querySelector("#confirm-fence");
const resetViewEl = document.querySelector("#reset-view");
const resources = resourceManifest;

const resourceDescriptions = Object.fromEntries(
  resourceManifest.map((resource) => [resource.id, resource.description]),
);
const resourceLabels = Object.fromEntries(resourceManifest.map((resource) => [resource.id, resource.label]));
const fenceLabels = Object.fromEntries(fenceManifest.map((fence) => [fence.kind, fence.label]));
const buildingCategoryLabels = {
  entry: "Entry",
  guest: "Guest Services",
  staff: "Staff",
  habitat: "Habitats",
};
const animalSpeciesCatalog = [
  {
    kind: "rabbit_colony",
    label: "Rabbit Colony",
    requiredVisitors: 0,
    appeal: 6,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "wood_fence",
    minFenceCount: 1,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 18 },
      { resource_id: "vegetables", label: "Vegetables", amount: 4 },
      { resource_id: "water", label: "Water", amount: 2 },
    ],
  },
  {
    kind: "tortoise_group",
    label: "Tortoise Group",
    requiredVisitors: 10,
    appeal: 10,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "wood_fence",
    minFenceCount: 2,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 28 },
      { resource_id: "vegetables", label: "Vegetables", amount: 8 },
      { resource_id: "medicine", label: "Medicine", amount: 2 },
    ],
  },
  {
    kind: "zebra_herd",
    label: "Zebra Herd",
    requiredVisitors: 20,
    appeal: 14,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "wood_fence",
    minFenceCount: 2,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 40 },
      { resource_id: "animal_feed", label: "Animal Feed", amount: 8 },
      { resource_id: "water", label: "Water", amount: 4 },
    ],
  },
  {
    kind: "flamingo_flock",
    label: "Flamingo Flock",
    requiredVisitors: 32,
    appeal: 18,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "glass_barrier",
    minFenceCount: 1,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 56 },
      { resource_id: "fish", label: "Fish", amount: 12 },
      { resource_id: "water", label: "Water", amount: 10 },
    ],
  },
  {
    kind: "parrot_pair",
    label: "Parrot Pair",
    requiredVisitors: 48,
    appeal: 22,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "glass_barrier",
    minFenceCount: 2,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 72 },
      { resource_id: "animal_feed", label: "Animal Feed", amount: 10 },
      { resource_id: "research_points", label: "Research", amount: 4 },
    ],
  },
  {
    kind: "wolf_pack",
    label: "Wolf Pack",
    requiredVisitors: 68,
    appeal: 28,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "steel_fence",
    minFenceCount: 1,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 92 },
      { resource_id: "meat", label: "Meat", amount: 14 },
      { resource_id: "water", label: "Water", amount: 6 },
    ],
  },
  {
    kind: "lion_pride",
    label: "Lion Pride",
    requiredVisitors: 90,
    appeal: 34,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "steel_fence",
    minFenceCount: 2,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 116 },
      { resource_id: "meat", label: "Meat", amount: 18 },
      { resource_id: "water", label: "Water", amount: 8 },
    ],
  },
  {
    kind: "gorilla_troop",
    label: "Gorilla Troop",
    requiredVisitors: 115,
    appeal: 42,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "steel_fence",
    minFenceCount: 3,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 138 },
      { resource_id: "vegetables", label: "Vegetables", amount: 14 },
      { resource_id: "animal_feed", label: "Animal Feed", amount: 8 },
      { resource_id: "medicine", label: "Medicine", amount: 6 },
    ],
  },
  {
    kind: "elephant_herd",
    label: "Elephant Herd",
    requiredVisitors: 145,
    appeal: 52,
    animalAreaKind: "animal_area",
    minLevel: 1,
    fenceKind: "steel_fence",
    minFenceCount: 4,
    purchaseCost: [
      { resource_id: "coins", label: "Coins", amount: 172 },
      { resource_id: "vegetables", label: "Vegetables", amount: 24 },
      { resource_id: "water", label: "Water", amount: 18 },
      { resource_id: "medicine", label: "Medicine", amount: 8 },
    ],
  },
];
const animalSpeciesByKind = Object.fromEntries(
  animalSpeciesCatalog.map((species) => [species.kind, species]),
);
const animalVisualProfiles = {
  rabbit_colony: { color: 0xe9dcc9, scale: 0.44, behavior: "Scampering" },
  tortoise_group: { color: 0x6f7d5a, scale: 0.54, behavior: "Sunbathing" },
  zebra_herd: { color: 0xd8d3c5, scale: 0.68, behavior: "Grazing" },
  flamingo_flock: { color: 0xef9bb1, scale: 0.58, behavior: "Wading" },
  parrot_pair: { color: 0x6cbc65, scale: 0.5, behavior: "Perching" },
  wolf_pack: { color: 0x7b746c, scale: 0.7, behavior: "Pacing" },
  lion_pride: { color: 0x9b7a52, scale: 0.78, behavior: "Resting" },
  gorilla_troop: { color: 0x58514c, scale: 0.84, behavior: "Foraging" },
  elephant_herd: { color: 0x8f8f92, scale: 0.98, behavior: "Roaming" },
};

const buildings = [
  {
    id: "keeper_kitchen",
    label: "Keeper Kitchen",
    position: [-3.5, 0, -1],
    size: [1.55, 1.15],
    requiredWorkers: 1,
    resourceOutput: { animal_feed: 18 },
    details: {
      Role: "Turns vegetables into animal feed",
      Output: "18 feed per batch",
    },
  },
  {
    id: "savanna_habitat",
    label: "Savanna Habitat",
    position: [1.5, 0, -1],
    size: [3.6, 2.55],
    requiredWorkers: 2,
    resourceOutput: {
      visitors: 14,
      conservation_points: 2,
      research_points: 2,
    },
    details: {
      Role: "Creates visitors and conservation",
      Output: "14 visitors and 2 conservation",
    },
  },
  {
    id: "ticket_booth",
    label: "Ticket Booth",
    position: [-1.5, 0, 3],
    size: [1.1, 0.95],
    requiredWorkers: 1,
    resourceOutput: {
      coins: 70,
      reputation: 1,
    },
    details: {
      Role: "Converts visitors into coins",
      Output: "70 coins per rush",
    },
  },
  {
    id: "feed_shed",
    label: "Feed Shed",
    position: [-4.5, 0, 2],
    size: [1.3, 0.95],
    requiredWorkers: 0,
    resourceOutput: {},
    details: {
      Role: "Expands animal feed storage",
      Output: "+60 feed capacity",
    },
  },
  {
    id: "guest_plaza",
    label: "Guest Plaza",
    position: [3.5, 0, 3],
    size: [1.8, 1.25],
    requiredWorkers: 0,
    resourceOutput: {},
    details: {
      Role: "Expands visitor capacity",
      Output: "+30 visitor capacity",
    },
  },
  {
    id: "customer_entry",
    kind: "customer_entry",
    label: "Customer Entry",
    position: [0, 0, 4],
    size: [0.8, 0.9],
    requiredWorkers: 0,
    resourceOutput: {},
    details: {
      Role: "Main park entrance",
      Output: "Guides guests into the zoo",
    },
  },
];

const buildCatalog = buildingManifest.map((building) => ({
  ...building,
  details: {
    ...(building.details ?? {}),
    Category: building.category,
    Staffing: staffingLabel(building.requiredWorkers),
    Source: building.gltf ? "GLTF asset" : "Procedural asset",
  },
}));
const BUILD_OPTION_HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "q", "w", "e", "r", "t", "y", "u"];
const BUILD_TOOL_HOTKEYS = {
  openMenu: "b",
  path: "p",
  area: "a",
  fence: "f",
  confirm: "enter",
  cancel: "escape",
};
const SELECTION_ACTION_HOTKEYS = {
  assignWorker: "a",
  commandWorker: "m",
};
const CONTEXT_MENU_HOTKEYS = {
  inspect: "i",
  build: "b",
  assignWorker: "a",
  resetView: "v",
};
const GLOBAL_HOTKEYS = {
  resetView: "v",
};
const ANIMAL_DRAG_THRESHOLD = 10;

const PATH_TILE_SIZE = 1;
const PATH_TILE_VISUAL_SIZE = 0.82;
const PATH_TILE_EPSILON = 1e-6;
const INITIAL_GRID_COLUMNS = 12;
const INITIAL_GRID_ROWS = 9;
const LAND_EXPANSION_COLUMNS = 2;
const LAND_EXPANSION_ROWS = 2;
const LAND_PURCHASE_BASE_COST = 120;
const LAND_PURCHASE_COST_STEP = 60;

let gridColumns = INITIAL_GRID_COLUMNS;
let gridRows = INITIAL_GRID_ROWS;
let playableArea = createPlayableArea(gridColumns, gridRows);

function createPlayableArea(columns, rows) {
  return {
    width: columns * PATH_TILE_SIZE,
    depth: rows * PATH_TILE_SIZE,
    minX: -6,
    maxX: -6 + columns * PATH_TILE_SIZE,
    minZ: -4.5,
    maxZ: -4.5 + rows * PATH_TILE_SIZE,
  };
}

function parkEntryBuildingPosition() {
  return [PARK_ENTRY_X, 0, playableArea.maxZ - PARK_ENTRY_BUILDING_OFFSET];
}

function parkEntryGateZ() {
  return playableArea.maxZ;
}

function parkEntrySpawnZ() {
  return playableArea.maxZ + 1.35;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x98c7d5);
scene.fog = new THREE.Fog(0x98c7d5, 13, 28);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
const defaultCamera = {
  position: new THREE.Vector3(6.5, 8.1, 8.6),
  target: new THREE.Vector3(0, 0, 0.4),
};
camera.position.copy(defaultCamera.position);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pathTileGeometry = new THREE.BoxGeometry(PATH_TILE_VISUAL_SIZE, 0.045, PATH_TILE_VISUAL_SIZE);
const areaTileGeometry = new THREE.BoxGeometry(0.9, 0.035, 0.9);
const pathPreviewValidMaterial = new THREE.MeshBasicMaterial({
  color: 0xe1b44f,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
});
const pathPreviewInvalidMaterial = new THREE.MeshBasicMaterial({
  color: 0xd66b7a,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const areaPreviewValidMaterial = new THREE.MeshBasicMaterial({
  color: 0x6caa43,
  transparent: true,
  opacity: 0.46,
  depthWrite: false,
});
const areaPreviewInvalidMaterial = new THREE.MeshBasicMaterial({
  color: 0xd66b7a,
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
});
const fencePreviewValidMaterial = new THREE.MeshBasicMaterial({
  color: 0xa78358,
  transparent: true,
  opacity: 0.74,
  depthWrite: false,
});
const fencePreviewInvalidMaterial = new THREE.MeshBasicMaterial({
  color: 0xd66b7a,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});
const playerPathMaterial = new THREE.MeshStandardMaterial({
  color: 0xc7b889,
  roughness: 0.86,
});
const playerAreaMaterial = new THREE.MeshStandardMaterial({
  color: 0x5f9445,
  roughness: 0.95,
  transparent: true,
  opacity: 0.62,
});
const playerFenceRailMaterial = new THREE.MeshStandardMaterial({
  color: 0x8a6646,
  roughness: 0.88,
});
const playerFencePostMaterial = new THREE.MeshStandardMaterial({
  color: 0x614630,
  roughness: 0.9,
});
const selectionRouteMaterial = new THREE.LineBasicMaterial({
  color: 0xf7f1d7,
  transparent: true,
  opacity: 0.92,
  depthTest: false,
});
const selectionRouteTargetMaterial = new THREE.MeshBasicMaterial({
  color: 0xe1b44f,
  transparent: true,
  opacity: 0.98,
  depthTest: false,
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.47;
controls.screenSpacePanning = false;
controls.target.copy(defaultCamera.target);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectable = [];
const buildingMeshes = new Map();
const visitorGroups = [];
const animals = [];
const workers = [];
const resourceRows = new Map();
const buildOptionButtons = new Map();
const fenceOptionButtons = new Map();
const playerPlacedBuildings = [];
const localAnimalGroups = [];
const localAnimalAreaUnlocks = new Set(["rabbit_colony"]);
const localResourceSpend = Object.create(null);
const settings = {
  speedMultiplier: Number(simSpeedEl.value),
  motionEffects: motionEffectsEl.checked,
  shadows: shadowToggleEl.checked,
};
const landState = {
  purchases: 0,
  coinsSpent: 0,
};
const pricing = {
  entryFee: Number(entryFeeEl?.value ?? DEFAULT_ENTRY_FEE),
};
const PARK_ENTRY_X = -0.5;
const PARK_ENTRY_PATH_Z = 2.55;
const PARK_ENTRY_BUILDING_OFFSET = 0.45;
const PARK_ENTRY_GATE_WIDTH = 1.8;
const VISITOR_ENTRY_INTERVAL_SECONDS = 4;
const VISITOR_ENTRY_TRAVEL_SECONDS = 11;
const VISITOR_WALK_SPEED = 0.7;
const VISITOR_RECENCY_SECONDS = 70;
const VISITOR_RECENT_VISIT_MIN_MULTIPLIER = 0.16;
const VISITOR_INTEREST_THRESHOLD = 6;
const VISITOR_REENTRY_AFTER_EXIT_SECONDS = 45;
const buildingManifestByKind = Object.fromEntries(
  buildingManifest.map((building) => [building.kind, building]),
);
const selectionRoute = new THREE.Line(new THREE.BufferGeometry(), selectionRouteMaterial);
selectionRoute.renderOrder = 20;
selectionRoute.visible = false;
const selectionRouteTarget = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 14, 10),
  selectionRouteTargetMaterial,
);
selectionRouteTarget.renderOrder = 21;
selectionRouteTarget.visible = false;
scene.add(selectionRoute, selectionRouteTarget);

let currentTime = 0;
let selectedElement = null;
let selectedRoot = null;
let simulationStarted = false;
let hasStartedGame = false;
let lastFrame = performance.now();
let settingsTriggerEl = null;
let wikiTriggerEl = null;
let placementSurface = null;
let boardGround = null;
let boardSurroundings = null;
let boardGridGroup = null;
let boundaryFenceGroup = null;
let perimeterSceneryGroup = null;
let placementPreview = null;
let placementPreviewMaterial = null;
let activeBuildItem = null;
let placementValid = false;
let placedBuildingCount = 0;
let activePathTool = false;
let pathDrawing = false;
let pathDraftTiles = [];
let pathPreviewGroup = null;
let pathPreviewValid = false;
let playerPathCount = 0;
let activeAreaTool = false;
let areaDrawing = false;
let areaAnchorTile = null;
let areaDraftTiles = [];
let areaPreviewGroup = null;
let areaPreviewValid = false;
let playerAreaCount = 0;
let activeFenceTool = false;
let activeFenceKind = "wood_fence";
let fenceDrawing = false;
let fenceAnchorTile = null;
let fenceDraftTiles = [];
let fencePreviewGroup = null;
let fencePreviewValid = false;
let playerFenceCount = 0;
let localAnimalCount = 0;
let spawnedWorkerCount = 0;
let contextMenuSelection = null;
let contextMenuRoot = null;
let activeWorkerCommand = null;
let activeAnimalDrag = null;
let longPressTimer = null;
let longPressStart = null;
let nextVisitorEntryTime = 0;
let lastVisitorUpdateTime = 0;
const pathTileKeys = new Set();
const playerAreaTileKeys = new Set();
const playerFenceSegmentKeys = new Set();
const playerFenceSegments = [];
const zooClient = createZooClient();
let serverSession = null;

setupLights();
createBoard();
createBuildings();
createVisitors();
createResourceRows();
createBuildOptions();
createFenceOptions();
populateWiki();
updatePathBuilderUi();
updateState(0);
const defaultSelectionRoot = buildingMeshes.get(buildings[1].id);
selectElement(defaultSelectionRoot.userData.selectionInfo, defaultSelectionRoot);
setMenuOpen(true);
resize();
installTestApi();
animate(lastFrame);

window.addEventListener("resize", resize);
window.addEventListener("resize", hideContextMenu);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
canvas.addEventListener("pointerleave", () => {
  if (placementPreview) placementPreview.visible = false;
  if (pathDrawing) finishPathDraft();
  if (areaDrawing) finishAreaDraft();
  if (fenceDrawing) finishFenceDraft();
  cancelLongPress();
});
canvas.addEventListener("contextmenu", onContextMenu);
document.addEventListener("pointerdown", (event) => {
  if (
    contextMenuEl.getAttribute("aria-hidden") === "true" ||
    event.target === canvas ||
    contextMenuEl.contains(event.target)
  ) {
    return;
  }
  hideContextMenu();
});

startZooEl.addEventListener("click", startZoo);
buildMenuToggleEl.addEventListener("click", toggleBuildMenu);
closeBuildMenuEl.addEventListener("click", closeBuildMenu);
mainMenuToggleEl.addEventListener("click", showMainMenu);
buyLandEl.addEventListener("click", buyLand);
drawPathEl.addEventListener("click", startPathBuilder);
confirmPathEl.addEventListener("click", confirmPathDraft);
cancelPathEl.addEventListener("click", cancelMapBuilder);
drawAreaEl.addEventListener("click", startAreaBuilder);
confirmAreaEl.addEventListener("click", confirmAreaDraft);
drawFenceEl.addEventListener("click", startFenceBuilder);
confirmFenceEl.addEventListener("click", confirmFenceDraft);
contextMenuInspectEl.addEventListener("click", inspectContextMenuSelection);
contextMenuBuildEl.addEventListener("click", () => {
  hideContextMenu();
  openBuildMenu();
});
contextMenuWorkerEl.addEventListener("click", () => {
  const building = contextMenuSelection?.building;
  hideContextMenu();
  if (building) spawnWorkerForBuilding(building);
});
contextMenuResetEl.addEventListener("click", () => {
  hideContextMenu();
  resetCamera();
});
for (const button of openSettingsEls) {
  button.addEventListener("click", openSettings);
}
for (const button of openWikiEls) {
  button.addEventListener("click", openWiki);
}
closeSettingsEl.addEventListener("click", closeSettings);
closeWikiEl.addEventListener("click", closeWiki);
settingsPanelEl.addEventListener("pointerdown", (event) => {
  if (event.target === settingsPanelEl) closeSettings();
});
wikiPanelEl.addEventListener("pointerdown", (event) => {
  if (event.target === wikiPanelEl) closeWiki();
});

simSpeedEl.addEventListener("input", () => {
  settings.speedMultiplier = Number(simSpeedEl.value);
  simSpeedValueEl.textContent = formatSpeed(settings.speedMultiplier);
});

entryFeeEl.addEventListener("input", () => {
  setEntryFee(Number(entryFeeEl.value));
});

entryFeeEl.addEventListener("change", () => {
  syncEntryFeeToServer();
});

motionEffectsEl.addEventListener("change", () => {
  settings.motionEffects = motionEffectsEl.checked;
  if (!settings.motionEffects) resetAnimatedObjects();
});

shadowToggleEl.addEventListener("change", () => {
  settings.shadows = shadowToggleEl.checked;
  renderer.shadowMap.enabled = settings.shadows;
});

resetViewEl.addEventListener("click", resetCamera);
configureHotkeyLabels();
installHotkeys(zooHotkeyBindings);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && contextMenuEl.getAttribute("aria-hidden") !== "true") {
    hideContextMenu();
    return;
  }
  if (event.key === "Escape" && activeAnimalDrag) {
    cancelAnimalDrag();
    return;
  }
  if (event.key === "Escape" && activeWorkerCommand) {
    cancelWorkerCommand();
    return;
  }
  if (event.key === "Escape" && activeBuildItem) {
    cancelPlacement();
    return;
  }
  if (event.key === "Escape" && activePathTool) {
    cancelPathBuilder();
    return;
  }
  if (event.key === "Escape" && activeAreaTool) {
    cancelAreaBuilder();
    return;
  }
  if (event.key === "Escape" && activeFenceTool) {
    cancelFenceBuilder();
    return;
  }
  if (event.key === "Escape" && buildMenuEl.getAttribute("aria-hidden") !== "true") {
    closeBuildMenu();
    return;
  }
  if (event.key === "Escape" && wikiPanelEl.getAttribute("aria-hidden") !== "true") {
    closeWiki();
    return;
  }
  if (event.key === "Escape" && settingsPanelEl.getAttribute("aria-hidden") !== "true") {
    closeSettings();
  }
});

function startZoo() {
  hideContextMenu();
  cancelWorkerCommand();
  cancelAnimalDrag();
  closeSettings();
  closeWiki();
  closeBuildMenu();
  if (!hasStartedGame) {
    currentTime = 0;
    updateState(currentTime);
    connectServerWorld();
  }
  hasStartedGame = true;
  simulationStarted = true;
  setMenuOpen(false);
  updateMainMenu();
}

async function connectServerWorld() {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = "Sync: checking server";
  try {
    const world = await zooClient.createWorld(["player-1"]);
    const player = world.players[0];
    serverSession = {
      worldId: world.world_id,
      playerId: player.player_id,
      version: world.version,
      checksum: player.checksum,
      entryBuildingId: player.view.buildings.find((building) => building.kind === "customer_entry")
        ?.id,
    };
    syncStatusEl.textContent = `Sync: server v${serverSession.version}`;
  } catch (error) {
    serverSession = null;
    syncStatusEl.textContent = "Sync: local demo";
  }
}

function showMainMenu() {
  hideContextMenu();
  cancelWorkerCommand();
  cancelAnimalDrag();
  closeSettings();
  closeWiki();
  closeBuildMenu();
  simulationStarted = false;
  setMenuOpen(true);
  updateMainMenu();
  startZooEl.focus();
}

function setMenuOpen(open) {
  if (open) {
    hideContextMenu();
    cancelWorkerCommand();
  }
  mainMenuEl.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("is-menu-open", open);
  for (const element of gameplayEls) {
    element.inert = open;
  }
  updateMainMenu();
}

function openSettings(event) {
  hideContextMenu();
  cancelWorkerCommand();
  cancelAnimalDrag();
  closeBuildMenu();
  closeWiki();
  settingsTriggerEl = event.currentTarget;
  settingsPanelEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-settings-open");
  closeSettingsEl.focus();
}

function closeSettings() {
  if (settingsPanelEl.getAttribute("aria-hidden") === "true") return;
  settingsPanelEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-settings-open");
  if (settingsTriggerEl?.isConnected) settingsTriggerEl.focus();
  settingsTriggerEl = null;
}

function openWiki(event) {
  hideContextMenu();
  cancelWorkerCommand();
  cancelAnimalDrag();
  closeBuildMenu();
  closeSettings();
  wikiTriggerEl = event.currentTarget;
  wikiPanelEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-wiki-open");
  closeWikiEl.focus();
}

function closeWiki() {
  if (wikiPanelEl.getAttribute("aria-hidden") === "true") return;
  wikiPanelEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-wiki-open");
  if (wikiTriggerEl?.isConnected) wikiTriggerEl.focus();
  wikiTriggerEl = null;
}

function toggleBuildMenu() {
  if (buildMenuEl.getAttribute("aria-hidden") === "true") {
    openBuildMenu();
  } else {
    closeBuildMenu();
  }
}

function openBuildMenu() {
  hideContextMenu();
  cancelWorkerCommand();
  cancelAnimalDrag();
  closeSettings();
  buildMenuEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-build-menu-open");
  buildMenuToggleEl.setAttribute("aria-pressed", "true");
  updateBuildOptionStyles();
}

function closeBuildMenu() {
  if (buildMenuEl.getAttribute("aria-hidden") === "true") return;
  cancelPlacement();
  cancelPathBuilder({ resetStatus: false });
  cancelAreaBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
  buildMenuEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-build-menu-open");
  buildMenuToggleEl.setAttribute("aria-pressed", "false");
}

function updateMainMenu() {
  const nextLabel = hasStartedGame ? "Continue Game" : "Start Game";
  startZooLabelEl.textContent = nextLabel;
  startZooEl.setAttribute("aria-label", nextLabel);
  mainMenuSummaryEl.textContent = hasStartedGame
    ? `Paused at ${Math.floor(currentTime)}s. Continue your zoo, adjust settings, or browse the wiki.`
    : "Start a new zoo run, adjust settings, or browse the zoo wiki.";
}

function populateWiki() {
  const sections = [
    {
      title: "Getting Started",
      description: "The current zoo loop in one screen.",
      cards: [
        {
          title: "Core Loop",
          summary:
            "Place guest and staff buildings, keep habitats staffed, and expand once demand and resources support it.",
          meta: "Use the build menu to place structures and map tools.",
        },
        {
          title: "Entry Fees",
          summary:
            "Higher ticket prices raise coin income, but they also push down demand when visitors are not willing to pay.",
          meta: "Tune the entry fee slider while watching willingness and demand.",
        },
        {
          title: "Expansion",
          summary:
            "Animal areas need enough visitors and the right fencing before you can add more valuable species.",
          meta: "Buy land, draw paths, define areas, and build fences from the build menu.",
        },
      ],
    },
    {
      title: "Resources",
      description: "Starting stock and storage limits for the current run.",
      cards: resourceManifest.map((resource) => {
        const startingValue = baseResourceState.values[resource.id] ?? 0;
        const capacity = baseResourceState.capacities[resource.id];
        return {
          title: resource.label,
          summary: resource.description,
          meta: capacity ? `Start ${startingValue} • Cap ${capacity}` : `Start ${startingValue}`,
        };
      }),
    },
    {
      title: "Buildings",
      description: "Every placeable or starter structure in the current build catalog.",
      cards: buildCatalog.map((building) => ({
        title: building.label,
        summary:
          building.details?.Role ??
          `${buildingCategoryLabels[building.category] ?? "Zoo"} structure for the management loop.`,
        meta: `${buildingCategoryLabels[building.category] ?? "Zoo"} • ${building.cost} • ${staffingLabel(building.requiredWorkers)}`,
      })),
    },
    {
      title: "Animal Groups",
      description: "Unlock requirements, appeal, and enclosure needs for each species group.",
      cards: animalSpeciesCatalog.map((species) => ({
        title: species.label,
        summary: `Cost: ${species.purchaseCost.map((item) => `${item.amount} ${item.label}`).join(", ")}.`,
        meta: `Unlock ${species.requiredVisitors} visitors • Appeal ${species.appeal} • ${fenceLabels[species.fenceKind]} x${species.minFenceCount}`,
      })),
    },
  ];

  const fragment = document.createDocumentFragment();

  for (const section of sections) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "wiki-section";

    const headerEl = document.createElement("div");
    headerEl.className = "wiki-section-header";

    const titleEl = document.createElement("h3");
    titleEl.textContent = section.title;

    const descriptionEl = document.createElement("p");
    descriptionEl.textContent = section.description;

    headerEl.append(titleEl, descriptionEl);

    const cardGridEl = document.createElement("div");
    cardGridEl.className = "wiki-card-grid";

    for (const card of section.cards) {
      const cardEl = document.createElement("article");
      cardEl.className = "wiki-card";

      const cardTitleEl = document.createElement("h4");
      cardTitleEl.textContent = card.title;

      const cardSummaryEl = document.createElement("p");
      cardSummaryEl.textContent = card.summary;

      const cardMetaEl = document.createElement("p");
      cardMetaEl.className = "wiki-card-meta";
      cardMetaEl.textContent = card.meta;

      cardEl.append(cardTitleEl, cardSummaryEl, cardMetaEl);
      cardGridEl.append(cardEl);
    }

    sectionEl.append(headerEl, cardGridEl);
    fragment.append(sectionEl);
  }

  wikiSectionsEl.replaceChildren(fragment);
}

function configureHotkeyLabels() {
  setButtonLabelWithHotkey(drawPathEl, "Draw Path", BUILD_TOOL_HOTKEYS.path);
  setButtonLabelWithHotkey(confirmPathEl, "Confirm Path", BUILD_TOOL_HOTKEYS.confirm);
  setButtonLabelWithHotkey(cancelPathEl, "Cancel", BUILD_TOOL_HOTKEYS.cancel);
  setButtonLabelWithHotkey(drawAreaEl, "Define Area", BUILD_TOOL_HOTKEYS.area);
  setButtonLabelWithHotkey(confirmAreaEl, "Confirm Area", BUILD_TOOL_HOTKEYS.confirm);
  setButtonLabelWithHotkey(drawFenceEl, "Build Fence", BUILD_TOOL_HOTKEYS.fence);
  setButtonLabelWithHotkey(confirmFenceEl, "Confirm Fence", BUILD_TOOL_HOTKEYS.confirm);
  setButtonLabelWithHotkey(contextMenuInspectEl, "Inspect", CONTEXT_MENU_HOTKEYS.inspect);
  setButtonLabelWithHotkey(contextMenuBuildEl, "Build", CONTEXT_MENU_HOTKEYS.build);
  setButtonLabelWithHotkey(contextMenuWorkerEl, "Assign Worker", CONTEXT_MENU_HOTKEYS.assignWorker);
  setButtonLabelWithHotkey(contextMenuResetEl, "Reset View", CONTEXT_MENU_HOTKEYS.resetView);
  buildMenuToggleEl.setAttribute("aria-keyshortcuts", "B");
  buildMenuToggleEl.setAttribute("title", "Place building (B)");
  resetViewEl.setAttribute("aria-keyshortcuts", "V");
  resetViewEl.setAttribute("title", "Reset camera (V)");
}

function zooHotkeyBindings() {
  const bindings = [];

  if (buildMenuIsOpen()) {
    bindings.push(
      {
        key: BUILD_TOOL_HOTKEYS.openMenu,
        run: closeBuildMenu,
      },
      {
        key: BUILD_TOOL_HOTKEYS.path,
        run: startPathBuilder,
      },
      {
        key: BUILD_TOOL_HOTKEYS.area,
        run: startAreaBuilder,
      },
      {
        key: BUILD_TOOL_HOTKEYS.fence,
        run: startFenceBuilder,
      },
      {
        key: BUILD_TOOL_HOTKEYS.confirm,
        enabled: activeBuildConfirmationReady,
        run: confirmActiveBuildTool,
      },
    );

    for (const [index, item] of buildCatalog.entries()) {
      const hotkey = BUILD_OPTION_HOTKEYS[index];
      if (!hotkey) continue;
      bindings.push({
        key: hotkey,
        run: () => setPlacementItem(item),
      });
    }
  } else {
    bindings.push({
      key: BUILD_TOOL_HOTKEYS.openMenu,
      run: openBuildMenu,
    });
  }

  if (contextMenuIsOpen()) {
    bindings.push(
      {
        key: CONTEXT_MENU_HOTKEYS.inspect,
        enabled: () => Boolean(contextMenuSelection),
        run: inspectContextMenuSelection,
      },
      {
        key: CONTEXT_MENU_HOTKEYS.build,
        run: () => {
          hideContextMenu();
          openBuildMenu();
        },
      },
      {
        key: CONTEXT_MENU_HOTKEYS.assignWorker,
        enabled: () =>
          Boolean(contextMenuSelection?.building && canAssignWorkerToBuilding(contextMenuSelection.building)),
        run: () => {
          const building = contextMenuSelection?.building;
          hideContextMenu();
          if (building) spawnWorkerForBuilding(building);
        },
      },
      {
        key: CONTEXT_MENU_HOTKEYS.resetView,
        run: () => {
          hideContextMenu();
          resetCamera();
        },
      },
    );
  }

  if (!buildMenuIsOpen() && selectedElement?.building) {
    bindings.push({
      key: SELECTION_ACTION_HOTKEYS.assignWorker,
      enabled: () => canAssignWorkerToBuilding(selectedElement.building),
      run: () => spawnWorkerForBuilding(selectedElement.building),
    });
  }

  if (!buildMenuIsOpen() && selectedElement?.worker) {
    bindings.push({
      key: SELECTION_ACTION_HOTKEYS.commandWorker,
      run: () => startWorkerCommand(selectedElement.worker),
    });
  }

  bindings.push({
    key: GLOBAL_HOTKEYS.resetView,
    run: resetCamera,
  });

  return bindings;
}

function buildMenuIsOpen() {
  return buildMenuEl.getAttribute("aria-hidden") !== "true";
}

function contextMenuIsOpen() {
  return contextMenuEl.getAttribute("aria-hidden") !== "true";
}

function activeBuildConfirmationReady() {
  return pathPreviewValid || areaPreviewValid || fencePreviewValid;
}

function confirmActiveBuildTool() {
  if (pathPreviewValid) {
    confirmPathDraft();
    return;
  }
  if (areaPreviewValid) {
    confirmAreaDraft();
    return;
  }
  if (fencePreviewValid) {
    confirmFenceDraft();
  }
}

function resetCamera() {
  camera.position.copy(defaultCamera.position);
  controls.target.copy(defaultCamera.target);
  clampCameraToPlayableArea();
}

function setPlacementItem(item) {
  openBuildMenu();
  cancelPathBuilder({ resetStatus: false });
  cancelAreaBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
  activeBuildItem = item;
  placementValid = false;
  createPlacementPreview(item);
  buildMenuStatusEl.textContent = "Click a clear tile to place.";
  updateBuildOptionStyles();
}

function cancelPlacement() {
  activeBuildItem = null;
  placementValid = false;
  if (placementPreview) placementPreview.visible = false;
  buildMenuStatusEl.textContent = "Choose a building or map tool.";
  updateBuildOptionStyles();
}

function updateBuildOptionStyles() {
  for (const [kind, button] of buildOptionButtons) {
    button.classList.toggle("is-selected", activeBuildItem?.kind === kind);
    button.setAttribute("aria-pressed", String(activeBuildItem?.kind === kind));
  }
}

function updateLandPurchaseUi(resourceState = currentResourceState()) {
  const cost = landPurchaseCost();
  const availableCoins = resourceState.values.coins ?? 0;
  buyLandEl.textContent = `Buy Land for ${formatMoney(cost)}`;
  buyLandEl.disabled = availableCoins < cost;
  buyLandEl.setAttribute(
    "aria-label",
    `Buy more land for ${formatMoney(cost)} and expand the zoo to ${gridColumns + LAND_EXPANSION_COLUMNS} by ${
      gridRows + LAND_EXPANSION_ROWS
    } tiles`,
  );
}

function buyLand() {
  const resourceState = currentResourceState();
  const cost = landPurchaseCost();
  const availableCoins = resourceState.values.coins ?? 0;

  if (availableCoins < cost) {
    buildMenuStatusEl.textContent = `Need ${formatMoney(cost)} to buy more land.`;
    updateLandPurchaseUi(resourceState);
    return;
  }

  cancelPlacement();
  cancelPathBuilder({ resetStatus: false });
  cancelAreaBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
  landState.purchases += 1;
  landState.coinsSpent += cost;
  setPlayableAreaSize(gridColumns + LAND_EXPANSION_COLUMNS, gridRows + LAND_EXPANSION_ROWS);
  refreshPlayableAreaGeometry();
  updateState(currentTime);
  buildMenuStatusEl.textContent = `Zoo grounds expanded to ${playableAreaFootprintLabel()} for ${formatMoney(cost)}.`;
}

function formatSpeed(value) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}x`;
}

function setEntryFee(value) {
  pricing.entryFee = THREE.MathUtils.clamp(Math.round(Number(value) || 0), 0, 80);
  entryFeeEl.value = String(pricing.entryFee);
  updateState(currentTime);
}

async function syncEntryFeeToServer() {
  if (!serverSession?.entryBuildingId) return;
  try {
    const response = await zooClient.applyCommand(
      serverSession.worldId,
      serverSession.playerId,
      serverSession.version,
      {
        SetBuildingStat: {
          building: serverSession.entryBuildingId,
          stat: "entry_fee",
          value: pricing.entryFee,
        },
      },
    );
    serverSession.version = response.version;
    serverSession.checksum = response.checksum;
    syncStatusEl.textContent = `Sync: server v${serverSession.version}`;
  } catch (error) {
    serverSession = null;
    syncStatusEl.textContent = "Sync: local demo";
  }
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xf8fff8, 0x4f6549, 1.85));

  const sun = new THREE.DirectionalLight(0xfff1c4, 2.65);
  sun.position.set(-5, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  scene.add(sun);
}

function createBoard() {
  boardSurroundings = new THREE.Mesh(
    new THREE.BoxGeometry(playableArea.width + 12, 0.16, playableArea.depth + 10),
    new THREE.MeshStandardMaterial({ color: 0x6f9d55, roughness: 1 }),
  );
  boardSurroundings.position.y = -0.28;
  boardSurroundings.receiveShadow = true;
  scene.add(boardSurroundings);

  boardGround = new THREE.Mesh(
    new THREE.BoxGeometry(playableArea.width, 0.22, playableArea.depth),
    new THREE.MeshStandardMaterial({ color: 0x77a859, roughness: 0.9 }),
  );
  boardGround.position.y = -0.14;
  boardGround.receiveShadow = true;
  scene.add(boardGround);
  placementSurface = boardGround;
  tagSelectable(
    boardGround,
    createTerrainInfo(),
  );

  boardGridGroup = new THREE.Group();
  boundaryFenceGroup = new THREE.Group();
  perimeterSceneryGroup = new THREE.Group();
  scene.add(boardGridGroup, boundaryFenceGroup, perimeterSceneryGroup);

  const garden = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 36),
    new THREE.MeshStandardMaterial({ color: 0x5f9445, roughness: 1 }),
  );
  garden.rotation.x = -Math.PI / 2;
  garden.position.set(0, 0.005, 2.05);
  garden.receiveShadow = true;
  scene.add(garden);
  tagSelectable(
    garden,
    createStaticInfo({
      id: "landmark-central-garden",
      label: "Central Garden",
      category: "Landmark",
      summary: "A guest-facing green space in the middle of the path loop.",
      details: {
        Role: "Decoration",
        Status: "Open",
      },
    }),
  );

  addPathSegment("Entry Path", PARK_ENTRY_X, 3.55, 0.72, 2.1);
  addPathSegment("Main Guest Path", 0, 2.55, 8.6, 0.72);
  addPathSegment("Kitchen Path", -2.2, 0.45, 0.72, 4.2);
  addPathSegment("Habitat Path", 1.75, 0.35, 0.72, 4.45);
  addPathSegment("Feed Shed Path", -3.5, 2.4, 2.3, 0.72);
  addPathSegment("Plaza Path", 3.05, 2.4, 2.55, 0.72);

  refreshPlayableAreaGeometry();
}

function createTerrainInfo() {
  return {
    id: "terrain-zoo-grounds",
    label: "Zoo Grounds",
    category: "Terrain",
    summary: "The playable board that holds paths, buildings, habitats, and new land deeds.",
    getDetails: () => ({
      Type: "Terrain",
      Footprint: playableAreaFootprintLabel(),
      Expansion: `${landState.purchases} purchase${landState.purchases === 1 ? "" : "s"}`,
      "Next Land Cost": formatMoney(landPurchaseCost()),
      Role: "Build surface",
    }),
  };
}

function createBoundaryFenceInfo() {
  return {
    id: "boundary-fence",
    label: "Zoo Fence",
    category: "Boundary",
    summary: "A perimeter fence that moves outward when the zoo buys more land.",
    getDetails: () => ({
      Type: "Boundary",
      Footprint: playableAreaFootprintLabel(),
      Expansion: `${landState.purchases} purchase${landState.purchases === 1 ? "" : "s"}`,
      "Next Land Cost": formatMoney(landPurchaseCost()),
      Role: "Boundary",
    }),
  };
}

function playableAreaFootprintLabel() {
  return `${gridColumns} x ${gridRows} tiles`;
}

function landPurchaseCost() {
  return LAND_PURCHASE_BASE_COST + landState.purchases * LAND_PURCHASE_COST_STEP;
}

function setPlayableAreaSize(columns, rows) {
  gridColumns = columns;
  gridRows = rows;
  playableArea = createPlayableArea(columns, rows);
}

function refreshPlayableAreaGeometry() {
  boardSurroundings.geometry.dispose();
  boardSurroundings.geometry = new THREE.BoxGeometry(
    playableArea.width + 12,
    0.16,
    playableArea.depth + 10,
  );

  boardGround.geometry.dispose();
  boardGround.geometry = new THREE.BoxGeometry(playableArea.width, 0.22, playableArea.depth);

  rebuildTileGrid();
  rebuildBoundaryFence();
  rebuildPerimeterScenery();
  refreshParkEntryBuilding();
  controls.maxDistance = Math.max(18, Math.max(playableArea.width, playableArea.depth) * 2.2);
  updateSelectionStyles();
}

function refreshParkEntryBuilding() {
  const entry = buildings.find((building) => (building.kind ?? building.id) === "customer_entry");
  if (!entry) return;

  entry.position = parkEntryBuildingPosition();
  const entryGroup = buildingMeshes.get(entry.id);
  if (entryGroup) {
    entryGroup.position.set(...entry.position);
  }
}

function rebuildTileGrid() {
  clearGroup(boardGridGroup);

  const material = new THREE.LineBasicMaterial({
    color: 0xd8e7c7,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const lineY = 0.012;

  for (let col = 0; col <= gridColumns; col += 1) {
    const x = playableArea.minX + col * PATH_TILE_SIZE;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, lineY, playableArea.minZ),
      new THREE.Vector3(x, lineY, playableArea.maxZ),
    ]);
    boardGridGroup.add(new THREE.Line(geometry, material));
  }

  for (let row = 0; row <= gridRows; row += 1) {
    const z = playableArea.minZ + row * PATH_TILE_SIZE;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(playableArea.minX, lineY, z),
      new THREE.Vector3(playableArea.maxX, lineY, z),
    ]);
    boardGridGroup.add(new THREE.Line(geometry, material));
  }
}

function rebuildBoundaryFence() {
  removeSelectableEntries(boundaryFenceGroup);
  clearGroup(boundaryFenceGroup);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a6646,
    roughness: 0.88,
  });
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x614630,
    roughness: 0.9,
  });
  const gateMaterial = new THREE.MeshStandardMaterial({
    color: 0xa78358,
    roughness: 0.82,
  });
  const halfWidth = playableArea.width / 2;
  const halfDepth = playableArea.depth / 2;
  const gateWidth = PARK_ENTRY_GATE_WIDTH;
  const leftGateEdge = -gateWidth / 2;
  const rightGateEdge = gateWidth / 2;
  const lowerFenceCenterX = playableArea.minX + playableArea.width / 2;
  const lowerFenceCenterZ = playableArea.minZ + playableArea.depth / 2;
  const leftGateRailWidth = leftGateEdge - playableArea.minX;
  const rightGateRailWidth = playableArea.maxX - rightGateEdge;

  addFenceRail(
    boundaryFenceGroup,
    [lowerFenceCenterX, 0.52, playableArea.minZ],
    [playableArea.width, 0.09, 0.09],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [lowerFenceCenterX, 0.24, playableArea.minZ],
    [playableArea.width, 0.08, 0.08],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [playableArea.minX + leftGateRailWidth / 2, 0.52, playableArea.maxZ],
    [leftGateRailWidth, 0.09, 0.09],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [rightGateEdge + rightGateRailWidth / 2, 0.52, playableArea.maxZ],
    [rightGateRailWidth, 0.09, 0.09],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [playableArea.minX, 0.52, lowerFenceCenterZ],
    [0.09, 0.09, playableArea.depth],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [playableArea.maxX, 0.52, lowerFenceCenterZ],
    [0.09, 0.09, playableArea.depth],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [playableArea.minX, 0.24, lowerFenceCenterZ],
    [0.08, 0.08, playableArea.depth],
    railMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [playableArea.maxX, 0.24, lowerFenceCenterZ],
    [0.08, 0.08, playableArea.depth],
    railMaterial,
  );

  for (let x = playableArea.minX; x <= playableArea.maxX + 0.01; x += 1.5) {
    if (Math.abs(x) < gateWidth / 2) continue;
    addFencePost(boundaryFenceGroup, [x, 0.36, playableArea.minZ], postMaterial);
    addFencePost(boundaryFenceGroup, [x, 0.36, playableArea.maxZ], postMaterial);
  }
  for (let z = playableArea.minZ + 1.5; z <= playableArea.maxZ - 1.49; z += 1.5) {
    addFencePost(boundaryFenceGroup, [playableArea.minX, 0.36, z], postMaterial);
    addFencePost(boundaryFenceGroup, [playableArea.maxX, 0.36, z], postMaterial);
  }

  addFencePost(boundaryFenceGroup, [-gateWidth / 2, 0.43, parkEntryGateZ()], postMaterial);
  addFencePost(boundaryFenceGroup, [gateWidth / 2, 0.43, parkEntryGateZ()], postMaterial);
  addFenceRail(
    boundaryFenceGroup,
    [-gateWidth / 4, 0.36, parkEntryGateZ() + 0.05],
    [gateWidth / 2, 0.08, 0.08],
    gateMaterial,
  );
  addFenceRail(
    boundaryFenceGroup,
    [gateWidth / 4, 0.36, parkEntryGateZ() + 0.05],
    [gateWidth / 2, 0.08, 0.08],
    gateMaterial,
  );

  tagSelectable(boundaryFenceGroup, createBoundaryFenceInfo(), boundaryFenceGroup);
}

function addFenceRail(group, position, size, material) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  rail.position.set(...position);
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);
}

function addFencePost(group, position, material) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), material);
  post.position.set(...position);
  post.castShadow = true;
  post.receiveShadow = true;
  group.add(post);
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function removeSelectableEntries(root) {
  const removed = new Set();
  root.traverse((child) => {
    if (child.isMesh) removed.add(child);
  });

  let writeIndex = 0;
  for (const candidate of selectable) {
    if (removed.has(candidate)) continue;
    selectable[writeIndex] = candidate;
    writeIndex += 1;
  }
  selectable.length = writeIndex;
}

function rebuildPerimeterScenery() {
  clearGroup(perimeterSceneryGroup);
  addExteriorPathSegment(
    PARK_ENTRY_X,
    playableArea.maxZ + 0.7,
    0.72,
    1.4,
    perimeterSceneryGroup,
  );

  const stones = [
    [playableArea.minX - 1.6, playableArea.minZ + 1.1, 0.24],
    [playableArea.minX - 1.9, playableArea.maxZ - 1.7, 0.18],
    [playableArea.maxX + 1.4, playableArea.minZ + 2, 0.22],
    [playableArea.maxX + 1.9, playableArea.maxZ - 1, 0.2],
    [playableArea.minX + 3.3, playableArea.minZ - 1.2, 0.2],
    [playableArea.maxX - 2.8, playableArea.minZ - 1.4, 0.25],
    [playableArea.minX + 1.6, playableArea.maxZ + 1.3, 0.18],
    [playableArea.maxX - 1.2, playableArea.maxZ + 1.1, 0.23],
  ];
  for (const [x, z, radius] of stones) {
    addRock(x, z, radius, perimeterSceneryGroup);
  }

  for (let x = playableArea.minX - 3; x <= playableArea.maxX + 3; x += 3) {
    addTree(x, playableArea.minZ - 2.3, 0.62 + ((x + 9) % 2) * 0.08, perimeterSceneryGroup);
    addTree(
      x + 0.9,
      playableArea.maxZ + 2.1,
      0.58 + ((x + 6) % 2) * 0.08,
      perimeterSceneryGroup,
    );
  }
  for (let z = playableArea.minZ - 0.3; z <= playableArea.maxZ + 0.3; z += 2.4) {
    addTree(playableArea.minX - 2.4, z, 0.64, perimeterSceneryGroup);
    addTree(playableArea.maxX + 2.4, z + 0.7, 0.6, perimeterSceneryGroup);
  }
}

function addPathSegment(label, x, z, width, depth) {
  const group = new THREE.Group();
  const tiles = pathTilesFromBounds(x, z, width, depth);

  for (const tile of tiles) {
    if (pathTileKeys.has(tile.key)) continue;
    const path = new THREE.Mesh(pathTileGeometry, playerPathMaterial);
    path.position.set(tile.x, 0.04, tile.z);
    path.receiveShadow = true;
    group.add(path);
    pathTileKeys.add(tile.key);
  }

  if (group.children.length === 0) return;

  scene.add(group);
  tagSelectable(
    group,
    createStaticInfo({
      id: `path-${label.toLowerCase().replaceAll(" ", "-")}`,
      label,
      category: "Path",
      summary: "A walkable route that guides guests between zoo elements.",
      details: {
        Footprint: `${group.children.length} tiles`,
      },
    }),
    group,
  );
}

function addExteriorPathSegment(x, z, width, depth, parent = scene) {
  const path = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.04, depth),
    playerPathMaterial,
  );
  path.position.set(x, 0.03, z);
  path.receiveShadow = true;
  parent.add(path);
}

function createBuildings() {
  for (const building of buildings) {
    addBuildingToScene(building);
  }
}

function addBuildingToScene(building) {
  if ((building.kind ?? building.id) === "customer_entry") {
    building.position = parkEntryBuildingPosition();
  }
  const group = createBuildingMesh(building);
  group.position.set(...building.position);
  group.userData.building = building;
  scene.add(group);
  buildingMeshes.set(building.id, group);
  tagSelectable(group, createBuildingInfo(building), group);
  updateBuilding(building, currentTime);
  return group;
}

function createBuildingMesh(building, { preview = false } = {}) {
  const kind = building.kind ?? building.id;
  if (kind === "customer_entry") return createCustomerEntry(building, { preview });
  if (kind === "keeper_kitchen") return createKitchen(building, { preview });
  if (kind === "savanna_habitat") return createHabitat(building, { preview });
  if (kind === "ticket_booth") return createTicketBooth(building, { preview });
  if (kind === "feed_shed") return createFeedShed(building);
  if (kind === "guest_plaza") return createGuestPlaza(building);
  const asset = buildingManifest.find((entry) => entry.kind === kind);
  if (asset?.category === "habitat") {
    return createGenericHabitat(building, asset, { preview });
  }
  return createGenericBuilding(building, asset, { preview });
}

function createGenericBuilding(building, asset, { preview = false } = {}) {
  const group = new THREE.Group();
  const color = hexColor(asset?.swatch, 0xbfc1ad);
  addFoundation(group, building.size, 0x9c8062);
  addBox(group, [0, 0.38, 0], [building.size[0] * 0.68, 0.72, building.size[1] * 0.62], color);
  addRoof(group, [0, 0.84, 0], [building.size[0] * 0.78, 0.28, building.size[1] * 0.72], 0x6f513b);
  addBox(group, [0, 0.38, building.size[1] * 0.34], [0.22, 0.36, 0.05], 0xf7f1d7);
  if (!preview) addProductionRing(group, building.id, color);
  return group;
}

function createGenericHabitat(building, asset, { preview = false } = {}) {
  const group = new THREE.Group();
  const color = hexColor(asset?.swatch, 0xd4ba74);
  addFoundation(group, building.size, color);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(building.size[0] * 0.9, 0.05, building.size[1] * 0.82),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  floor.position.y = 0.045;
  floor.receiveShadow = true;
  group.add(floor);
  addFence(group, building.size[0], building.size[1]);
  addWater(group, [building.size[0] * 0.22, 0.1, -building.size[1] * 0.2], [0.7, 0.05, 0.38]);
  addTreeToGroup(group, [-building.size[0] * 0.28, 0, -building.size[1] * 0.22], 0.48);
  addAnimal(group, [-0.32, 0.08, 0.24], 0xded6c1, 0.58, asset?.label ?? "Habitat Animal", {
    animated: !preview,
    selectable: !preview,
  });
  if (!preview) addProductionRing(group, building.id, color);
  return group;
}

function hexColor(value, fallback) {
  if (!value || !value.startsWith("#")) return fallback;
  return Number.parseInt(value.slice(1), 16);
}

function createKitchen(building, { preview = false } = {}) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0xb38460);
  addBox(group, [0, 0.42, 0], [1.3, 0.78, 0.92], 0xd9d2b8);
  addRoof(group, [0, 0.94, 0], [1.52, 0.44, 1.12], 0xb64f3d);
  addBox(group, [0.43, 1.18, -0.12], [0.18, 0.42, 0.18], 0x765441);
  if (!preview) addProductionRing(group, building.id, 0xffc96c);
  return group;
}

function createHabitat(building, { preview = false } = {}) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0xcaa86d);
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 0.05, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xd4ba74, roughness: 1 }),
  );
  sand.position.y = 0.045;
  sand.receiveShadow = true;
  group.add(sand);

  addFence(group, building.size[0], building.size[1]);
  addWater(group, [0.82, 0.1, -0.55], [0.95, 0.05, 0.48]);
  addTreeToGroup(group, [-1.2, 0, -0.66], 0.55);
  addAnimal(group, [-0.42, 0.08, 0.35], 0xded6c1, 0.72, "Savanna Grazer", {
    animated: !preview,
    selectable: !preview,
  });
  addAnimal(group, [0.58, 0.08, 0.36], 0x6d5b48, 0.56, "Young Savanna Grazer", {
    animated: !preview,
    selectable: !preview,
  });
  if (!preview) addProductionRing(group, building.id, 0x78d5df);
  return group;
}

function createCustomerEntry(building, { preview = false } = {}) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0xb5aa91);
  addBox(group, [-0.28, 0.42, 0], [0.16, 0.72, 0.16], 0x7b5c47);
  addBox(group, [0.28, 0.42, 0], [0.16, 0.72, 0.16], 0x7b5c47);
  addBox(group, [0, 0.86, 0], [0.78, 0.18, 0.2], 0xa78358);
  addRoof(group, [0, 1.06, 0], [0.92, 0.22, 0.36], 0xd45742);
  addBox(group, [0, 0.48, -0.28], [0.52, 0.1, 0.08], 0xa78358);
  if (!preview) addProductionRing(group, building.id, 0xe1b44f);
  return group;
}

function createTicketBooth(building, { preview = false } = {}) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0xb5aa91);
  addBox(group, [0, 0.38, 0], [0.86, 0.72, 0.66], 0x4a8190);
  addRoof(group, [0, 0.82, 0], [1.08, 0.28, 0.82], 0xd45742);
  addBox(group, [-0.22, 0.44, 0.34], [0.18, 0.36, 0.05], 0xf7f1d7);
  addBox(group, [0.22, 0.44, 0.34], [0.18, 0.36, 0.05], 0xf7f1d7);
  if (!preview) addProductionRing(group, building.id, 0xe1b44f);
  return group;
}

function createFeedShed(building) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0x9c8062);
  addBox(group, [0, 0.34, 0], [1.02, 0.64, 0.72], 0x936b45);
  addRoof(group, [0, 0.76, 0], [1.18, 0.25, 0.86], 0x6f513b);
  addCylinder(group, [-0.28, 0.35, 0.38], 0.15, 0.34, 0xd99652);
  addCylinder(group, [0.08, 0.35, 0.38], 0.15, 0.34, 0xd99652);
  return group;
}

function createGuestPlaza(building) {
  const group = new THREE.Group();
  addFoundation(group, building.size, 0xbfc1ad);
  addBox(group, [-0.52, 0.18, 0.28], [0.56, 0.24, 0.18], 0x7b5c47);
  addBox(group, [0.52, 0.18, 0.28], [0.56, 0.24, 0.18], 0x7b5c47);
  addCylinder(group, [0, 0.25, -0.2], 0.34, 0.12, 0x45a6b7);
  addCylinder(group, [0, 0.46, -0.2], 0.13, 0.32, 0xd8e8ef);
  return group;
}

function addFoundation(group, size, color) {
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], 0.12, size[1]),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  foundation.position.y = 0.05;
  foundation.receiveShadow = true;
  foundation.castShadow = true;
  group.add(foundation);
}

function addBox(group, position, size, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addRoof(group, position, size, color) {
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(size[0] * 0.58, size[1], 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
  );
  roof.position.set(...position);
  roof.scale.z = size[2] / size[0];
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  group.add(roof);
}

function addCylinder(group, position, radius, height, color) {
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 18),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
  );
  cylinder.position.set(...position);
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  group.add(cylinder);
  return cylinder;
}

function addFence(group, width, depth) {
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x71553d,
    roughness: 0.9,
  });
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a4331,
    roughness: 0.9,
  });

  const rails = [
    [0, 0.46, -depth / 2, width, 0.08, 0.08],
    [0, 0.46, depth / 2, width, 0.08, 0.08],
    [-width / 2, 0.46, 0, 0.08, 0.08, depth],
    [width / 2, 0.46, 0, 0.08, 0.08, depth],
  ];

  for (const rail of rails) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rail[3], rail[4], rail[5]), railMaterial);
    mesh.position.set(rail[0], rail[1], rail[2]);
    mesh.castShadow = true;
    group.add(mesh);
  }

  for (const x of [-width / 2, 0, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), postMaterial);
      post.position.set(x, 0.36, z);
      post.castShadow = true;
      group.add(post);
    }
  }
}

function addWater(group, position, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color: 0x45a6b7,
      roughness: 0.18,
      metalness: 0.08,
    }),
  );
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addTree(x, z, scale, parent = scene) {
  const group = new THREE.Group();
  addTreeToGroup(group, [0, 0, 0], scale);
  group.position.set(x, 0, z);
  parent.add(group);
}

function addRock(x, z, radius, parent = scene) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius, 0),
    new THREE.MeshStandardMaterial({ color: 0x87917d, roughness: 1 }),
  );
  rock.position.set(x, 0.02 + radius * 0.28, z);
  rock.rotation.set(radius * 1.7, x * 0.13, z * 0.11);
  rock.scale.y = 0.55;
  rock.castShadow = true;
  rock.receiveShadow = true;
  parent.add(rock);
}

function addTreeToGroup(group, position, scale) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 * scale, 0.1 * scale, 0.5 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x785433, roughness: 1 }),
  );
  trunk.position.set(position[0], position[1] + 0.25 * scale, position[2]);
  trunk.castShadow = true;
  group.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42 * scale, 1),
    new THREE.MeshStandardMaterial({ color: 0x477f3d, roughness: 1 }),
  );
  canopy.position.set(position[0], position[1] + 0.72 * scale, position[2]);
  canopy.castShadow = true;
  group.add(canopy);
}

function addAnimal(
  group,
  position,
  color,
  scale,
  label,
  {
    animated = true,
    selectable: selectableAnimal = true,
    selectionInfo = null,
    id = `animal-${label.toLowerCase().replaceAll(" ", "-")}`,
    summary = "A habitat animal with a small idle animation.",
    details = {
      Habitat: "Animal Area",
      Behavior: "Grazing",
    },
  } = {},
) {
  const animal = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55 * scale, 0.3 * scale, 0.24 * scale),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22 * scale, 0.22 * scale, 0.2 * scale),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  body.position.y = 0.28 * scale;
  head.position.set(0.34 * scale, 0.36 * scale, 0);
  body.castShadow = true;
  head.castShadow = true;
  animal.add(body, head);

  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.08, 0.08]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.055 * scale, 0.22 * scale, 0.055 * scale),
        new THREE.MeshStandardMaterial({ color: 0x40342c, roughness: 0.9 }),
      );
      leg.position.set(x * scale, 0.1 * scale, z * scale);
      animal.add(leg);
    }
  }

  animal.position.set(...position);
  if (animated) animals.push(animal);
  group.add(animal);
  if (selectableAnimal) {
    tagSelectable(
      animal,
      selectionInfo ??
        createStaticInfo({
          id,
          label,
          category: "Animal",
          summary,
          details,
        }),
      animal,
    );
  }
  return animal;
}

function addProductionRing(group, id, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  ring.userData.productionRing = id;
  group.add(ring);
}

function createVisitors() {
  for (let index = 0; index < 14; index += 1) {
    const group = new THREE.Group();
    const shirtColors = [0x45a6b7, 0xd66b7a, 0xe1b44f, 0x6caa43];
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.28, 10),
      new THREE.MeshStandardMaterial({
        color: shirtColors[index % shirtColors.length],
        roughness: 0.8,
      }),
    );
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2b38f, roughness: 0.9 }),
    );
    body.position.y = 0.16;
    head.position.y = 0.36;
    group.add(body, head);
    group.visible = false;
    group.userData.visitorActive = false;
    group.userData.visitorEntryStartTime = null;
    group.userData.visitorSeed = 0x9e3779b1 + index * 0x85ebca6b;
    group.userData.visitorLastVisits = Object.create(null);
    group.userData.visitorRoutePoints = null;
    group.userData.visitorRouteStartedAt = null;
    group.userData.visitorRouteTravelSeconds = null;
    group.userData.visitorTargetBuildingId = null;
    group.userData.visitorTargetBuildingLabel = null;
    group.userData.visitorCurrentBuildingId = null;
    group.userData.visitorDwellUntil = null;
    group.userData.visitorInteractionLabel = null;
    group.userData.visitorLeavingZoo = false;
    group.userData.visitorExitCooldownUntil = 0;
    scene.add(group);
    visitorGroups.push(group);
    tagSelectable(
      group,
      {
        id: `visitor-${index + 1}`,
        label: `Visitor ${index + 1}`,
        category: "Visitor",
        summary: "A guest walking the route when visitor capacity is active.",
        getRoutePoints: () => visitorRoutePoints(index, group),
        getDetails: () => ({
          Status: visitorStatusLabel(group),
          Route: group.userData.visitorTargetBuildingLabel
            ? `Guest loop to ${group.userData.visitorTargetBuildingLabel}`
            : "Guest loop",
          Activity: group.userData.visitorInteractionLabel ?? "Walking",
          Position: `${group.position.x.toFixed(1)}, ${group.position.z.toFixed(1)}`,
        }),
      },
      group,
    );
  }
}

function spawnWorkerForBuilding(building) {
  if (!canAssignWorkerToBuilding(building)) {
    const buildingRoot = buildingMeshes.get(building.id);
    if (buildingRoot) {
      selectElement(buildingRoot.userData.selectionInfo, buildingRoot);
    }
    return;
  }
  spawnedWorkerCount += 1;
  const position = workerPositionForBuilding(building, spawnedWorkerCount);
  const worker = {
    id: `spawned_${spawnedWorkerCount}`,
    label: `Worker ${spawnedWorkerCount}`,
    assignmentTargetId: `building-${building.id}`,
    assignmentTargetLabel: building.label,
    assignmentTargetCategory: "Building",
    assignedBuildingId: building.id,
    assignedBuildingLabel: building.label,
    position: [position.x, 0.08, position.z],
    walkTarget: null,
    walkTargetLabel: null,
  };
  const group = createWorkerMesh(spawnedWorkerCount);
  worker.groupUuid = group.uuid;
  group.position.set(...worker.position);
  group.userData.worker = worker;
  scene.add(group);
  workers.push(worker);
  tagSelectable(group, createWorkerInfo(worker), group);
  faceWorkerTowardBuilding(group, building);
  updateState(currentTime);
  const buildingRoot = buildingMeshes.get(building.id);
  if (buildingRoot) selectElement(buildingRoot.userData.selectionInfo, buildingRoot);
}

function workerPositionForBuilding(building, index) {
  const halfWidth = building.size[0] / 2;
  const halfDepth = building.size[1] / 2;
  const offsets = [
    [halfWidth + 0.35, 0],
    [-(halfWidth + 0.35), 0],
    [0, halfDepth + 0.35],
    [0, -(halfDepth + 0.35)],
  ];
  const [offsetX, offsetZ] = offsets[(index - 1) % offsets.length];
  return {
    x: THREE.MathUtils.clamp(
      building.position[0] + offsetX,
      playableArea.minX + 0.2,
      playableArea.maxX - 0.2,
    ),
    z: THREE.MathUtils.clamp(
      building.position[2] + offsetZ,
      playableArea.minZ + 0.2,
      playableArea.maxZ - 0.2,
    ),
  };
}

function createWorkerMesh(index) {
  const group = new THREE.Group();
  const shirtColors = [0x2f7f8c, 0xc65f46, 0x6caa43, 0xe1b44f];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: shirtColors[(index - 1) % shirtColors.length],
    roughness: 0.78,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2b38f,
    roughness: 0.9,
  });
  const bootMaterial = new THREE.MeshStandardMaterial({
    color: 0x27322f,
    roughness: 0.86,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.34, 10), bodyMaterial);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), headMaterial);
  body.position.y = 0.2;
  head.position.y = 0.43;
  body.castShadow = true;
  head.castShadow = true;
  group.add(body, head);

  for (const x of [-0.045, 0.045]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.045), bootMaterial);
    leg.position.set(x, 0.07, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.055, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xf7f1d7, roughness: 0.7 }),
  );
  badge.position.set(0, 0.25, 0.105);
  group.add(badge);
  return group;
}

function updateWorkers(time, delta = 0) {
  for (const worker of workers) {
    const group = scene.getObjectByProperty("uuid", worker.groupUuid);
    if (!group) continue;
    const walking = advanceWorkerTowardTarget(worker, group, delta);
    const building = buildings.find((candidate) => candidate.id === worker.assignedBuildingId);
    if (!walking && building) faceWorkerTowardBuilding(group, building);

    group.position.x = worker.position[0];
    group.position.z = worker.position[2];
    group.position.y =
      worker.position[1] +
      (settings.motionEffects ? Math.sin(time * 0.08 + worker.position[0]) * 0.018 : 0);
  }
}

function advanceWorkerTowardTarget(worker, group, delta) {
  if (!worker.walkTarget || delta <= 0) return false;

  const dx = worker.walkTarget[0] - worker.position[0];
  const dz = worker.walkTarget[2] - worker.position[2];
  const distance = Math.hypot(dx, dz);
  const step = WORKER_WALK_SPEED * delta;

  if (distance <= Math.max(step, 0.015)) {
    worker.position[0] = worker.walkTarget[0];
    worker.position[2] = worker.walkTarget[2];
    worker.walkTarget = null;
    worker.walkTargetLabel = null;
    return false;
  }

  const directionX = dx / distance;
  const directionZ = dz / distance;
  worker.position[0] += directionX * step;
  worker.position[2] += directionZ * step;
  group.rotation.y = Math.atan2(directionX, directionZ);
  return true;
}

function faceWorkerTowardBuilding(group, building) {
  group.rotation.y = Math.atan2(
    building.position[0] - group.position.x,
    building.position[2] - group.position.z,
  );
}

function createResourceRows() {
  const fragment = document.createDocumentFragment();
  for (const resource of resources) {
    const row = document.createElement("div");
    row.className = "resource-row";
    row.dataset.selectionId = `resource-${resource.id}`;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `Inspect ${resource.label}`);
    row.innerHTML = `
      <span class="resource-swatch" style="background:${resource.color}"></span>
      <span class="resource-name">${resource.label}</span>
      <span class="resource-value">0</span>
      <span class="bar" aria-hidden="true"><span class="bar-fill"></span></span>
    `;
    row.style.color = resource.color;
    fragment.append(row);
    resourceRows.set(resource.id, {
      element: row,
      value: row.querySelector(".resource-value"),
      fill: row.querySelector(".bar-fill"),
    });
    const info = createResourceInfo(resource);
    row.addEventListener("click", () => selectElement(info));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectElement(info);
    });
  }
  resourceListEl.append(fragment);
}

function createBuildOptions() {
  const fragment = document.createDocumentFragment();
  for (const [index, item] of buildCatalog.entries()) {
    const button = document.createElement("button");
    button.className = "build-option";
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `Place ${item.label}`);
    const hotkey = BUILD_OPTION_HOTKEYS[index] ?? null;
    if (hotkey) {
      button.setAttribute("aria-keyshortcuts", hotkey.toUpperCase());
    }

    const swatch = document.createElement("span");
    swatch.className = "build-swatch";
    swatch.style.background = item.swatch;
    swatch.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "build-option-copy";

    const title = document.createElement("span");
    title.className = "build-option-title";
    const label = document.createElement("strong");
    label.textContent = item.label;
    title.append(label);
    if (hotkey) {
      title.append(createHotkeyBadge(hotkey));
    }

    const meta = document.createElement("span");
    meta.className = "build-option-meta";
    const cost = document.createElement("span");
    cost.textContent = item.cost;
    const duration = document.createElement("span");
    duration.textContent = item.buildDuration > 0 ? `${item.buildDuration}s` : "Instant";
    const staff = document.createElement("span");
    staff.textContent = staffingLabel(item.requiredWorkers);
    meta.append(cost, duration, staff);

    copy.append(title, meta);
    button.append(swatch, copy);
    button.addEventListener("click", () => setPlacementItem(item));
    fragment.append(button);
    buildOptionButtons.set(item.kind, button);
  }
  buildOptionsEl.append(fragment);
}

function createFenceOptions() {
  const fragment = document.createDocumentFragment();
  for (const fence of fenceManifest) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fence-option";
    button.textContent = fence.label;
    button.setAttribute("aria-pressed", String(fence.kind === activeFenceKind));
    button.addEventListener("click", () => setActiveFenceKind(fence.kind));
    fragment.append(button);
    fenceOptionButtons.set(fence.kind, button);
  }
  fenceOptionsEl.append(fragment);
}

function setActiveFenceKind(kind) {
  activeFenceKind = kind;
  for (const [candidate, button] of fenceOptionButtons) {
    button.setAttribute("aria-pressed", String(candidate === activeFenceKind));
  }
  updateFencePreview();
}

function animate(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.08);
  lastFrame = now;

  if (simulationStarted) {
    currentTime += delta * settings.speedMultiplier;
    updateState(currentTime);
  } else {
    updatePlayerPlacedBuildings();
  }

  if (settings.motionEffects) {
    const elapsed = now * 0.001;
    for (const animal of animals) {
      animal.rotation.y = Math.sin(elapsed * 0.9 + animal.position.x) * 0.18;
      animal.position.y = 0.08 + Math.sin(elapsed * 1.4 + animal.position.z) * 0.018;
    }
  }

  updateWorkers(now * 0.001, delta);
  updateSelectionRouteIndicator();
  controls.update();
  clampCameraToPlayableArea();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function clampCameraToPlayableArea() {
  const nextTarget = controls.target.clone();
  nextTarget.x = THREE.MathUtils.clamp(nextTarget.x, playableArea.minX, playableArea.maxX);
  nextTarget.z = THREE.MathUtils.clamp(nextTarget.z, playableArea.minZ, playableArea.maxZ);
  nextTarget.y = defaultCamera.target.y;

  const correction = nextTarget.sub(controls.target);
  if (correction.lengthSq() === 0) return;

  controls.target.add(correction);
  camera.position.add(correction);
}

function updateState(time) {
  const roundedTime = Math.floor(time);
  const resourceState = currentResourceState();
  const pricingState = currentPricingState(time);
  syncLocalAnimalUnlocks(resourceState);

  clockEl.textContent = `${roundedTime}s`;
  phaseEl.textContent = phaseForSimulation();
  entryFeeValueEl.textContent = formatMoney(pricing.entryFee);
  willingnessValueEl.textContent = `${formatMoney(pricingState.willingness)} willing`;
  demandValueEl.textContent = `${pricingState.demandPercent}% demand`;

  for (const resource of resources) {
    const row = resourceRows.get(resource.id);
    const value = resourceState.values[resource.id] ?? 0;
    const capacity = resourceState.capacities[resource.id];
    row.value.textContent = capacity ? `${value} / ${capacity}` : String(value);
    row.fill.style.width = `${
      capacity ? Math.min(100, (value / capacity) * 100) : Math.min(100, value)
    }%`;
  }
  updateLandPurchaseUi(resourceState);

  for (const building of buildings) {
    updateBuilding(building, time);
  }

  updateVisitors(resourceState.values.visitors ?? 0, time);
  if (selectedElement) renderSelection();
}

function updatePlayerPlacedBuildings() {
  if (playerPlacedBuildings.length === 0) return;
  for (const building of playerPlacedBuildings) {
    updateBuilding(building, currentTime);
  }
  if (selectedElement) renderSelection();
}

function currentResourceState() {
  const state = {
    values: { ...baseResourceState.values },
    capacities: { ...baseResourceState.capacities },
  };
  const pricingState = currentPricingState(currentTime);

  for (const building of buildings) {
    if (constructionProgress(building, currentTime) < 1) continue;

    const kind = building.kind ?? building.id;
    if (kind === "feed_shed") {
      state.capacities.animal_feed = (state.capacities.animal_feed ?? 0) + 60;
    }
    if (kind === "guest_plaza") {
      state.capacities.visitors = (state.capacities.visitors ?? 0) + 30;
    }
    if (!isBuildingManned(building)) continue;

    for (const [resource, amount] of Object.entries(building.resourceOutput ?? {})) {
      state.values[resource] = (state.values[resource] ?? 0) + amount;
    }
  }

  state.values.visitors = (state.values.visitors ?? 0) + pricingState.arrivalsSinceOpening;
  state.values.coins = (state.values.coins ?? 0) + pricingState.entryRevenueSinceOpening;
  state.values.coins = Math.max(0, state.values.coins - landState.coinsSpent);
  for (const [resource, amount] of Object.entries(localResourceSpend)) {
    state.values[resource] = Math.max(0, (state.values[resource] ?? 0) - amount);
  }

  for (const [resource, capacity] of Object.entries(state.capacities)) {
    if (state.values[resource] !== undefined) {
      state.values[resource] = Math.min(state.values[resource], capacity);
    }
  }

  return state;
}

function currentPricingState(time = currentTime) {
  const attraction = currentAnimalAttraction();
  const willingness = Math.max(1, 8 + attraction.appeal);
  const demandPercent = customerDemandPercent(pricing.entryFee, willingness);
  const maximumCustomersPerMinute =
    attraction.count === 0 ? 0 : 6 + attraction.count * 8 + Math.floor(attraction.appeal / 2);
  const expectedCustomersPerMinute = Math.floor((maximumCustomersPerMinute * demandPercent) / 100);
  const arrivalsSinceOpening = Math.floor((Math.max(0, time) / 60) * expectedCustomersPerMinute);

  return {
    entryFee: pricing.entryFee,
    willingness,
    demandPercent,
    expectedCustomersPerMinute,
    arrivalsSinceOpening,
    entryRevenueSinceOpening: arrivalsSinceOpening * pricing.entryFee,
    animalCount: attraction.count,
    animalAppeal: attraction.appeal,
    animals: attraction.animals,
  };
}

function currentAnimalAttraction() {
  const counts = new Map();
  let appeal = 0;
  let count = 0;

  for (const building of buildings) {
    if (constructionProgress(building, currentTime) < 1) continue;
    const profile = animalAttractionProfiles[building.kind ?? building.id];
    if (!profile) continue;
    count += 1;
    appeal += profile.appeal;
    counts.set(profile.kind, (counts.get(profile.kind) ?? 0) + 1);
  }

  for (const animal of localAnimalGroups) {
    const species = animalSpeciesByKind[animal.kind];
    if (!species) continue;
    count += 1;
    appeal += species.appeal;
    counts.set(species.label, (counts.get(species.label) ?? 0) + 1);
  }

  return {
    count,
    appeal,
    animals: Array.from(counts, ([kind, amount]) => (amount > 1 ? `${amount} ${kind}` : kind)),
  };
}

function customerDemandPercent(entryFee, willingness) {
  if (entryFee <= 0) return 100;
  const safeWillingness = Math.max(1, willingness);
  if (entryFee <= safeWillingness) {
    return THREE.MathUtils.clamp(Math.round(100 - (entryFee * 30) / safeWillingness), 0, 100);
  }
  return THREE.MathUtils.clamp(
    Math.round(70 - ((entryFee - safeWillingness) * 70) / safeWillingness),
    0,
    70,
  );
}

function formatMoney(value) {
  return `$${Math.max(0, Math.round(Number(value) || 0))}`;
}

function phaseForSimulation() {
  if (buildings.some((building) => constructionProgress(building, currentTime) < 1)) {
    return "Construction active";
  }
  if (buildings.some((building) => assignedWorkerCount(building) < requiredWorkerCount(building))) {
    return "Staffing needed";
  }
  return "Operating";
}

function constructionProgress(building, time) {
  if (!building.playerPlaced) return 1;
  if (!building.buildDuration) return 1;
  return THREE.MathUtils.clamp((time - building.buildStart) / building.buildDuration, 0, 1);
}

function requiredWorkerCount(building) {
  return Math.max(0, Number(building.requiredWorkers ?? 0));
}

function assignedWorkerCount(building) {
  return workers.filter((worker) => worker.assignedBuildingId === building.id).length;
}

function assignedWorkersForBuilding(building) {
  return workers.filter((worker) => worker.assignedBuildingId === building.id);
}

function isBuildingManned(building) {
  return assignedWorkerCount(building) >= requiredWorkerCount(building);
}

function canAssignWorkerToBuilding(building) {
  return requiredWorkerCount(building) > assignedWorkerCount(building);
}

function canReassignWorkerToBuilding(worker, building) {
  const required = requiredWorkerCount(building);
  if (required <= 0) return false;
  const occupiedSlots = workers.filter(
    (candidate) => candidate !== worker && candidate.assignedBuildingId === building.id,
  ).length;
  return occupiedSlots < required;
}

function assignedWorkerIndexForBuilding(building, worker) {
  return (
    workers.filter(
      (candidate) => candidate !== worker && candidate.assignedBuildingId === building.id,
    ).length + 1
  );
}

function staffingLabel(requiredWorkers) {
  const required = Math.max(0, Number(requiredWorkers ?? 0));
  if (required === 0) return "No workers";
  return `${required} worker${required === 1 ? "" : "s"}`;
}

function productionLabel(building, constructing, manned, hasProduction) {
  if (constructing) return "Waiting for construction";
  if (!manned) return "Needs workers";
  return hasProduction ? "Running" : "Idle";
}

function updateBuilding(building, time) {
  const group = buildingMeshes.get(building.id);
  if (!group) return;

  const progress = constructionProgress(building, time);
  const constructing = progress < 1;
  const manned = isBuildingManned(building);
  const operational = !constructing && manned;
  const hasProduction = Boolean(
    building.resourceOutput && Object.keys(building.resourceOutput).length > 0,
  );

  group.visible = true;
  group.scale.setScalar(constructing ? 0.72 + progress * 0.28 : 1);
  group.traverse((child) => {
    if (!child.material) return;
    if (child.userData.productionRing) {
      child.material.opacity = operational && hasProduction ? 0.78 : 0;
      child.rotation.z =
        operational && hasProduction && settings.motionEffects ? time * 0.14 : child.rotation.z;
      return;
    }
    child.material.opacity = constructing ? 0.56 : operational ? 1 : 0.68;
    child.material.transparent = constructing || !operational;
  });

  group.position.set(building.position[0], building.position[1], building.position[2]);
  group.userData.state = {
    level: 1,
    status: constructing ? "Constructing" : manned ? "Active" : "Unmanned",
    production: productionLabel(building, constructing, manned, hasProduction),
  };
}

function updateVisitors(visitorCount, time) {
  if (time < lastVisitorUpdateTime) {
    resetVisitorFlow(time);
  }
  lastVisitorUpdateTime = time;

  const targetCount = Math.min(visitorGroups.length, Math.max(0, visitorCount));
  for (let index = targetCount; index < visitorGroups.length; index += 1) {
    deactivateVisitor(visitorGroups[index]);
  }

  if (targetCount === 0) {
    nextVisitorEntryTime = time;
    return;
  }

  const nextInactiveIndex = visitorGroups.findIndex(
    (visitor, index) => index < targetCount && visitorCanEnter(visitor, time),
  );
  if (nextInactiveIndex >= 0 && time >= nextVisitorEntryTime) {
    activateVisitor(visitorGroups[nextInactiveIndex], time);
    nextVisitorEntryTime = time + VISITOR_ENTRY_INTERVAL_SECONDS;
  }

  for (let index = 0; index < visitorGroups.length; index += 1) {
    const visitor = visitorGroups[index];
    visitor.visible = index < targetCount && visitor.userData.visitorActive;
    if (!visitor.visible) continue;

    const point = visitorPointAtTime(index, time);
    visitor.position.set(
      point.x,
      0.08 + (settings.motionEffects ? Math.sin(time * 0.45 + index) * 0.018 : 0),
      point.z,
    );
    visitor.rotation.y = point.angle;
  }
}

function activateVisitor(visitor, time) {
  visitor.userData.visitorActive = true;
  visitor.userData.visitorEntryStartTime = time;
  visitor.userData.visitorLastVisits = Object.create(null);
  visitor.userData.visitorCurrentBuildingId = null;
  visitor.userData.visitorDwellUntil = null;
  visitor.userData.visitorInteractionLabel = null;
  visitor.userData.visitorTargetBuildingId = null;
  visitor.userData.visitorTargetBuildingLabel = null;
  visitor.userData.visitorLeavingZoo = false;
  visitor.userData.visitorExitCooldownUntil = 0;
  assignNextVisitorDestination(visitor, visitorGroups.indexOf(visitor), time, {
    fromPoint: new THREE.Vector3(PARK_ENTRY_X, 0, parkEntrySpawnZ()),
    entry: true,
  });
  visitor.visible = true;
}

function visitorCanEnter(visitor, time) {
  if (visitor.userData.visitorActive) return false;
  return Number(visitor.userData.visitorExitCooldownUntil ?? 0) <= time;
}

function deactivateVisitor(visitor, { exitCooldownUntil = 0 } = {}) {
  visitor.userData.visitorActive = false;
  visitor.userData.visitorEntryStartTime = null;
  visitor.userData.visitorRoutePoints = null;
  visitor.userData.visitorRouteStartedAt = null;
  visitor.userData.visitorRouteTravelSeconds = null;
  visitor.userData.visitorTargetBuildingId = null;
  visitor.userData.visitorTargetBuildingLabel = null;
  visitor.userData.visitorCurrentBuildingId = null;
  visitor.userData.visitorDwellUntil = null;
  visitor.userData.visitorInteractionLabel = null;
  visitor.userData.visitorLeavingZoo = false;
  visitor.userData.visitorExitCooldownUntil = exitCooldownUntil;
  visitor.visible = false;
}

function resetVisitorFlow(time = currentTime) {
  for (const visitor of visitorGroups) {
    deactivateVisitor(visitor);
  }
  nextVisitorEntryTime = time;
  lastVisitorUpdateTime = time;
}

function visibleVisitorCount() {
  return visitorGroups.reduce((count, visitor) => count + Number(visitor.visible), 0);
}

function visitorRoutePoints(index, group) {
  if (!group.visible) return null;

  const routeState = visitorRouteState(index, currentTime);
  if (!routeState || routeState.dwell) return null;

  return remainingRoutePoints(routeState.routePoints, routeState.t, 0.18);
}

function resetAnimatedObjects() {
  for (const animal of animals) {
    animal.rotation.y = 0;
    animal.position.y = 0.08;
  }
  for (const building of buildings) {
    const group = buildingMeshes.get(building.id);
    group.position.set(...building.position);
    group.traverse((child) => {
      if (child.userData.productionRing) child.rotation.z = 0;
    });
  }
  for (const worker of workers) {
    const group = scene.getObjectByProperty("uuid", worker.groupUuid);
    if (group) group.position.y = worker.position[1];
  }
  updateState(currentTime);
}

function guestEntryRoutePointsForVisitor(index = 0, targetBuilding = null) {
  const target =
    targetBuilding ?? chooseVisitorDestination(visitorGroups[index], index, currentTime);
  const gatePoint = new THREE.Vector3(PARK_ENTRY_X, 0, parkEntryGateZ() - 0.15);
  const entryTile = nearestPathTileToPoint(gatePoint);
  const entryPathPoint = entryTile
    ? pathPointForTile(entryTile)
    : new THREE.Vector3(PARK_ENTRY_X, 0, PARK_ENTRY_PATH_Z);
  const points = [new THREE.Vector3(PARK_ENTRY_X, 0, parkEntrySpawnZ()), gatePoint];

  for (const point of guestRoutePointsBetween(entryPathPoint, target, index)) {
    appendDistinctPoint(points, point);
  }

  return points;
}

function guestExitRoutePointsFrom(start, visitorIndex = 0) {
  const gatePoint = new THREE.Vector3(PARK_ENTRY_X, 0, parkEntryGateZ() - 0.15);
  const exitPoint = new THREE.Vector3(PARK_ENTRY_X, 0, parkEntrySpawnZ());
  const entryTile = nearestPathTileToPoint(gatePoint);
  const entryPathPoint = entryTile
    ? pathPointForTile(entryTile)
    : new THREE.Vector3(PARK_ENTRY_X, 0, PARK_ENTRY_PATH_Z);
  const startTile = nearestPathTileToPoint(start);
  const endTile = nearestPathTileToPoint(entryPathPoint);
  const routeTiles = visitorPathTilesBetween(startTile, endTile);
  const points = [start.clone()];

  for (const tile of routeTiles) {
    const pathPoint = pathPointForTile(tile);
    const offset = visitorPathLaneOffset(pathPoint, visitorIndex);
    appendDistinctPoint(
      points,
      new THREE.Vector3(pathPoint.x + offset.x, 0, pathPoint.z + offset.z),
    );
  }

  appendDistinctPoint(points, gatePoint);
  appendDistinctPoint(points, exitPoint);
  return points;
}

function visitorRouteState(visitorIndex, time) {
  const visitor = visitorGroups[visitorIndex];
  if (!visitor?.userData.visitorActive) return null;

  if (visitor.userData.visitorDwellUntil) {
    const building = buildingById(visitor.userData.visitorCurrentBuildingId);
    if (building && time < visitor.userData.visitorDwellUntil) {
      return {
        dwell: true,
        routePoints: [visitorStopPointForBuilding(building, visitorIndex)],
        t: 1,
      };
    }

    const fromPoint = building
      ? visitorStopPointForBuilding(building, visitorIndex)
      : new THREE.Vector3(visitor.position.x, 0, visitor.position.z);
    assignNextVisitorDestination(visitor, visitorIndex, time, { fromPoint });
  }

  if (!visitor.userData.visitorRoutePoints) {
    assignNextVisitorDestination(visitor, visitorIndex, time, {
      fromPoint: new THREE.Vector3(visitor.position.x, 0, visitor.position.z),
    });
  }

  const routePoints = visitor.userData.visitorRoutePoints;
  const travelSeconds = Math.max(1, Number(visitor.userData.visitorRouteTravelSeconds ?? 1));
  const startedAt = Number(visitor.userData.visitorRouteStartedAt ?? time);
  const elapsed = Math.max(0, time - startedAt);
  if (elapsed >= travelSeconds) {
    if (visitor.userData.visitorLeavingZoo) {
      completeVisitorDeparture(visitor, time);
      return null;
    }

    const targetBuilding = buildingById(visitor.userData.visitorTargetBuildingId);
    if (targetBuilding) {
      beginVisitorDwell(visitor, visitorIndex, targetBuilding, time);
      return {
        dwell: true,
        routePoints: [visitorStopPointForBuilding(targetBuilding, visitorIndex)],
        t: 1,
      };
    }
  }

  return {
    routePoints,
    t: THREE.MathUtils.clamp(elapsed / travelSeconds, 0, 0.999999),
  };
}

function visitorStatusLabel(visitor) {
  if (!visitor.visible) return "Waiting";
  if (visitor.userData.visitorLeavingZoo) return "Leaving";
  if (visitor.userData.visitorDwellUntil && currentTime < visitor.userData.visitorDwellUntil) {
    return visitor.userData.visitorInteractionLabel ?? "Interacting";
  }
  return "On path";
}

function assignNextVisitorDestination(
  visitor,
  visitorIndex,
  time,
  { fromPoint = null, entry = false } = {},
) {
  const targetBuilding = chooseVisitorDestination(visitor, visitorIndex, time);
  const start =
    fromPoint ??
    new THREE.Vector3(
      visitor.position.x || PARK_ENTRY_X,
      0,
      visitor.position.z || parkEntrySpawnZ(),
    );
  if (!targetBuilding) {
    assignVisitorExitRoute(visitor, visitorIndex, time, start);
    return;
  }

  const routePoints = entry
    ? guestEntryRoutePointsForVisitor(visitorIndex, targetBuilding)
    : guestRoutePointsBetween(start, targetBuilding, visitorIndex);
  visitor.userData.visitorRoutePoints = routePoints;
  visitor.userData.visitorRouteStartedAt = time;
  visitor.userData.visitorRouteTravelSeconds = entry
    ? VISITOR_ENTRY_TRAVEL_SECONDS
    : visitorTravelSeconds(routePoints);
  visitor.userData.visitorTargetBuildingId = targetBuilding?.id ?? null;
  visitor.userData.visitorTargetBuildingLabel = targetBuilding?.label ?? null;
  visitor.userData.visitorCurrentBuildingId = null;
  visitor.userData.visitorDwellUntil = null;
  visitor.userData.visitorInteractionLabel = null;
  visitor.userData.visitorLeavingZoo = false;
}

function assignVisitorExitRoute(visitor, visitorIndex, time, fromPoint) {
  const routePoints = guestExitRoutePointsFrom(fromPoint, visitorIndex);
  visitor.userData.visitorRoutePoints = routePoints;
  visitor.userData.visitorRouteStartedAt = time;
  visitor.userData.visitorRouteTravelSeconds = visitorTravelSeconds(routePoints);
  visitor.userData.visitorTargetBuildingId = null;
  visitor.userData.visitorTargetBuildingLabel = null;
  visitor.userData.visitorCurrentBuildingId = null;
  visitor.userData.visitorDwellUntil = null;
  visitor.userData.visitorInteractionLabel = "Leaving zoo";
  visitor.userData.visitorLeavingZoo = true;
}

function completeVisitorDeparture(visitor, time) {
  visitor.position.set(PARK_ENTRY_X, visitor.position.y, parkEntrySpawnZ());
  deactivateVisitor(visitor, {
    exitCooldownUntil: time + VISITOR_REENTRY_AFTER_EXIT_SECONDS,
  });
}

function beginVisitorDwell(visitor, visitorIndex, building, time) {
  visitor.userData.visitorCurrentBuildingId = building.id;
  visitor.userData.visitorLastVisits[building.id] = time;
  visitor.userData.visitorRoutePoints = null;
  visitor.userData.visitorRouteStartedAt = null;
  visitor.userData.visitorRouteTravelSeconds = null;
  visitor.userData.visitorDwellUntil = time + visitorDwellSeconds(visitor, building);
  visitor.userData.visitorInteractionLabel = visitorInteractionLabel(building);
  const stopPoint = visitorStopPointForBuilding(building, visitorIndex);
  visitor.position.set(stopPoint.x, visitor.position.y, stopPoint.z);
}

function chooseVisitorDestination(visitor, visitorIndex, time) {
  const options = visitorAttractionOptions(visitor, time);
  if (options.length === 0) {
    return null;
  }

  const totalWeight = options.reduce((total, option) => total + option.weight, 0);
  let roll = seededVisitorRandom(visitor, visitorIndex) * totalWeight;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.building;
  }
  return options[options.length - 1].building;
}

function visitorAttractionOptions(visitor, time) {
  return buildings
    .map((building) => ({
      building,
      weight: visitorBuildingInterestScore(visitor, building, time),
    }))
    .filter((option) => option.weight >= VISITOR_INTEREST_THRESHOLD);
}

function visitorBuildingInterestScore(visitor, building, time) {
  return (
    visitorBuildingAttraction(building) *
    visitorBuildingOperationalMultiplier(building) *
    visitorBuildingRecencyMultiplier(visitor, building, time)
  );
}

function visitorBuildingAttraction(building) {
  const kind = building.kind ?? building.id;

  const category = buildingManifestByKind[kind]?.category;
  const animals = animalsForBuilding(building);
  const animalAppeal = animals.reduce(
    (total, animal) => total + Number(animalSpeciesByKind[animal.kind]?.appeal ?? 4),
    0,
  );
  if (category === "habitat" || kind.includes("habitat")) {
    return 13 + animalAppeal;
  }
  if (kind === "snack_kiosk") return 10;
  if (kind === "souvenir_stall") return 8;
  if (kind === "restroom") return 7;
  if (kind === "guest_plaza") return 6;
  if (kind === "ticket_booth") return 4;
  if (kind === "customer_entry") return 2;
  if (category === "guest") return 5;
  return 1.5;
}

function visitorBuildingOperationalMultiplier(building) {
  if (constructionProgress(building, currentTime) < 1) return 0;
  const required = requiredWorkerCount(building);
  if (required === 0) return 1;
  return isBuildingManned(building) ? 1 : 0.32;
}

function visitorBuildingRecencyMultiplier(visitor, building, time) {
  const lastVisited = visitor?.userData.visitorLastVisits?.[building.id];
  if (lastVisited == null) return 1;

  const elapsed = Math.max(0, time - Number(lastVisited));
  if (elapsed >= VISITOR_RECENCY_SECONDS) return 1;
  return THREE.MathUtils.lerp(
    VISITOR_RECENT_VISIT_MIN_MULTIPLIER,
    1,
    elapsed / VISITOR_RECENCY_SECONDS,
  );
}

function seededVisitorRandom(visitor, visitorIndex = 0) {
  const previousSeed = Number(
    visitor?.userData.visitorSeed ?? 0x9e3779b1 + visitorIndex * 0x85ebca6b,
  );
  const nextSeed = (Math.imul(previousSeed, 1664525) + 1013904223) >>> 0;
  if (visitor) visitor.userData.visitorSeed = nextSeed;
  return nextSeed / 0x100000000;
}

function visitorDwellSeconds(visitor, building) {
  const kind = building.kind ?? building.id;
  const random = seededVisitorRandom(visitor, visitorGroups.indexOf(visitor));
  if (kind === "snack_kiosk") return 6 + random * 4;
  if (kind === "restroom") return 4 + random * 3;
  if (kind === "souvenir_stall") return 5 + random * 4;
  if (kind === "ticket_booth") return 3 + random * 2;
  if (kind === "guest_plaza") return 5 + random * 5;
  if ((buildingManifestByKind[kind]?.category === "habitat") || kind.includes("habitat")) {
    return 8 + random * 6;
  }
  return 3 + random * 3;
}

function visitorInteractionLabel(building) {
  const kind = building.kind ?? building.id;
  const category = buildingManifestByKind[kind]?.category;
  if (kind === "snack_kiosk") return "Eating";
  if (kind === "restroom") return "Using services";
  if (kind === "souvenir_stall") return "Shopping";
  if (kind === "ticket_booth") return "Buying tickets";
  if (kind === "customer_entry") return "Entering";
  if (kind === "guest_plaza") return "Resting";
  if (category === "habitat" || kind.includes("habitat")) {
    return "Visiting animals";
  }
  return "Looking around";
}

function visitorStopPointForBuilding(building, visitorIndex = 0) {
  if (!building) return visitorFallbackPathPoint();
  const access = visitorAccessPointForBuilding(building);
  const offset = visitorPathLaneOffset(access, visitorIndex);
  return new THREE.Vector3(access.x + offset.x, 0, access.z + offset.z);
}

function visitorAccessPointForBuilding(building) {
  const zDirection = building.position[2] > 1 ? -1 : 1;
  const preferred = new THREE.Vector3(
    building.position[0],
    0,
    building.position[2] + zDirection * (building.size[1] / 2 + 0.42),
  );
  const tile = nearestPathTileToPoint(preferred);
  return tile ? pathPointForTile(tile) : visitorFallbackPathPoint();
}

function guestRoutePointsBetween(start, targetBuilding, visitorIndex = 0) {
  const startTile = nearestPathTileToPoint(start);
  const endTile = targetBuilding
    ? visitorPathTileForBuilding(targetBuilding)
    : nearestPathTileToPoint(visitorFallbackPathPoint());
  const routeTiles = visitorPathTilesBetween(startTile, endTile);
  const points = [];

  for (const tile of routeTiles) {
    appendDistinctPoint(points, pathPointForTile(tile));
  }

  appendDistinctPoint(points, visitorStopPointForBuilding(targetBuilding, visitorIndex));
  return points;
}

function visitorPathTileForBuilding(building) {
  if (!building) return nearestPathTileToPoint(visitorFallbackPathPoint());
  return nearestPathTileToPoint(visitorAccessPointForBuilding(building));
}

function visitorPathTilesBetween(startTile, endTile) {
  if (!startTile && !endTile) return [];
  if (!startTile) return [endTile];
  if (!endTile) return [startTile];
  if (startTile.key === endTile.key) return [startTile];

  const queue = [startTile];
  const previousByKey = new Map([[startTile.key, null]]);

  for (let readIndex = 0; readIndex < queue.length; readIndex += 1) {
    const current = queue[readIndex];
    if (current.key === endTile.key) break;

    for (const key of adjacentTileKeys(current)) {
      if (!pathTileKeys.has(key) || previousByKey.has(key)) continue;
      previousByKey.set(key, current.key);
      queue.push(pathTileFromKey(key));
    }
  }

  if (!previousByKey.has(endTile.key)) return [startTile];

  const path = [];
  for (let key = endTile.key; key; key = previousByKey.get(key)) {
    path.push(pathTileFromKey(key));
  }
  path.reverse();
  return path;
}

function visitorFallbackPathPoint() {
  const fallbackTile = nearestPathTileToPoint(new THREE.Vector3(1.8, 0, -0.7));
  return fallbackTile ? pathPointForTile(fallbackTile) : new THREE.Vector3(1.8, 0, -0.7);
}

function visitorPathLaneOffset(pathPoint, visitorIndex = 0) {
  const offset = ((visitorIndex % 5) - 2) * 0.055;
  const tile = pathTileAtPoint(pathPoint);
  if (!tile) return { x: 0, z: 0 };
  const east = pathTileKeys.has(`${tile.col + 1}:${tile.row}`);
  const west = pathTileKeys.has(`${tile.col - 1}:${tile.row}`);
  const north = pathTileKeys.has(`${tile.col}:${tile.row + 1}`);
  const south = pathTileKeys.has(`${tile.col}:${tile.row - 1}`);

  if ((east || west) && !(north || south)) return { x: 0, z: offset };
  return { x: offset, z: 0 };
}

function appendDistinctPoint(points, point) {
  const last = points[points.length - 1];
  if (!last || !pointsAreClose(last, point)) points.push(point.clone());
}

function pointsAreClose(left, right) {
  return Math.abs(left.x - right.x) < 0.03 && Math.abs(left.z - right.z) < 0.03;
}

function visitorTravelSeconds(routePoints) {
  let distance = 0;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    distance += routePoints[index].distanceTo(routePoints[index + 1]);
  }
  return Math.max(3, distance / VISITOR_WALK_SPEED);
}

function visitorPointAtTime(visitorIndex, time) {
  const routeState = visitorRouteState(visitorIndex, time);
  if (!routeState) {
    return { x: PARK_ENTRY_X, z: parkEntrySpawnZ(), angle: 0 };
  }
  if (routeState.dwell) {
    const point = routeState.routePoints[0] ?? new THREE.Vector3(PARK_ENTRY_X, 0, parkEntrySpawnZ());
    return {
      x: point.x,
      z: point.z,
      angle: visitorDwellAngle(visitorGroups[visitorIndex]),
    };
  }
  return pointAlongRoute(routeState.routePoints, routeState.t);
}

function visitorDwellAngle(visitor) {
  const building = buildingById(visitor?.userData.visitorCurrentBuildingId);
  if (!building) return 0;
  return Math.atan2(
    building.position[0] - visitor.position.x,
    building.position[2] - visitor.position.z,
  );
}

function pointAlongRoute(routePoints, t) {
  const segmentCount = routePoints.length - 1;
  if (segmentCount <= 0) {
    const point = routePoints[0] ?? new THREE.Vector3();
    return { x: point.x, z: point.z, angle: 0 };
  }

  const scaled = t * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = scaled - index;
  const start = routePoints[index];
  const end = routePoints[index + 1];
  const position = start.clone().lerp(end, local);
  return {
    x: position.x,
    z: position.z,
    angle: Math.atan2(end.x - start.x, end.z - start.z),
  };
}

function remainingRoutePoints(routePoints, t, height) {
  const segmentCount = routePoints.length - 1;
  if (segmentCount <= 0) return null;

  const safeT = THREE.MathUtils.clamp(t, 0, 0.999999);
  const scaled = safeT * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = scaled - index;
  const start = routePoints[index];
  const end = routePoints[index + 1];
  const current = start.clone().lerp(end, local);
  current.y = height;

  const points = [current];
  for (let pointIndex = index + 1; pointIndex < routePoints.length; pointIndex += 1) {
    const point = routePoints[pointIndex].clone();
    point.y = height;
    points.push(point);
  }

  return points.length >= 2 ? points : null;
}

function syncLocalAnimalUnlocks(resourceState = currentResourceState()) {
  const visitors = resourceState.values.visitors ?? 0;
  for (const species of animalSpeciesCatalog) {
    if (visitors >= species.requiredVisitors) {
      localAnimalAreaUnlocks.add(species.kind);
    }
  }
}

function currentAnimalSpeciesList(resourceState = currentResourceState()) {
  syncLocalAnimalUnlocks(resourceState);
  return animalSpeciesCatalog.map((species) => ({
    ...species,
    unlocked: localAnimalAreaUnlocks.has(species.kind),
    placed_count: localAnimalGroups.filter((animal) => animal.kind === species.kind).length,
  }));
}

function buildingById(id) {
  return buildings.find((building) => building.id === id) ?? null;
}

function animalGroupBuilding(animalGroup) {
  return animalGroup ? buildingById(animalGroup.buildingId) : null;
}

function createAnimalInfo(animalGroup) {
  return {
    id: animalGroup.id,
    label: animalGroup.label,
    category: "Animal",
    animal: animalGroup,
    getSummary: () => animalSummary(animalGroup),
    getDetails: () => animalDetails(animalGroup),
  };
}

function animalSummary(animalGroup) {
  const building = animalGroupBuilding(animalGroup);
  if (!building) return "Drag this animal group into a compatible habitat.";
  return `Currently in ${building.label}. Drag this group into an empty animal area or one holding the same species.`;
}

function animalDetails(animalGroup) {
  const building = animalGroupBuilding(animalGroup);
  const species = animalSpeciesByKind[animalGroup.kind];
  const fenceCounts = building ? localFenceCountsForBuilding(building) : {};
  return {
    Type: "Animal",
    Species: animalGroup.label,
    Habitat: building?.label ?? "Unassigned",
    Behavior: animalGroup.behavior ?? species?.behavior ?? "Idle",
    Appeal: species?.appeal ?? "Unknown",
    "Move Rule": "Empty area or same species only",
    ...(building
      ? {
          "Wood Fences": fenceCounts.wood_fence ?? 0,
          "Glass Barriers": fenceCounts.glass_barrier ?? 0,
          "Steel Fences": fenceCounts.steel_fence ?? 0,
        }
      : {}),
  };
}

function renderAnimalRoster() {
  const building = selectedElement?.building;
  if (!building || !isAnimalAreaBuilding(building)) {
    animalRosterEl.hidden = true;
    delete animalRosterEl.dataset.signature;
    animalRosterListEl.replaceChildren();
    return;
  }

  const resourceState = currentResourceState();
  const speciesList = currentAnimalSpeciesList(resourceState);
  const fenceCounts = localFenceCountsForBuilding(building);
  const areaAnimals = animalsForBuilding(building);
  const areaKind = areaAnimals[0]?.kind ?? null;
  const groupCount = areaAnimals.length;
  const constructionReady = constructionProgress(building, currentTime) >= 1;

  animalRosterEl.hidden = false;
  animalRosterSummaryEl.textContent =
    groupCount > 0
      ? `${groupCount} group${groupCount === 1 ? "" : "s"} placed in this area.`
      : "Choose an animal group for this area.";

  const signature = JSON.stringify({
    buildingId: building.id,
    constructionReady,
    areaKind,
    fenceCounts,
    species: speciesList.map((species) => ({
      kind: species.kind,
      unlocked: species.unlocked,
      placedCount: species.placed_count,
      fenceKind: species.fenceKind,
      minFenceCount: species.minFenceCount,
      affordable: species.purchaseCost.every(
        (cost) => (resourceState.values[cost.resource_id] ?? 0) >= cost.amount,
      ),
    })),
  });
  if (animalRosterEl.dataset.signature === signature) {
    return;
  }
  animalRosterEl.dataset.signature = signature;

  const fragment = document.createDocumentFragment();
  for (const species of speciesList) {
    const button = document.createElement("button");
    const affordable = species.purchaseCost.every(
      (cost) => (resourceState.values[cost.resource_id] ?? 0) >= cost.amount,
    );
    const matchingFenceCount = fenceCounts[species.fenceKind] ?? 0;
    const areaHasRequiredFence = matchingFenceCount >= species.minFenceCount;
    const mixedSpecies = areaKind && areaKind !== species.kind;
    const available = constructionReady && species.unlocked && areaHasRequiredFence;
    const purchaseCost = species.purchaseCost
      .map((cost) => `${cost.amount} ${cost.label}`)
      .join(", ");
    const statusCopy = !species.unlocked
      ? `Unlocks at ${species.requiredVisitors} visitors`
      : mixedSpecies
        ? `Area already contains ${animalSpeciesByKind[areaKind]?.label ?? "another species"}`
        : !constructionReady
          ? "Area is still under construction"
          : !areaHasRequiredFence
            ? `Needs ${species.minFenceCount} ${fenceLabels[species.fenceKind] ?? species.fenceKind} segment${species.minFenceCount === 1 ? "" : "s"}`
            : !affordable
              ? "Not enough resources"
              : "Purchase animal group";
    button.type = "button";
    button.className = `animal-roster-item${available ? " is-available" : ""}`;
    button.disabled = !available;
    button.innerHTML = `
      <div class="animal-roster-item-title">
        <strong>${species.label}</strong>
        <span>Appeal ${species.appeal}</span>
      </div>
      <div class="animal-roster-item-meta">
        <span>${species.placed_count} placed</span>
        <span>${species.requiredVisitors} visitors</span>
      </div>
      <div class="animal-roster-item-copy">${fenceLabels[species.fenceKind] ?? species.fenceKind} x${species.minFenceCount} • ${purchaseCost}</div>
      <div class="animal-roster-item-copy">${statusCopy}</div>
    `;
    button.addEventListener("click", () => purchaseAnimalForArea(building, species));
    fragment.append(button);
  }

  animalRosterListEl.replaceChildren(fragment);
}

function animalsForBuilding(building) {
  return localAnimalGroups.filter((animal) => animal.buildingId === building.id);
}

function localFenceCountsForBuilding(building) {
  const counts = Object.create(null);
  for (const segment of playerFenceSegments) {
    if (!fenceSegmentTouchesBuilding(segment, building)) continue;
    counts[segment.kind] = (counts[segment.kind] ?? 0) + 1;
  }
  return counts;
}

function purchaseAnimalForArea(building, species) {
  const resourceState = currentResourceState();
  syncLocalAnimalUnlocks(resourceState);
  const areaAnimals = animalsForBuilding(building);
  const areaKind = areaAnimals[0]?.kind ?? null;
  const fenceCounts = localFenceCountsForBuilding(building);
  if (constructionProgress(building, currentTime) < 1) {
    buildMenuStatusEl.textContent = `${building.label} is still under construction.`;
    renderAnimalRoster();
    return;
  }
  if (!localAnimalAreaUnlocks.has(species.kind)) {
    buildMenuStatusEl.textContent = `${species.label} unlocks at ${species.requiredVisitors} visitors.`;
    renderAnimalRoster();
    return;
  }
  if ((fenceCounts[species.fenceKind] ?? 0) < species.minFenceCount) {
    buildMenuStatusEl.textContent = `${species.label} needs ${species.minFenceCount} ${fenceLabels[species.fenceKind] ?? species.fenceKind} segment${species.minFenceCount === 1 ? "" : "s"}.`;
    renderAnimalRoster();
    return;
  }
  if (areaKind && areaKind !== species.kind) {
    buildMenuStatusEl.textContent = `${building.label} already contains ${animalSpeciesByKind[areaKind]?.label ?? "another species"}.`;
    renderAnimalRoster();
    return;
  }
  for (const cost of species.purchaseCost) {
    if ((resourceState.values[cost.resource_id] ?? 0) < cost.amount) {
      buildMenuStatusEl.textContent = `Need ${cost.amount} ${cost.label} to buy ${species.label}.`;
      renderAnimalRoster();
      return;
    }
  }

  for (const cost of species.purchaseCost) {
    localResourceSpend[cost.resource_id] = (localResourceSpend[cost.resource_id] ?? 0) + cost.amount;
  }
  addAnimalGroupToBuilding(building, species);
  updateState(currentTime);
  buildMenuStatusEl.textContent = `${species.label} added to ${building.label}.`;
}

function addAnimalGroupToBuilding(building, species) {
  localAnimalCount += 1;
  const group = buildingMeshes.get(building.id);
  if (!group) return;
  const profile = animalVisualProfiles[species.kind] ?? {
    color: 0xded6c1,
    scale: 0.62,
    behavior: "Idle",
  };
  const animalGroup = {
    id: `animal-group-${localAnimalCount}`,
    buildingId: building.id,
    kind: species.kind,
    label: species.label,
    behavior: profile.behavior,
    renderRoot: null,
  };
  const offset = animalDisplayOffset(building, animalsForBuilding(building).length);
  const renderRoot = addAnimal(
    group,
    [offset.x, 0.08, offset.z],
    profile.color,
    profile.scale,
    species.label,
    {
      animated: true,
      selectable: true,
      selectionInfo: createAnimalInfo(animalGroup),
      summary: `${species.label} settled into this enclosure.`,
    },
  );
  animalGroup.renderRoot = renderRoot;
  localAnimalGroups.push(animalGroup);
}

function animalDisplayOffset(building, index) {
  const columns = 2;
  const row = Math.floor(index / columns);
  const col = index % columns;
  const spacingX = Math.min(0.8, building.size[0] * 0.26);
  const spacingZ = Math.min(0.7, building.size[1] * 0.24);
  return {
    x: -spacingX / 2 + col * spacingX,
    z: -spacingZ / 2 + row * spacingZ,
  };
}

function relayoutAnimalsInBuilding(building) {
  if (!building) return;
  const group = buildingMeshes.get(building.id);
  if (!group) return;
  const areaAnimals = animalsForBuilding(building);
  for (const [index, animalGroup] of areaAnimals.entries()) {
    if (!animalGroup.renderRoot) continue;
    if (animalGroup.renderRoot.parent !== group) {
      animalGroup.renderRoot.parent?.remove(animalGroup.renderRoot);
      group.add(animalGroup.renderRoot);
    }
    const offset = animalDisplayOffset(building, index);
    animalGroup.renderRoot.position.set(offset.x, 0.08, offset.z);
  }
}

function animalTransferStatus(animalGroup, building) {
  if (!animalGroup) {
    return {
      allowed: false,
      reason: "Select an animal group first.",
    };
  }
  if (!building || !isAnimalAreaBuilding(building)) {
    return {
      allowed: false,
      reason: "Drop animals into an animal area.",
    };
  }
  if (building.id === animalGroup.buildingId) {
    return {
      allowed: false,
      reason: `${animalGroup.label} is already in ${building.label}.`,
    };
  }
  if (constructionProgress(building, currentTime) < 1) {
    return {
      allowed: false,
      reason: `${building.label} is still under construction.`,
    };
  }

  const areaAnimals = animalsForBuilding(building);
  const areaKind = areaAnimals[0]?.kind ?? null;
  if (areaKind && areaKind !== animalGroup.kind) {
    return {
      allowed: false,
      reason: `${building.label} already contains ${animalSpeciesByKind[areaKind]?.label ?? "another species"}.`,
    };
  }

  return {
    allowed: true,
    reason:
      areaAnimals.length > 0
        ? `Drop ${animalGroup.label} into ${building.label} with the matching species.`
        : `Drop ${animalGroup.label} into the empty ${building.label}.`,
  };
}

function moveAnimalGroupToBuilding(animalGroup, building) {
  const sourceBuilding = animalGroupBuilding(animalGroup);
  const targetGroup = buildingMeshes.get(building.id);
  if (!targetGroup || !animalGroup.renderRoot) return false;

  animalGroup.renderRoot.parent?.remove(animalGroup.renderRoot);
  targetGroup.add(animalGroup.renderRoot);
  animalGroup.buildingId = building.id;

  relayoutAnimalsInBuilding(sourceBuilding);
  relayoutAnimalsInBuilding(building);
  updateState(currentTime);
  return true;
}

function createBuildingInfo(building) {
  return {
    id: `building-${building.id}`,
    label: building.label,
    category: "Building",
    building,
    summary: building.details.Role,
    getDetails: () => {
      const group = buildingMeshes.get(building.id);
      const state = group?.userData.state ?? {
        level: 1,
        status: "Planned",
        production: "Idle",
      };
      const assignedWorkers = assignedWorkersForBuilding(building);
      const requiredWorkers = requiredWorkerCount(building);
      const pricingState = currentPricingState();
      const areaAnimals = animalsForBuilding(building);
      const fenceCounts = localFenceCountsForBuilding(building);
      const pricingDetails =
        (building.kind ?? building.id) === "customer_entry"
          ? {
              "Entry Fee": formatMoney(pricingState.entryFee),
              "Guest Willingness": formatMoney(pricingState.willingness),
              Demand: `${pricingState.demandPercent}%`,
              "Expected Guests": `${pricingState.expectedCustomersPerMinute} / min`,
            }
          : {};
      const animalDetails =
        isAnimalAreaBuilding(building)
          ? {
              Animals: areaAnimals.length
                ? areaAnimals.map((animal) => animal.label).join(", ")
                : "None",
              "Wood Fences": fenceCounts.wood_fence ?? 0,
              "Glass Barriers": fenceCounts.glass_barrier ?? 0,
              "Steel Fences": fenceCounts.steel_fence ?? 0,
            }
          : {};

      return {
        Type: "Building",
        Level: state.level,
        Status: state.status,
        Production: state.production,
        Manning: `${assignedWorkers.length} / ${requiredWorkers}`,
        Workers: assignedWorkers.length
          ? assignedWorkers.map((worker) => worker.label).join(", ")
          : "None",
        ...pricingDetails,
        ...animalDetails,
        ...building.details,
        Source: building.playerPlaced ? "Player placed" : "Built layout",
      };
    },
  };
}

function createWorkerInfo(worker) {
  return {
    id: `worker-${worker.id}`,
    label: worker.label,
    category: "Worker",
    getSummary: () => workerSummary(worker),
    getRoutePoints: () => workerRoutePoints(worker),
    worker,
    getDetails: () => workerDetails(worker),
  };
}

function workerRoutePoints(worker) {
  if (!worker.walkTarget) return null;

  return [
    new THREE.Vector3(worker.position[0], 0.18, worker.position[2]),
    new THREE.Vector3(worker.walkTarget[0], 0.18, worker.walkTarget[2]),
  ];
}

function workerSummary(worker) {
  if (worker.walkTarget) {
    return `Walking to ${worker.walkTargetLabel ?? "the selected point"}.`;
  }
  if (worker.assignmentTargetLabel) {
    return `Assigned to ${worker.assignmentTargetLabel}.`;
  }
  return "Idle on the zoo grounds.";
}

function workerPathLabel(worker) {
  if (worker.walkTarget) {
    const destination =
      worker.walkTargetLabel ??
      `${worker.walkTarget[0].toFixed(1)}, ${worker.walkTarget[2].toFixed(1)}`;
    return `${worker.position[0].toFixed(1)}, ${worker.position[2].toFixed(1)} -> ${destination}`;
  }
  if (worker.assignmentTargetLabel) {
    return `Holding at ${worker.assignmentTargetLabel}`;
  }
  return "No active path";
}

function workerDetails(worker) {
  return {
    Type: "Worker",
    Status: worker.walkTarget ? "Walking" : worker.assignmentTargetLabel ? "Assigned" : "Idle",
    Assignment: worker.assignmentTargetLabel ?? "None",
    "Assigned Building": worker.assignedBuildingLabel ?? "None",
    Path: workerPathLabel(worker),
    ...(worker.walkTarget ? { Destination: worker.walkTargetLabel ?? "Selected point" } : {}),
    Position: `${worker.position[0].toFixed(1)}, ${worker.position[2].toFixed(1)}`,
  };
}

function createResourceInfo(resource) {
  return {
    id: `resource-${resource.id}`,
    label: resource.label,
    category: "Resource",
    summary: resourceDescriptions[resource.id],
    getDetails: () => {
      const resourceState = currentResourceState();
      const value = resourceState.values[resource.id] ?? 0;
      const capacity = resourceState.capacities[resource.id];

      return {
        Type: "Resource",
        Amount: capacity ? `${value} / ${capacity}` : value,
        Capacity: capacity ?? "None",
        Phase: phaseForSimulation(),
      };
    },
  };
}

function createPlayerPathInfo(index, tiles) {
  return {
    id: `player-path-${index}`,
    label: `Guest Path ${index}`,
    category: "Path",
    summary: "A walkable route drawn across the zoo tiles.",
    getDetails: () => ({
      Type: "Path",
      Status: "Built",
      Source: "Player drawn",
      Length: `${tiles.length} tiles`,
    }),
  };
}

function createPlayerAreaInfo(index, tiles) {
  return {
    id: `player-area-${index}`,
    label: `Guest Area ${index}`,
    category: "Area",
    summary: "A player-defined zone on the zoo grounds.",
    getDetails: () => ({
      Type: "Area",
      Status: "Defined",
      Source: "Player defined",
      Footprint: `${tiles.length} tiles`,
    }),
  };
}

function createPlayerFenceInfo(index, segments) {
  const fenceKind = segments[0]?.kind ?? activeFenceKind;
  return {
    id: `player-fence-${index}`,
    label: `${fenceLabels[fenceKind] ?? "Fence"} ${index}`,
    category: "Fence",
    summary: "A fence line built across the zoo grounds.",
    getDetails: () => ({
      Type: "Fence",
      Kind: fenceLabels[fenceKind] ?? fenceKind,
      Status: "Built",
      Source: "Player built",
      Length: `${segments.length} segments`,
    }),
  };
}

function createStaticInfo({ id, label, category, summary, details }) {
  return {
    id,
    label,
    category,
    summary,
    getDetails: () => ({
      Type: category,
      ...details,
    }),
  };
}

function createPlacementPreview(item) {
  if (placementPreview) {
    scene.remove(placementPreview);
    disposeObject3D(placementPreview);
  }

  placementPreviewMaterial = new THREE.MeshBasicMaterial({
    color: 0x45a6b7,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const footprint = new THREE.Mesh(
    new THREE.BoxGeometry(item.size[0], 0.08, item.size[1]),
    placementPreviewMaterial,
  );
  footprint.position.y = 0.045;

  const ghostBuilding = createBuildingMesh(
    {
      id: `preview_${item.kind}`,
      kind: item.kind,
      label: item.label,
      size: item.size,
    },
    { preview: true },
  );
  ghostBuilding.position.y = 0.02;
  preparePlacementGhost(ghostBuilding);

  placementPreview = new THREE.Group();
  placementPreview.add(footprint, ghostBuilding);
  placementPreview.visible = false;
  scene.add(placementPreview);
}

function updatePlacementPreview(event) {
  if (!activeBuildItem || !placementSurface || !placementPreview) return null;

  const point = groundPointFromPointer(event);
  if (!point) {
    placementPreview.visible = false;
    placementValid = false;
    buildMenuStatusEl.textContent = "Point at the zoo grounds.";
    return null;
  }

  const position = snapPlacementPoint(point, activeBuildItem.size);
  placementValid = canPlaceBuilding(activeBuildItem, position);
  placementPreview.position.set(position.x, 0, position.z);
  placementPreview.visible = true;
  updatePlacementPreviewValidity(placementValid);
  buildMenuStatusEl.textContent = placementValid
    ? "Click to place."
    : placementInvalidMessage(activeBuildItem, position);
  return position;
}

function preparePlacementGhost(root) {
  root.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;

    if (!child.material) return;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const ghostMaterials = sourceMaterials.map((material) => {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.38;
      ghostMaterial.depthWrite = false;
      ghostMaterial.userData.placementGhost = true;
      if (ghostMaterial.emissive) {
        ghostMaterial.emissive.setHex(0x45a6b7);
        ghostMaterial.emissiveIntensity = 0.16;
      }
      return ghostMaterial;
    });

    child.material = Array.isArray(child.material) ? ghostMaterials : ghostMaterials[0];
  });
}

function updatePlacementPreviewValidity(valid) {
  if (!placementPreview) return;

  const tint = valid ? 0x45a6b7 : 0xd66b7a;
  placementPreviewMaterial.color.setHex(tint);
  placementPreview.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material.userData.placementGhost || !material.emissive) continue;
      material.emissive.setHex(tint);
      material.emissiveIntensity = valid ? 0.16 : 0.28;
    }
  });
}

function disposeObject3D(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function placeActiveBuilding(event) {
  const position = updatePlacementPreview(event);
  if (!activeBuildItem || !position || !placementValid) return false;

  placedBuildingCount += 1;
  const building = {
    id: `placed_${activeBuildItem.kind}_${placedBuildingCount}`,
    kind: activeBuildItem.kind,
    label: activeBuildItem.label,
    position: [position.x, 0, position.z],
    size: [...activeBuildItem.size],
    requiredWorkers: activeBuildItem.requiredWorkers ?? 0,
    resourceOutput: { ...(activeBuildItem.resourceOutput ?? {}) },
    buildStart: currentTime,
    buildEnd: currentTime + activeBuildItem.buildDuration,
    buildDuration: activeBuildItem.buildDuration,
    playerPlaced: true,
    details: {
      ...activeBuildItem.details,
      Cost: activeBuildItem.cost,
      Staffing: staffingLabel(activeBuildItem.requiredWorkers),
      Footprint: `${activeBuildItem.size[0]} x ${activeBuildItem.size[1]} tiles`,
    },
  };

  buildings.push(building);
  playerPlacedBuildings.push(building);
  const group = addBuildingToScene(building);
  selectElement(group.userData.selectionInfo, group);
  const placedLabel = activeBuildItem.label;
  const buildDuration = activeBuildItem.buildDuration;
  cancelPlacement();
  buildMenuStatusEl.textContent = buildDuration
    ? `${placedLabel} construction started (${buildDuration}s).`
    : `${placedLabel} placed.`;
  return true;
}

function startPathBuilder() {
  openBuildMenu();
  cancelPlacement();
  cancelAreaBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
  activePathTool = true;
  pathDrawing = false;
  pathDraftTiles = [];
  pathPreviewValid = false;
  ensurePathPreview();
  pathPreviewGroup.visible = true;
  controls.enabled = false;
  canvas.style.cursor = "crosshair";
  buildMenuStatusEl.textContent = "Drag from an existing path tile.";
  updatePathPreview();
  updatePathBuilderUi();
}

function cancelPathBuilder({ resetStatus = true } = {}) {
  activePathTool = false;
  pathDrawing = false;
  pathDraftTiles = [];
  pathPreviewValid = false;
  controls.enabled = true;
  if (pathPreviewGroup) {
    clearPathPreview();
    pathPreviewGroup.visible = false;
  }
  if (canvas.style.cursor === "crosshair") canvas.style.cursor = "";
  if (resetStatus) buildMenuStatusEl.textContent = "Choose a building or map tool.";
  updatePathBuilderUi();
}

function beginPathDraft(event) {
  const tile = pathTileFromPointer(event);
  if (!tile) {
    buildMenuStatusEl.textContent = "Point at the zoo grounds.";
    return;
  }
  if (!isExistingPathTile(tile)) {
    buildMenuStatusEl.textContent = "Start from an existing path tile.";
    return;
  }

  pathDrawing = true;
  pathDraftTiles = [];
  addPathDraftTile(tile);
  canvas.setPointerCapture?.(event.pointerId);
  buildMenuStatusEl.textContent = "Release to review.";
  updatePathPreview();
  updatePathBuilderUi();
}

function updatePathDraft(event) {
  if (!pathDrawing) return;
  const tile = pathTileFromPointer(event);
  if (!tile) return;
  addPathDraftTile(tile);
  updatePathPreview();
  updatePathBuilderUi();
}

function finishPathDraft(event = null) {
  if (!pathDrawing) return;
  if (event) {
    const tile = pathTileFromPointer(event);
    if (tile) addPathDraftTile(tile);
  }
  pathDrawing = false;
  if (event && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updatePathPreview();
  buildMenuStatusEl.textContent = pathPreviewValid
    ? "Confirm path."
    : pathDraftTiles.length === 0 || !isExistingPathTile(pathDraftTiles[0])
      ? "Start from an existing path tile."
      : pathDraftTiles.length < 2
        ? "Draw at least two tiles."
        : "Path crosses a building.";
  updatePathBuilderUi();
}

function addPathDraftTile(tile) {
  const last = pathDraftTiles.at(-1);
  if (!last) {
    pushUniquePathDraftTile(tile);
    return;
  }

  let current = { ...last };
  while (current.col !== tile.col || current.row !== tile.row) {
    const dx = tile.col - current.col;
    const dz = tile.row - current.row;
    if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) {
      current = { ...current, col: current.col + Math.sign(dx) };
    } else {
      current = { ...current, row: current.row + Math.sign(dz) };
    }
    pushUniquePathDraftTile(pathTileFromGrid(current.col, current.row));
  }
}

function pushUniquePathDraftTile(tile) {
  const previous = pathDraftTiles.at(-1);
  if (previous && previous.key === tile.key) return;

  const existingIndex = pathDraftTiles.findIndex((candidate) => candidate.key === tile.key);
  if (existingIndex >= 0) {
    pathDraftTiles.splice(existingIndex + 1);
    return;
  }

  pathDraftTiles.push(tile);
}

function updatePathPreview() {
  ensurePathPreview();
  clearPathPreview();

  const hasNewTiles = pathDraftTiles.some((tile) => !pathTileKeys.has(tile.key));
  const startsOnPath = pathDraftTiles.length > 0 && isExistingPathTile(pathDraftTiles[0]);
  pathPreviewValid =
    pathDraftTiles.length >= 2 &&
    startsOnPath &&
    hasNewTiles &&
    pathDraftTiles.every((tile) => canPlacePathTile(tile));

  for (const [index, tile] of pathDraftTiles.entries()) {
    const validTile = canPlacePathTile(tile) && (index > 0 || isExistingPathTile(tile));
    const mesh = new THREE.Mesh(
      pathTileGeometry,
      validTile ? pathPreviewValidMaterial : pathPreviewInvalidMaterial,
    );
    mesh.position.set(tile.x, 0.07, tile.z);
    pathPreviewGroup.add(mesh);
  }

  pathPreviewGroup.visible = activePathTool && pathDraftTiles.length > 0;
}

function clearPathPreview() {
  if (!pathPreviewGroup) return;
  while (pathPreviewGroup.children.length > 0) {
    pathPreviewGroup.remove(pathPreviewGroup.children[0]);
  }
}

function ensurePathPreview() {
  if (pathPreviewGroup) return;
  pathPreviewGroup = new THREE.Group();
  scene.add(pathPreviewGroup);
}

function confirmPathDraft() {
  if (!pathPreviewValid) return;

  const tilesToBuild = pathDraftTiles.filter((tile) => !pathTileKeys.has(tile.key));
  if (tilesToBuild.length === 0) return;

  playerPathCount += 1;
  const group = new THREE.Group();
  for (const tile of tilesToBuild) {
    const mesh = new THREE.Mesh(pathTileGeometry, playerPathMaterial);
    mesh.position.set(tile.x, 0.04, tile.z);
    mesh.receiveShadow = true;
    group.add(mesh);
    pathTileKeys.add(tile.key);
  }

  scene.add(group);
  const pathInfo = createPlayerPathInfo(playerPathCount, tilesToBuild);
  tagSelectable(group, pathInfo, group);
  selectElement(pathInfo, group);

  cancelPathBuilder({ resetStatus: false });
  buildMenuStatusEl.textContent = `${pathInfo.label} built.`;
}

function startAreaBuilder() {
  openBuildMenu();
  cancelPlacement();
  cancelPathBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
  activeAreaTool = true;
  areaDrawing = false;
  areaAnchorTile = null;
  areaDraftTiles = [];
  areaPreviewValid = false;
  ensureAreaPreview();
  areaPreviewGroup.visible = true;
  controls.enabled = false;
  canvas.style.cursor = "crosshair";
  buildMenuStatusEl.textContent = "Drag across tiles to define an area.";
  updateAreaPreview();
  updatePathBuilderUi();
}

function cancelAreaBuilder({ resetStatus = true } = {}) {
  activeAreaTool = false;
  areaDrawing = false;
  areaAnchorTile = null;
  areaDraftTiles = [];
  areaPreviewValid = false;
  controls.enabled = true;
  if (areaPreviewGroup) {
    clearAreaPreview();
    areaPreviewGroup.visible = false;
  }
  if (canvas.style.cursor === "crosshair") canvas.style.cursor = "";
  if (resetStatus) buildMenuStatusEl.textContent = "Choose a building or map tool.";
  updatePathBuilderUi();
}

function beginAreaDraft(event) {
  const tile = pathTileFromPointer(event);
  if (!tile) {
    buildMenuStatusEl.textContent = "Point at the zoo grounds.";
    return;
  }

  areaDrawing = true;
  areaAnchorTile = tile;
  areaDraftTiles = [tile];
  canvas.setPointerCapture?.(event.pointerId);
  buildMenuStatusEl.textContent = "Release to review.";
  updateAreaPreview();
  updatePathBuilderUi();
}

function updateAreaDraft(event) {
  if (!areaDrawing || !areaAnchorTile) return;
  const tile = pathTileFromPointer(event);
  if (!tile) return;
  areaDraftTiles = rectangleTiles(areaAnchorTile, tile);
  updateAreaPreview();
  updatePathBuilderUi();
}

function finishAreaDraft(event = null) {
  if (!areaDrawing) return;
  areaDrawing = false;
  if (event && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updateAreaPreview();
  buildMenuStatusEl.textContent = areaPreviewValid
    ? "Confirm area."
    : areaDraftTiles.length === 0
      ? "Drag across tiles."
      : "Area overlaps an existing area.";
  updatePathBuilderUi();
}

function rectangleTiles(first, second) {
  const minCol = Math.min(first.col, second.col);
  const maxCol = Math.max(first.col, second.col);
  const minRow = Math.min(first.row, second.row);
  const maxRow = Math.max(first.row, second.row);
  const tiles = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      tiles.push(pathTileFromGrid(col, row));
    }
  }

  return tiles;
}

function updateAreaPreview() {
  ensureAreaPreview();
  clearAreaPreview();

  const hasNewTiles = areaDraftTiles.some((tile) => !playerAreaTileKeys.has(tile.key));
  areaPreviewValid =
    areaDraftTiles.length > 0 &&
    hasNewTiles &&
    areaDraftTiles.every((tile) => canPlaceAreaTile(tile));

  for (const tile of areaDraftTiles) {
    const validTile = canPlaceAreaTile(tile);
    const mesh = new THREE.Mesh(
      areaTileGeometry,
      validTile ? areaPreviewValidMaterial : areaPreviewInvalidMaterial,
    );
    mesh.position.set(tile.x, 0.065, tile.z);
    areaPreviewGroup.add(mesh);
  }

  areaPreviewGroup.visible = activeAreaTool && areaDraftTiles.length > 0;
}

function ensureAreaPreview() {
  if (areaPreviewGroup) return;
  areaPreviewGroup = new THREE.Group();
  scene.add(areaPreviewGroup);
}

function clearAreaPreview() {
  if (!areaPreviewGroup) return;
  while (areaPreviewGroup.children.length > 0) {
    areaPreviewGroup.remove(areaPreviewGroup.children[0]);
  }
}

function confirmAreaDraft() {
  if (!areaPreviewValid) return;

  const tilesToBuild = areaDraftTiles.filter((tile) => !playerAreaTileKeys.has(tile.key));
  if (tilesToBuild.length === 0) return;

  playerAreaCount += 1;
  const group = new THREE.Group();
  for (const tile of tilesToBuild) {
    const mesh = new THREE.Mesh(areaTileGeometry, playerAreaMaterial);
    mesh.position.set(tile.x, 0.035, tile.z);
    mesh.receiveShadow = true;
    group.add(mesh);
    playerAreaTileKeys.add(tile.key);
  }

  scene.add(group);
  const areaInfo = createPlayerAreaInfo(playerAreaCount, tilesToBuild);
  tagSelectable(group, areaInfo, group);
  selectElement(areaInfo, group);

  cancelAreaBuilder({ resetStatus: false });
  buildMenuStatusEl.textContent = `${areaInfo.label} defined.`;
}

function startFenceBuilder() {
  openBuildMenu();
  cancelPlacement();
  cancelPathBuilder({ resetStatus: false });
  cancelAreaBuilder({ resetStatus: false });
  activeFenceTool = true;
  fenceDrawing = false;
  fenceAnchorTile = null;
  fenceDraftTiles = [];
  fencePreviewValid = false;
  ensureFencePreview();
  fencePreviewGroup.visible = true;
  controls.enabled = false;
  canvas.style.cursor = "crosshair";
  buildMenuStatusEl.textContent = "Drag a straight fence line.";
  updateFencePreview();
  updatePathBuilderUi();
}

function cancelFenceBuilder({ resetStatus = true } = {}) {
  activeFenceTool = false;
  fenceDrawing = false;
  fenceAnchorTile = null;
  fenceDraftTiles = [];
  fencePreviewValid = false;
  controls.enabled = true;
  if (fencePreviewGroup) {
    clearFencePreview();
    fencePreviewGroup.visible = false;
  }
  if (canvas.style.cursor === "crosshair") canvas.style.cursor = "";
  if (resetStatus) buildMenuStatusEl.textContent = "Choose a building or map tool.";
  updatePathBuilderUi();
}

function beginFenceDraft(event) {
  const point = fencePointFromPointer(event);
  if (!point) {
    buildMenuStatusEl.textContent = "Point at the zoo grounds.";
    return;
  }

  fenceDrawing = true;
  fenceAnchorTile = point;
  fenceDraftTiles = [point];
  canvas.setPointerCapture?.(event.pointerId);
  buildMenuStatusEl.textContent = "Release to review.";
  updateFencePreview();
  updatePathBuilderUi();
}

function updateFenceDraft(event) {
  if (!fenceDrawing || !fenceAnchorTile) return;
  const point = fencePointFromPointer(event);
  if (!point) return;
  fenceDraftTiles = lineFencePoints(fenceAnchorTile, point);
  updateFencePreview();
  updatePathBuilderUi();
}

function finishFenceDraft(event = null) {
  if (!fenceDrawing) return;
  fenceDrawing = false;
  if (event && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updateFencePreview();
  buildMenuStatusEl.textContent = fencePreviewValid
    ? "Confirm fence."
    : fenceDraftTiles.length < 2
      ? "Drag at least two tiles."
      : fenceDraftNeedsAnimalAreaAttachment()
        ? "Fence must touch an animal area."
        : "Fence crosses a building or existing fence.";
  updatePathBuilderUi();
}

function lineFencePoints(first, second) {
  const horizontal = Math.abs(second.col - first.col) >= Math.abs(second.row - first.row);
  const points = [];

  if (horizontal) {
    const step = second.col >= first.col ? 1 : -1;
    for (let col = first.col; col !== second.col + step; col += step) {
      points.push(fencePointFromGrid(col, first.row));
    }
    return points;
  }

  const step = second.row >= first.row ? 1 : -1;
  for (let row = first.row; row !== second.row + step; row += step) {
    points.push(fencePointFromGrid(first.col, row));
  }
  return points;
}

function updateFencePreview() {
  ensureFencePreview();
  clearFencePreview();

  const segments = fenceSegmentsFromPoints(fenceDraftTiles);
  const hasNewSegments = segments.some((segment) => !playerFenceSegmentKeys.has(segment.key));
  fencePreviewValid =
    segments.length > 0 &&
    hasNewSegments &&
    fenceDraftHasRequiredAttachment(segments) &&
    segments.every((segment) => canPlaceFenceSegment(segment));

  const preview = createFenceMesh(segments, {
    preview: true,
    valid: fencePreviewValid,
  });
  fencePreviewGroup.add(preview);
  fencePreviewGroup.visible = activeFenceTool && segments.length > 0;
}

function ensureFencePreview() {
  if (fencePreviewGroup) return;
  fencePreviewGroup = new THREE.Group();
  scene.add(fencePreviewGroup);
}

function clearFencePreview() {
  if (!fencePreviewGroup) return;
  while (fencePreviewGroup.children.length > 0) {
    fencePreviewGroup.remove(fencePreviewGroup.children[0]);
  }
}

function confirmFenceDraft() {
  if (!fencePreviewValid) return;

  const segmentsToBuild = fenceSegmentsFromPoints(fenceDraftTiles).filter(
    (segment) => !playerFenceSegmentKeys.has(segment.key),
  );
  if (segmentsToBuild.length === 0) return;

  playerFenceCount += 1;
  const builtSegments = segmentsToBuild.map((segment) => ({ ...segment, kind: activeFenceKind }));
  const group = createFenceMesh(builtSegments);
  for (const segment of segmentsToBuild) {
    playerFenceSegmentKeys.add(segment.key);
  }
  playerFenceSegments.push(...builtSegments);

  scene.add(group);
  const fenceInfo = createPlayerFenceInfo(playerFenceCount, builtSegments);
  tagSelectable(group, fenceInfo, group);
  selectElement(fenceInfo, group);

  cancelFenceBuilder({ resetStatus: false });
  buildMenuStatusEl.textContent = `${fenceInfo.label} built.`;
}

function cancelMapBuilder() {
  cancelPathBuilder();
  cancelAreaBuilder({ resetStatus: false });
  cancelFenceBuilder({ resetStatus: false });
}

function updatePathBuilderUi() {
  drawPathEl.setAttribute("aria-pressed", String(activePathTool));
  confirmPathEl.disabled = !pathPreviewValid;
  drawAreaEl.setAttribute("aria-pressed", String(activeAreaTool));
  confirmAreaEl.disabled = !areaPreviewValid;
  drawFenceEl.setAttribute("aria-pressed", String(activeFenceTool));
  confirmFenceEl.disabled = !fencePreviewValid;
  cancelPathEl.disabled =
    !activePathTool &&
    !activeAreaTool &&
    !activeFenceTool &&
    pathDraftTiles.length === 0 &&
    areaDraftTiles.length === 0 &&
    fenceDraftTiles.length === 0;
}

function pathTileFromPointer(event) {
  const point = groundPointFromPointer(event);
  if (!point) return null;
  const col = tileIndexForCoordinate(point.x, playableArea.minX, gridColumns);
  const row = tileIndexForCoordinate(point.z, playableArea.minZ, gridRows);
  return pathTileFromGrid(col, row);
}

function pathTileFromGrid(col, row) {
  const maxCol = gridColumns - 1;
  const maxRow = gridRows - 1;
  const clampedCol = THREE.MathUtils.clamp(col, 0, maxCol);
  const clampedRow = THREE.MathUtils.clamp(row, 0, maxRow);
  return {
    col: clampedCol,
    row: clampedRow,
    x: playableArea.minX + clampedCol * PATH_TILE_SIZE + PATH_TILE_SIZE / 2,
    z: playableArea.minZ + clampedRow * PATH_TILE_SIZE + PATH_TILE_SIZE / 2,
    key: `${clampedCol}:${clampedRow}`,
  };
}

function pathTileFromKey(key) {
  const [col, row] = key.split(":").map((value) => Number.parseInt(value, 10));
  return pathTileFromGrid(col, row);
}

function pathTileAtPoint(point) {
  if (!point) return null;
  const col = tileIndexForCoordinate(point.x, playableArea.minX, gridColumns);
  const row = tileIndexForCoordinate(point.z, playableArea.minZ, gridRows);
  return pathTileFromGrid(col, row);
}

function pathPointForTile(tile) {
  return new THREE.Vector3(tile.x, 0, tile.z);
}

function nearestPathTileToPoint(point) {
  if (!point || pathTileKeys.size === 0) return null;

  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const key of pathTileKeys) {
    const tile = pathTileFromKey(key);
    const dx = tile.x - point.x;
    const dz = tile.z - point.z;
    const distance = dx * dx + dz * dz;
    if (distance < closestDistance) {
      closest = tile;
      closestDistance = distance;
    }
  }

  return closest;
}

function pointIsOnExistingPathTile(point) {
  const tile = pathTileAtPoint(point);
  return Boolean(tile && pathTileKeys.has(tile.key));
}

function fencePointFromPointer(event) {
  const point = groundPointFromPointer(event);
  if (!point) return null;
  const col = gridLineIndexForCoordinate(point.x, playableArea.minX, gridColumns);
  const row = gridLineIndexForCoordinate(point.z, playableArea.minZ, gridRows);
  return fencePointFromGrid(col, row);
}

function fencePointFromGrid(col, row) {
  const clampedCol = THREE.MathUtils.clamp(col, 0, gridColumns);
  const clampedRow = THREE.MathUtils.clamp(row, 0, gridRows);
  return {
    col: clampedCol,
    row: clampedRow,
    x: playableArea.minX + clampedCol * PATH_TILE_SIZE,
    z: playableArea.minZ + clampedRow * PATH_TILE_SIZE,
    key: `${clampedCol}:${clampedRow}`,
  };
}

function tileIndexForCoordinate(value, min, count) {
  return THREE.MathUtils.clamp(Math.floor((value - min) / PATH_TILE_SIZE), 0, count - 1);
}

function gridLineIndexForCoordinate(value, min, count) {
  return THREE.MathUtils.clamp(Math.round((value - min) / PATH_TILE_SIZE), 0, count);
}

function pathTilesFromBounds(x, z, width, depth) {
  const maxCol = gridColumns - 1;
  const maxRow = gridRows - 1;
  const minCol = THREE.MathUtils.clamp(
    Math.floor((x - width / 2 - playableArea.minX) / PATH_TILE_SIZE),
    0,
    maxCol,
  );
  const maxCoveredCol = THREE.MathUtils.clamp(
    Math.floor((x + width / 2 - playableArea.minX - PATH_TILE_EPSILON) / PATH_TILE_SIZE),
    0,
    maxCol,
  );
  const minRow = THREE.MathUtils.clamp(
    Math.floor((z - depth / 2 - playableArea.minZ) / PATH_TILE_SIZE),
    0,
    maxRow,
  );
  const maxCoveredRow = THREE.MathUtils.clamp(
    Math.floor((z + depth / 2 - playableArea.minZ - PATH_TILE_EPSILON) / PATH_TILE_SIZE),
    0,
    maxRow,
  );

  const tiles = [];
  for (let row = minRow; row <= maxCoveredRow; row += 1) {
    for (let col = minCol; col <= maxCoveredCol; col += 1) {
      tiles.push(pathTileFromGrid(col, row));
    }
  }
  return tiles;
}

function isExistingPathTile(tile) {
  return pathTileKeys.has(tile.key);
}

function canPlacePathTile(tile) {
  const candidate = {
    x: tile.x,
    z: tile.z,
    width: PATH_TILE_VISUAL_SIZE,
    depth: PATH_TILE_VISUAL_SIZE,
  };

  return buildings.every((building) => {
    const group = buildingMeshes.get(building.id);
    if (!group) return true;
    return !footprintsOverlap(candidate, {
      x: building.position[0],
      z: building.position[2],
      width: building.size[0],
      depth: building.size[1],
    });
  });
}

function canPlaceAreaTile(tile) {
  return !playerAreaTileKeys.has(tile.key);
}

function fenceSegmentsFromPoints(points) {
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start.key === end.key) continue;
    segments.push({
      start,
      end,
      key: fenceSegmentKey(start, end),
    });
  }
  return segments;
}

function fenceSegmentKey(first, second) {
  const keys = [first.key, second.key].sort();
  return `${keys[0]}:${keys[1]}`;
}

function canPlaceFenceSegment(segment) {
  if (playerFenceSegmentKeys.has(segment.key)) return false;

  return buildings.every((building) => {
    const group = buildingMeshes.get(building.id);
    if (!group) return true;
    return !fenceSegmentCutsBuilding(segment, building);
  });
}

function fenceSegmentCutsBuilding(segment, building) {
  const occupiedTiles = new Set(
    footprintTiles(
      building.position[0],
      building.position[2],
      building.size[0],
      building.size[1],
    ).map((tile) => tile.key),
  );
  const adjacentTiles = tilesAdjacentToFenceSegment(segment);

  return adjacentTiles.length === 2 && adjacentTiles.every((tile) => occupiedTiles.has(tile.key));
}

function tilesAdjacentToFenceSegment(segment) {
  const horizontal = segment.start.row === segment.end.row;
  const tiles = [];

  if (horizontal) {
    const col = Math.min(segment.start.col, segment.end.col);
    for (const row of [segment.start.row - 1, segment.start.row]) {
      if (tileIsInBounds(col, row)) tiles.push(pathTileFromGrid(col, row));
    }
    return tiles;
  }

  const row = Math.min(segment.start.row, segment.end.row);
  for (const col of [segment.start.col - 1, segment.start.col]) {
    if (tileIsInBounds(col, row)) tiles.push(pathTileFromGrid(col, row));
  }
  return tiles;
}

function tileIsInBounds(col, row) {
  return col >= 0 && col < gridColumns && row >= 0 && row < gridRows;
}

function fenceDraftHasRequiredAttachment(segments) {
  if (!requiresAnimalAreaFenceAttachment()) return true;
  return segments.some((segment) =>
    buildings.some(
      (building) =>
        isAnimalAreaBuilding(building) && fenceSegmentTouchesBuilding(segment, building),
    ),
  );
}

function fenceDraftNeedsAnimalAreaAttachment() {
  return (
    requiresAnimalAreaFenceAttachment() &&
    !fenceDraftHasRequiredAttachment(fenceSegmentsFromPoints(fenceDraftTiles))
  );
}

function requiresAnimalAreaFenceAttachment() {
  return buildings.some(isAnimalAreaBuilding);
}

function isAnimalAreaBuilding(building) {
  return (building.kind ?? building.id) === "animal_area";
}

function fenceSegmentTouchesBuilding(segment, building) {
  const fence = fenceSegmentBounds(segment);
  const target = buildingBounds(building);
  const tolerance = 0.6;
  return (
    Math.abs(fence.x - target.x) <= (fence.width + target.width) / 2 + tolerance &&
    Math.abs(fence.z - target.z) <= (fence.depth + target.depth) / 2 + tolerance
  );
}

function fenceSegmentBounds(segment) {
  const horizontal = segment.start.row === segment.end.row;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    z: (segment.start.z + segment.end.z) / 2,
    width: horizontal ? PATH_TILE_SIZE : 0.18,
    depth: horizontal ? 0.18 : PATH_TILE_SIZE,
  };
}

function buildingBounds(building) {
  return {
    x: building.position[0],
    z: building.position[2],
    width: building.size[0],
    depth: building.size[1],
  };
}

function createFenceMesh(segments, { preview = false, valid = true } = {}) {
  const group = new THREE.Group();
  const postKeys = new Set();

  for (const segment of segments) {
    const { rail: railMaterial, post: postMaterial } = fenceMaterialsForKind(
      segment.kind ?? activeFenceKind,
      { preview, valid },
    );
    const horizontal = segment.start.row === segment.end.row;
    const centerX = (segment.start.x + segment.end.x) / 2;
    const centerZ = (segment.start.z + segment.end.z) / 2;
    const railSize = horizontal ? [PATH_TILE_SIZE, 0.075, 0.075] : [0.075, 0.075, PATH_TILE_SIZE];

    addFenceRail(group, [centerX, 0.52, centerZ], railSize, railMaterial);
    addFenceRail(group, [centerX, 0.24, centerZ], railSize, railMaterial);

    for (const tile of [segment.start, segment.end]) {
      if (postKeys.has(tile.key)) continue;
      postKeys.add(tile.key);
      addFencePost(group, [tile.x, 0.36, tile.z], postMaterial);
    }
  }

  return group;
}

function fenceMaterialsForKind(kind, { preview = false, valid = true } = {}) {
  if (preview) {
    return {
      rail: valid ? fencePreviewValidMaterial : fencePreviewInvalidMaterial,
      post: valid ? fencePreviewValidMaterial : fencePreviewInvalidMaterial,
    };
  }

  if (kind === "steel_fence") {
    return {
      rail: new THREE.MeshStandardMaterial({ color: 0x8f9aa2, roughness: 0.72 }),
      post: new THREE.MeshStandardMaterial({ color: 0x5b666d, roughness: 0.74 }),
    };
  }

  if (kind === "glass_barrier") {
    return {
      rail: new THREE.MeshStandardMaterial({
        color: 0x9ed1da,
        roughness: 0.16,
        metalness: 0.08,
        transparent: true,
        opacity: 0.82,
      }),
      post: new THREE.MeshStandardMaterial({ color: 0x6a8f99, roughness: 0.76 }),
    };
  }

  return {
    rail: playerFenceRailMaterial,
    post: playerFencePostMaterial,
  };
}

function groundPointFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hit = raycaster.intersectObject(placementSurface, false)[0];
  return hit?.point ?? null;
}

function snapPlacementPoint(point, size) {
  return {
    x: snapCoordinateToTileCenter(
      point.x,
      playableArea.minX,
      playableArea.maxX,
      gridColumns,
      size[0],
    ),
    z: snapCoordinateToTileCenter(
      point.z,
      playableArea.minZ,
      playableArea.maxZ,
      gridRows,
      size[1],
    ),
  };
}

function snapCoordinateToTileCenter(value, min, max, tileCount, footprint) {
  const firstCenter = min + PATH_TILE_SIZE / 2;
  const halfFootprint = footprint / 2;
  const requestedIndex = tileIndexForCoordinate(value, min, tileCount);
  const minIndex = Math.max(0, Math.ceil((min + halfFootprint - firstCenter) / PATH_TILE_SIZE));
  const maxIndex = Math.min(
    tileCount - 1,
    Math.floor((max - halfFootprint - firstCenter) / PATH_TILE_SIZE),
  );

  if (minIndex > maxIndex) {
    return THREE.MathUtils.clamp(value, min + halfFootprint, max - halfFootprint);
  }

  const index = THREE.MathUtils.clamp(requestedIndex, minIndex, maxIndex);
  return firstCenter + index * PATH_TILE_SIZE;
}

function canPlaceBuilding(item, position) {
  const candidate = {
    x: position.x,
    z: position.z,
    width: item.size[0],
    depth: item.size[1],
  };

  const clear = buildings.every((building) => {
    const group = buildingMeshes.get(building.id);
    if (!group) return true;
    return !footprintsOverlap(candidate, buildingBounds(building));
  });

  if (!clear) return false;
  if (item.requiresPath && !buildingFootprintIsPathAdjacent(item, position)) {
    return false;
  }
  return true;
}

function placementInvalidMessage(item, position) {
  if (item.requiresPath && !buildingFootprintIsPathAdjacent(item, position)) {
    return `${item.label} must touch a path.`;
  }
  return "Choose a clear tile.";
}

function buildingFootprintIsPathAdjacent(item, position) {
  const tiles = footprintTiles(position.x, position.z, item.size[0], item.size[1]);
  return (
    tiles.every((tile) => !pathTileKeys.has(tile.key)) &&
    tiles.some((tile) => adjacentTileKeys(tile).some((key) => pathTileKeys.has(key)))
  );
}

function footprintTiles(x, z, width, depth) {
  const maxCol = gridColumns - 1;
  const maxRow = gridRows - 1;
  const minCol = THREE.MathUtils.clamp(
    Math.floor((x - width / 2 - playableArea.minX) / PATH_TILE_SIZE),
    0,
    maxCol,
  );
  const maxCoveredCol = THREE.MathUtils.clamp(
    Math.floor((x + width / 2 - playableArea.minX - PATH_TILE_EPSILON) / PATH_TILE_SIZE),
    0,
    maxCol,
  );
  const minRow = THREE.MathUtils.clamp(
    Math.floor((z - depth / 2 - playableArea.minZ) / PATH_TILE_SIZE),
    0,
    maxRow,
  );
  const maxCoveredRow = THREE.MathUtils.clamp(
    Math.floor((z + depth / 2 - playableArea.minZ - PATH_TILE_EPSILON) / PATH_TILE_SIZE),
    0,
    maxRow,
  );

  const tiles = [];
  for (let row = minRow; row <= maxCoveredRow; row += 1) {
    for (let col = minCol; col <= maxCoveredCol; col += 1) {
      tiles.push(pathTileFromGrid(col, row));
    }
  }
  return tiles;
}

function adjacentTileKeys(tile) {
  return [
    `${tile.col + 1}:${tile.row}`,
    `${tile.col - 1}:${tile.row}`,
    `${tile.col}:${tile.row + 1}`,
    `${tile.col}:${tile.row - 1}`,
  ];
}

function footprintsOverlap(first, second, padding = 0.16) {
  return (
    Math.abs(first.x - second.x) < (first.width + second.width) / 2 + padding &&
    Math.abs(first.z - second.z) < (first.depth + second.depth) / 2 + padding
  );
}

function tagSelectable(root, selectionInfo, highlightRoot = root) {
  root.userData.selectionInfo = selectionInfo;
  root.userData.selectionRoot = highlightRoot;

  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.userData.selectionInfo) {
      child.userData.selectionInfo = selectionInfo;
      child.userData.selectionRoot = highlightRoot;
    }
    if (!selectable.includes(child)) selectable.push(child);
  });
}

function selectElement(selectionInfo, highlightRoot = null) {
  selectedElement = selectionInfo;
  selectedRoot = highlightRoot;
  renderSelection();
  updateSelectionStyles();
  updateSelectionRouteIndicator();
}

function renderSelection() {
  if (!selectedElement) return;

  inspectorTitleEl.textContent = selectedElement.label;
  inspectorSummaryEl.textContent =
    selectedElement.worker === activeWorkerCommand
      ? "Command mode: click the ground or a target to send this worker there."
      : selectedElement.getSummary?.() ?? selectedElement.summary;
  renderInspectorActions();
  renderAnimalRoster();
  const entries = selectedElement.getDetails?.() ?? {};

  inspectorDetailsEl.replaceChildren(
    ...Object.entries(entries).flatMap(([key, value]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

function renderInspectorActions() {
  if (!selectedElement?.building && !selectedElement?.worker) {
    delete inspectorActionsEl.dataset.actionSignature;
    inspectorActionsEl.replaceChildren();
    return;
  }

  const actions = inspectorActionsForSelection();
  const signature = actions
    .map((action) => `${action.label}:${action.hotkey}:${action.disabled ? "disabled" : "enabled"}`)
    .join("|");

  if (inspectorActionsEl.dataset.actionSignature === signature) {
    return;
  }

  inspectorActionsEl.dataset.actionSignature = signature;
  inspectorActionsEl.replaceChildren();
  inspectorActionsEl.append(...actions.map(renderInspectorActionButton));
}

function inspectorActionsForSelection() {
  if (selectedElement?.building) {
    const building = selectedElement.building;
    const required = requiredWorkerCount(building);
    const assigned = assignedWorkerCount(building);
    return [
      {
        label: required > assigned ? `Assign Worker (${assigned}/${required})` : "Fully Manned",
        hotkey: SELECTION_ACTION_HOTKEYS.assignWorker,
        disabled: required <= assigned,
        run: () => spawnWorkerForBuilding(building),
      },
    ];
  }

  if (selectedElement?.worker) {
    const worker = selectedElement.worker;
    const buildingActions = buildings
      .filter(
        (building) =>
          requiredWorkerCount(building) > 0 || worker.assignedBuildingId === building.id,
      )
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((building) => ({
        label: `Assign to ${building.label}`,
        hotkey: null,
        disabled: !canReassignWorkerToBuilding(worker, building),
        run: () => assignWorkerToBuilding(worker, building),
      }));

    return [
      {
        label: activeWorkerCommand === worker ? "Command Pending" : "Command Worker",
        hotkey: SELECTION_ACTION_HOTKEYS.commandWorker,
        disabled: false,
        run: () => startWorkerCommand(worker),
      },
      ...buildingActions,
    ];
  }

  return [];
}

function renderInspectorActionButton(action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inspector-action";
  button.disabled = action.disabled;
  setButtonLabelWithHotkey(button, action.label, action.hotkey);
  button.addEventListener("click", action.run);
  return button;
}

function prepareAnimalDrag(hit, event) {
  if (!hit?.info?.animal) return;
  activeAnimalDrag = {
    animal: hit.info.animal,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    hoverBuilding: null,
    hoverAllowed: false,
    sourceBuildingId: hit.info.animal.buildingId,
  };
}

function beginAnimalDrag(event) {
  if (!activeAnimalDrag || activeAnimalDrag.started) return;
  const renderRoot = activeAnimalDrag.animal.renderRoot;
  if (!renderRoot) return;

  activeAnimalDrag.started = true;
  controls.enabled = false;
  cancelLongPress();

  const worldPosition = worldPositionForObject(renderRoot);
  renderRoot.parent?.remove(renderRoot);
  scene.add(renderRoot);
  renderRoot.position.copy(worldPosition);

  canvas.setPointerCapture?.(event.pointerId);
  updateAnimalDrag(event);
}

function updateAnimalDrag(event) {
  if (!activeAnimalDrag || activeAnimalDrag.pointerId !== event.pointerId) return false;

  if (!activeAnimalDrag.started) {
    const distance = Math.hypot(event.clientX - activeAnimalDrag.startX, event.clientY - activeAnimalDrag.startY);
    if (distance < ANIMAL_DRAG_THRESHOLD) {
      canvas.style.cursor = "grab";
      return true;
    }
    beginAnimalDrag(event);
  }

  const point = groundPointFromPointer(event);
  if (point && activeAnimalDrag.animal.renderRoot) {
    const destination = clampWorkerDestination(point.x, point.z);
    activeAnimalDrag.animal.renderRoot.position.set(destination.x, 0.08, destination.z);
  }

  const hoverBuilding = point ? animalAreaBuildingAtPoint(point, activeAnimalDrag.animal.buildingId) : null;
  const status = animalTransferStatus(activeAnimalDrag.animal, hoverBuilding);
  activeAnimalDrag.hoverBuilding = hoverBuilding;
  activeAnimalDrag.hoverAllowed = status.allowed;
  buildMenuStatusEl.textContent = status.reason;
  canvas.style.cursor = status.allowed ? "grabbing" : "not-allowed";
  return true;
}

function finishAnimalDrag(event) {
  if (!activeAnimalDrag || activeAnimalDrag.pointerId !== event.pointerId) return false;

  if (activeAnimalDrag.started) {
    updateAnimalDrag(event);
  }

  const drag = activeAnimalDrag;
  activeAnimalDrag = null;

  if (canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  controls.enabled = true;

  if (drag.started && drag.hoverAllowed && drag.hoverBuilding) {
    moveAnimalGroupToBuilding(drag.animal, drag.hoverBuilding);
    buildMenuStatusEl.textContent = `${drag.animal.label} moved to ${drag.hoverBuilding.label}.`;
    canvas.style.cursor = "pointer";
    return true;
  }

  restoreDraggedAnimal(drag);
  if (drag.started) {
    buildMenuStatusEl.textContent =
      "Drop animal groups into an empty animal area or one containing the same species.";
  }
  canvas.style.cursor = "";
  return drag.started;
}

function cancelAnimalDrag() {
  if (!activeAnimalDrag) return;
  const drag = activeAnimalDrag;
  activeAnimalDrag = null;
  restoreDraggedAnimal(drag);
  controls.enabled = true;
  canvas.style.cursor = "";
}

function restoreDraggedAnimal(drag) {
  if (!drag?.started) return;
  const sourceBuilding = buildingById(drag.sourceBuildingId);
  if (!sourceBuilding) return;
  const sourceGroup = buildingMeshes.get(sourceBuilding.id);
  if (!sourceGroup || !drag.animal.renderRoot) return;
  drag.animal.renderRoot.parent?.remove(drag.animal.renderRoot);
  sourceGroup.add(drag.animal.renderRoot);
  relayoutAnimalsInBuilding(sourceBuilding);
  updateState(currentTime);
}

function animalAreaBuildingAtPoint(point, excludeBuildingId = null) {
  return (
    buildings.find(
      (building) =>
        building.id !== excludeBuildingId &&
        isAnimalAreaBuilding(building) &&
        pointInsideBuildingFootprint(point, building),
    ) ?? null
  );
}

function pointInsideBuildingFootprint(point, building, padding = 0) {
  return (
    Math.abs(point.x - building.position[0]) <= building.size[0] / 2 + padding &&
    Math.abs(point.z - building.position[2]) <= building.size[1] / 2 + padding
  );
}

function startWorkerCommand(worker) {
  if (!worker) return;
  hideContextMenu();
  closeBuildMenu();
  activeWorkerCommand = worker;
  if (selectedElement?.worker === worker) {
    renderSelection();
  }
}

function cancelWorkerCommand() {
  if (!activeWorkerCommand) return;
  const worker = activeWorkerCommand;
  activeWorkerCommand = null;
  if (selectedElement?.worker === worker) {
    renderSelection();
  }
}

function finishWorkerCommand(worker) {
  if (activeWorkerCommand === worker) {
    activeWorkerCommand = null;
  }
  if (selectedElement?.worker === worker) {
    renderSelection();
  }
}

function updateSelectionStyles() {
  for (const mesh of selectable) {
    setHighlight(mesh, false);
  }

  if (selectedRoot) {
    selectedRoot.traverse((child) => setHighlight(child, true));
  }

  for (const row of resourceRows.values()) {
    row.element.classList.toggle(
      "is-selected",
      row.element.dataset.selectionId === selectedElement?.id,
    );
  }
}

function setHighlight(object, selected) {
  if (!object.material || object.userData.productionRing) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material.emissive) continue;
    material.emissive.setHex(0x15251b);
    material.emissiveIntensity = selected ? 0.32 : 0;
  }
}

function updateSelectionRouteIndicator() {
  const points = selectedElement?.getRoutePoints?.();
  if (!points || points.length < 2) {
    selectionRoute.visible = false;
    selectionRouteTarget.visible = false;
    return;
  }

  selectionRoute.geometry.setFromPoints(points);
  selectionRoute.visible = true;

  const destination = points[points.length - 1];
  selectionRouteTarget.position.copy(destination);
  selectionRouteTarget.visible = true;
}

function onContextMenu(event) {
  event.preventDefault();
  if (activeBuildItem || activePathTool || activeAreaTool || activeFenceTool) return;
  if (handleSelectedWorkerContextCommand(event)) {
    cancelWorkerCommand();
    return;
  }
  openContextMenuAt(event.clientX, event.clientY);
}

function handleSelectedWorkerContextCommand(event) {
  const worker = selectedElement?.worker;
  if (!worker) return false;
  return handleWorkerCommandPointer(worker, event, { allowSelfSelection: false });
}

function handleWorkerCommandPointer(worker, event, options = {}) {
  const hit = selectionHitFromPointer(event);
  if (!options.allowSelfSelection && hit?.info?.worker === worker) return false;

  if (!hit || isGroundSelection(hit.info)) {
    const point = groundPointFromPointer(event);
    if (!point) return false;
    moveWorkerToGroundPoint(worker, point);
    return true;
  }

  assignWorkerToSelection(worker, hit);
  return true;
}

function isGroundSelection(selectionInfo) {
  return selectionInfo?.id === "terrain-zoo-grounds" || selectionInfo?.category === "Terrain";
}

function moveWorkerToGroundPoint(worker, point) {
  const destination = clampWorkerDestination(point.x, point.z);
  worker.assignmentTargetId = null;
  worker.assignmentTargetLabel = null;
  worker.assignmentTargetCategory = null;
  worker.assignedBuildingId = null;
  worker.assignedBuildingLabel = null;
  setWorkerWalkTarget(worker, destination, "ground");
  updateState(currentTime);
}

function assignWorkerToSelection(worker, hit) {
  const target = hit.info;
  const destination = workerDestinationForSelection(worker, hit);

  worker.assignmentTargetId = target.id;
  worker.assignmentTargetLabel = target.label;
  worker.assignmentTargetCategory = target.category;
  worker.assignedBuildingId = target.building?.id ?? null;
  worker.assignedBuildingLabel = target.building?.label ?? null;
  setWorkerWalkTarget(worker, destination, target.label);
  updateState(currentTime);
}

function assignWorkerToBuilding(worker, building) {
  if (!canReassignWorkerToBuilding(worker, building)) {
    buildMenuStatusEl.textContent = `${building.label} is already fully staffed.`;
    renderSelection();
    return false;
  }

  const root = buildingMeshes.get(building.id);
  const info = root?.userData.selectionInfo;
  if (!root || !info) return false;

  assignWorkerToSelection(worker, {
    info,
    root,
    point: worldPositionForObject(root),
  });
  finishWorkerCommand(worker);
  buildMenuStatusEl.textContent = `${worker.label} reassigned to ${building.label}.`;
  return true;
}

function workerDestinationForSelection(worker, hit) {
  const building = hit.info?.building;
  if (building) {
    return workerPositionForBuilding(building, assignedWorkerIndexForBuilding(building, worker));
  }

  const point = hit.point ?? worldPositionForObject(hit.root);
  return clampWorkerDestination(point.x, point.z);
}

function worldPositionForObject(object) {
  const position = new THREE.Vector3();
  object?.getWorldPosition?.(position);
  return position;
}

function clampWorkerDestination(x, z) {
  return {
    x: THREE.MathUtils.clamp(x, playableArea.minX + 0.2, playableArea.maxX - 0.2),
    z: THREE.MathUtils.clamp(z, playableArea.minZ + 0.2, playableArea.maxZ - 0.2),
  };
}

function setWorkerWalkTarget(worker, destination, label) {
  worker.walkTarget = [destination.x, worker.position[1], destination.z];
  worker.walkTargetLabel = label;
}

function openContextMenuAt(clientX, clientY) {
  const hit = selectionHitFromPoint(clientX, clientY);
  contextMenuSelection = hit?.info ?? null;
  contextMenuRoot = hit?.root ?? null;

  contextMenuTitleEl.textContent = contextMenuSelection?.label ?? "Zoo Actions";
  contextMenuSummaryEl.textContent = contextMenuSelection
    ? contextMenuSelection.category
    : "Choose an action.";
  contextMenuInspectEl.disabled = !contextMenuSelection;
  setButtonLabelWithHotkey(
    contextMenuBuildEl,
    contextMenuSelection ? "Build Nearby" : "Build",
    CONTEXT_MENU_HOTKEYS.build,
  );
  const building = contextMenuSelection?.building;
  setButtonLabelWithHotkey(
    contextMenuWorkerEl,
    building && !canAssignWorkerToBuilding(building) ? "Fully Manned" : "Assign Worker",
    CONTEXT_MENU_HOTKEYS.assignWorker,
  );
  contextMenuWorkerEl.disabled = !building || !canAssignWorkerToBuilding(building);

  contextMenuEl.style.left = "0px";
  contextMenuEl.style.top = "0px";
  contextMenuEl.setAttribute("aria-hidden", "false");

  const rect = contextMenuEl.getBoundingClientRect();
  const margin = 10;
  const left = THREE.MathUtils.clamp(clientX, margin, window.innerWidth - rect.width - margin);
  const top = THREE.MathUtils.clamp(clientY, margin, window.innerHeight - rect.height - margin);
  contextMenuEl.style.left = `${left}px`;
  contextMenuEl.style.top = `${top}px`;

  if (contextMenuSelection) {
    contextMenuInspectEl.focus();
  } else {
    contextMenuBuildEl.focus();
  }
}

function hideContextMenu() {
  contextMenuEl.setAttribute("aria-hidden", "true");
  contextMenuSelection = null;
  contextMenuRoot = null;
}

function inspectContextMenuSelection() {
  if (!contextMenuSelection) return;
  selectElement(contextMenuSelection, contextMenuRoot);
  hideContextMenu();
}

function scheduleLongPress(event) {
  if (
    activeBuildItem ||
    activePathTool ||
    activeAreaTool ||
    activeFenceTool ||
    event.pointerType !== "touch" ||
    event.button !== 0
  ) {
    return;
  }

  cancelLongPress();
  longPressStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
  longPressTimer = window.setTimeout(() => {
    const start = longPressStart;
    cancelLongPress();
    if (start) openContextMenuAt(start.x, start.y);
  }, LONG_PRESS_MS);
}

function updateLongPress(event) {
  if (!longPressStart || event.pointerId !== longPressStart.pointerId) return;

  const distance = Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y);
  if (distance > LONG_PRESS_MOVE_TOLERANCE) cancelLongPress();
}

function cancelLongPress() {
  if (longPressTimer) window.clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressStart = null;
}

function onPointerDown(event) {
  scheduleLongPress(event);

  if (event.button !== 0) return;
  hideContextMenu();

  if (activePathTool) {
    event.preventDefault();
    beginPathDraft(event);
    return;
  }

  if (activeAreaTool) {
    event.preventDefault();
    beginAreaDraft(event);
    return;
  }

  if (activeFenceTool) {
    event.preventDefault();
    beginFenceDraft(event);
    return;
  }

  if (activeBuildItem) {
    event.preventDefault();
    placeActiveBuilding(event);
    return;
  }

  if (activeWorkerCommand) {
    event.preventDefault();
    if (handleWorkerCommandPointer(activeWorkerCommand, event)) {
      finishWorkerCommand(activeWorkerCommand);
    }
    return;
  }

  const hit = selectionHitFromPointer(event);
  if (hit) {
    closeBuildMenu();
    selectElement(hit.info, hit.root);
    if (hit.info.animal) {
      event.preventDefault();
      prepareAnimalDrag(hit, event);
    }
  }
}

function onPointerMove(event) {
  updateLongPress(event);

  if (activeAnimalDrag) {
    updateAnimalDrag(event);
    return;
  }

  if (activePathTool) {
    updatePathDraft(event);
    canvas.style.cursor = "crosshair";
    return;
  }

  if (activeAreaTool) {
    updateAreaDraft(event);
    canvas.style.cursor = "crosshair";
    return;
  }

  if (activeFenceTool) {
    updateFenceDraft(event);
    canvas.style.cursor = "crosshair";
    return;
  }

  if (activeBuildItem) {
    updatePlacementPreview(event);
    canvas.style.cursor = placementValid ? "copy" : "not-allowed";
    return;
  }

  if (activeWorkerCommand) {
    canvas.style.cursor = "crosshair";
    return;
  }

  canvas.style.cursor = selectionHitFromPointer(event) ? "pointer" : "";
}

function onPointerUp(event) {
  if (activeAnimalDrag) {
    finishAnimalDrag(event);
    cancelLongPress();
    return;
  }
  if (activePathTool) {
    finishPathDraft(event);
  }
  if (activeAreaTool) {
    finishAreaDraft(event);
  }
  if (activeFenceTool) {
    finishFenceDraft(event);
  }
  cancelLongPress();
}

function onPointerCancel(event) {
  if (activeAnimalDrag) {
    cancelAnimalDrag();
    cancelLongPress();
    return;
  }
  if (activePathTool) {
    finishPathDraft(event);
  }
  if (activeAreaTool) {
    finishAreaDraft(event);
  }
  if (activeFenceTool) {
    finishFenceDraft(event);
  }
  cancelLongPress();
}

function selectionHitFromPointer(event) {
  return selectionHitFromPoint(event.clientX, event.clientY);
}

function selectionHitFromPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hit = raycaster
    .intersectObjects(selectable, false)
    .find(({ object }) => isWorldVisible(object) && object.userData.selectionInfo);

  if (!hit) return null;
  return {
    info: hit.object.userData.selectionInfo,
    root: hit.object.userData.selectionRoot,
    object: hit.object,
    point: hit.point.clone(),
  };
}

function installTestApi() {
  if (!testMode) return;

  window.__zooTestApi = {
    ready: true,
    setTime(time) {
      const nextTime = Math.max(0, Number(time));
      currentTime = nextTime;
      updateState(currentTime);
      controls.update();
      renderer.render(scene, camera);
      return currentTestState();
    },
    assignWorker(selectionId) {
      const building = buildings.find((candidate) => `building-${candidate.id}` === selectionId);
      if (!building) throw new Error(`No building found for ${selectionId}`);
      spawnWorkerForBuilding(building);
      return currentTestState();
    },
    placeBuildingForTest(kind, x, z) {
      const item = buildCatalog.find((candidate) => candidate.kind === kind);
      if (!item) throw new Error(`No building catalog entry found for ${kind}`);
      placedBuildingCount += 1;
      const building = {
        id: `placed_${item.kind}_${placedBuildingCount}`,
        kind: item.kind,
        label: item.label,
        position: [x, 0, z],
        size: [...item.size],
        requiredWorkers: item.requiredWorkers ?? 0,
        resourceOutput: { ...(item.resourceOutput ?? {}) },
        buildStart: currentTime - item.buildDuration,
        buildEnd: currentTime,
        buildDuration: item.buildDuration,
        playerPlaced: true,
        details: {
          ...item.details,
          Cost: item.cost,
          Staffing: staffingLabel(item.requiredWorkers),
          Footprint: `${item.size[0]} x ${item.size[1]} tiles`,
        },
      };
      buildings.push(building);
      playerPlacedBuildings.push(building);
      addBuildingToScene(building);
      updateState(currentTime);
      return currentTestState();
    },
    seedAnimalGroup(buildingId, kind) {
      const building = buildingById(buildingId);
      const species = animalSpeciesByKind[kind];
      if (!building) throw new Error(`No building found for ${buildingId}`);
      if (!species) throw new Error(`No animal species found for ${kind}`);
      addAnimalGroupToBuilding(building, species);
      updateState(currentTime);
      return currentTestState();
    },
    setEntryFee(value) {
      setEntryFee(value);
      return currentTestState();
    },
    setMotionEffects(enabled) {
      settings.motionEffects = Boolean(enabled);
      motionEffectsEl.checked = settings.motionEffects;
      if (!settings.motionEffects) resetAnimatedObjects();
      return settings.motionEffects;
    },
    exhaustVisitorInterest(visitorIndex = 0) {
      const visitor = visitorGroups[visitorIndex];
      if (!visitor?.userData.visitorActive) {
        throw new Error(`Visitor ${visitorIndex + 1} is not active`);
      }
      for (const building of buildings) {
        if (visitorBuildingAttraction(building) > 0) {
          visitor.userData.visitorLastVisits[building.id] = currentTime;
        }
      }
      const fromPoint = new THREE.Vector3(visitor.position.x, 0, visitor.position.z);
      assignNextVisitorDestination(visitor, visitorIndex, currentTime, { fromPoint });
      renderer.render(scene, camera);
      return currentTestState();
    },
    getState() {
      return currentTestState();
    },
    selectionPoint(selectionId) {
      const point = testPointForSelection(selectionId);
      if (!point) {
        throw new Error(`No clickable point found for ${selectionId}`);
      }
      return point;
    },
    hasSelectionPoint(selectionId) {
      return Boolean(testPointForSelection(selectionId));
    },
    groundPoint(x, z) {
      const groundTop = placementSurface
        ? placementSurface.position.y + playableAreaGroundHeight() / 2
        : 0;
      const point = clientPointFromWorld(new THREE.Vector3(x, groundTop, z));
      if (!point || !clientPointTargetsCanvas(point)) {
        throw new Error(`Ground point is not reachable at ${x}, ${z}`);
      }
      return point;
    },
  };
}

function playableAreaGroundHeight() {
  return 0.22;
}

function currentTestState() {
  return {
    time: Math.floor(currentTime),
    phase: phaseForSimulation(),
    simulationStarted,
    selectedId: selectedElement?.id ?? null,
    selectedLabel: selectedElement?.label ?? null,
    land: {
      footprint: {
        columns: gridColumns,
        rows: gridRows,
      },
      purchases: landState.purchases,
      nextCost: landPurchaseCost(),
    },
    resources: currentResourceState(),
    pricing: currentPricingState(),
    animalSpecies: currentAnimalSpeciesList().map((species) => ({
      kind: species.kind,
      label: species.label,
      unlocked: species.unlocked,
      placedCount: species.placed_count,
      requiredVisitors: species.requiredVisitors,
      fenceKind: species.fenceKind,
      minFenceCount: species.minFenceCount,
    })),
    animals: localAnimalGroups.map((animal) => ({
      id: animal.id,
      kind: animal.kind,
      label: animal.label,
      buildingId: animal.buildingId,
    })),
    visitors: visitorGroups.map((visitor, index) => ({
      id: `visitor-${index + 1}`,
      visible: visitor.visible,
      active: Boolean(visitor.userData.visitorActive),
      leavingZoo: Boolean(visitor.userData.visitorLeavingZoo),
      status: visitorStatusLabel(visitor),
      targetBuildingId: visitor.userData.visitorTargetBuildingId,
      currentBuildingId: visitor.userData.visitorCurrentBuildingId,
      interaction: visitor.userData.visitorInteractionLabel,
      recentlyVisitedBuildingIds: Object.keys(visitor.userData.visitorLastVisits ?? {}),
      position: {
        x: visitor.position.x,
        z: visitor.position.z,
      },
      onPath: pointIsOnExistingPathTile(visitor.position),
    })),
    buildings: buildings.map((building) => ({
      id: building.id,
      label: building.label,
      position: {
        x: building.position[0],
        z: building.position[2],
      },
      status: buildingMeshes.get(building.id)?.userData.state?.status ?? "Planned",
      requiredWorkers: requiredWorkerCount(building),
      assignedWorkers: assignedWorkerCount(building),
    })),
    fences: playerFenceSegments.map((segment) => ({
      kind: segment.kind ?? "wood_fence",
      start: {
        col: segment.start.col,
        row: segment.start.row,
        x: segment.start.x,
        z: segment.start.z,
      },
      end: {
        col: segment.end.col,
        row: segment.end.row,
        x: segment.end.x,
        z: segment.end.z,
      },
    })),
    workers: workers.map((worker) => ({
      id: worker.id,
      label: worker.label,
      assignmentTargetId: worker.assignmentTargetId,
      assignmentTargetLabel: worker.assignmentTargetLabel,
      assignmentTargetCategory: worker.assignmentTargetCategory,
      assignedBuildingId: worker.assignedBuildingId,
      assignedBuildingLabel: worker.assignedBuildingLabel,
      position: {
        x: worker.position[0],
        z: worker.position[2],
      },
      walkTarget: worker.walkTarget
        ? {
            x: worker.walkTarget[0],
            z: worker.walkTarget[2],
            label: worker.walkTargetLabel,
          }
        : null,
    })),
    visibleSelectionIds: Array.from(
      new Set(
        selectable
          .filter((object) => isWorldVisible(object))
          .map((object) => object.userData.selectionInfo?.id)
          .filter(Boolean),
      ),
    ),
  };
}

function testPointForSelection(selectionId) {
  const candidates = selectable.filter(
    (object) => object.userData.selectionInfo?.id === selectionId && isWorldVisible(object),
  );

  for (const object of candidates) {
    const points = testSamplePointsForObject(object);
    for (const point of points) {
      const clientPoint = clientPointFromWorld(point);
      if (!clientPoint) continue;
      if (!clientPointTargetsCanvas(clientPoint)) continue;
      const hit = selectionHitFromPoint(clientPoint.x, clientPoint.y);
      if (hit?.info?.id === selectionId) {
        return {
          ...clientPoint,
          selectionId,
          label: hit.info.label,
        };
      }
    }
  }

  return null;
}

function clientPointTargetsCanvas(point) {
  return document.elementFromPoint(point.x, point.y) === canvas;
}

function testSamplePointsForObject(object) {
  object.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    const position = new THREE.Vector3();
    object.getWorldPosition(position);
    return [position];
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const offsetX = Math.min(size.x * 0.25, 0.35);
  const offsetZ = Math.min(size.z * 0.25, 0.35);
  return [
    center,
    center.clone().add(new THREE.Vector3(offsetX, 0, 0)),
    center.clone().add(new THREE.Vector3(-offsetX, 0, 0)),
    center.clone().add(new THREE.Vector3(0, 0, offsetZ)),
    center.clone().add(new THREE.Vector3(0, 0, -offsetZ)),
  ];
}

function clientPointFromWorld(worldPoint) {
  const projected = worldPoint.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) return null;

  const rect = canvas.getBoundingClientRect();
  const x = rect.left + ((projected.x + 1) / 2) * rect.width;
  const y = rect.top + ((1 - projected.y) / 2) * rect.height;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return null;
  }

  return { x, y };
}

function isWorldVisible(object) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
