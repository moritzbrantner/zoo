// @ts-nocheck
import { expect, test } from "@playwright/test";

async function startZoo(page) {
  await page.goto("/?e2e=1");
  const startButton = page.getByRole("button", { name: "Start Zoo" });
  await expect(startButton).toBeVisible();
  const ready = await page
    .waitForFunction(() => Boolean(window.__zooTestApi?.ready), {
      timeout: 8_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    await page.reload();
    await expect(startButton).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__zooTestApi?.ready), {
      timeout: 15_000,
    });
  }
  await page.getByRole("button", { name: "Start Zoo" }).click();
  await expect(page.getByLabel("Quick actions")).toBeHidden();
}

async function canvasPoint(page, xRatio = 0.52, yRatio = 0.54) {
  const canvas = page.locator("#zoo-scene");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas has no bounding box");

  return {
    canvas,
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio,
  };
}

async function groundPoint(page, x, z) {
  return page.evaluate(
    ({ x: worldX, z: worldZ }) => window.__zooTestApi.groundPoint(worldX, worldZ),
    { x, z },
  );
}

test("starts the zoo without scripted timeline controls", async ({ page }) => {
  await startZoo(page);

  await expect(page.locator("#phase-label")).toHaveText("Staffing needed");
  await expect(page.locator("#timeline")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /timeline/i })).toHaveCount(0);
});

test("draws and confirms a path from the build menu", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Draw Path" }).click();

  await expect(page.getByRole("button", { name: "Draw Path" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const confirmPath = page.getByRole("button", { name: "Confirm Path" });
  const attempts = [
    [0.5, 3, 0.5, 4],
    [-2.5, 3, -2.5, 4],
    [1.5, 2, 1.5, 1],
  ];

  for (const [startX, startZ, endX, endZ] of attempts) {
    const start = await groundPoint(page, startX, startZ);
    const end = await groundPoint(page, endX, endZ);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    if (await confirmPath.isEnabled()) break;
  }

  await expect(confirmPath).toBeEnabled();
  await confirmPath.click();

  await expect(page.locator("#inspector-title")).toHaveText("Guest Path 1");
  await expect(page.locator("#inspector-details")).toContainText("Player drawn");
  await expect(page.locator("#build-menu-status")).toHaveText("Guest Path 1 built.");
});

test("requires a new path to start from an existing path tile", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Draw Path" }).click();

  const start = await canvasPoint(page, 0.62, 0.34);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Confirm Path" })).toBeDisabled();
  await expect(page.locator("#build-menu-status")).toHaveText("Start from an existing path tile.");
});

test("defines an area from the build menu", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Define Area" }).click();

  await expect(page.getByRole("button", { name: "Define Area" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const confirmArea = page.getByRole("button", { name: "Confirm Area" });
  const attempts = [
    [-5.5, -4, -3.5, -4],
    [2.5, 0, 4.5, 0],
    [-5.5, 4, -3.5, 4],
  ];

  for (const [startX, startZ, endX, endZ] of attempts) {
    const start = await groundPoint(page, startX, startZ);
    const end = await groundPoint(page, endX, endZ);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    if (await confirmArea.isEnabled()) break;
  }

  await expect(confirmArea).toBeEnabled();
  await confirmArea.click();

  await expect(page.locator("#inspector-title")).toHaveText("Guest Area 1");
  await expect(page.locator("#inspector-details")).toContainText("Player defined");
  await expect(page.locator("#build-menu-status")).toHaveText("Guest Area 1 defined.");
});

test("builds a fence from the build menu", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Build Fence" }).click();

  await expect(page.getByRole("button", { name: "Build Fence" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const confirmFence = page.getByRole("button", { name: "Confirm Fence" });
  const attempts = [
    [-5, -3.5, -2, -3.5],
    [2, -3.5, 5, -3.5],
    [5, -3.5, 5, -0.5],
  ];

  for (const [startX, startZ, endX, endZ] of attempts) {
    const start = await groundPoint(page, startX, startZ);
    const end = await groundPoint(page, endX, endZ);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    if (await confirmFence.isEnabled()) break;
  }

  await expect(confirmFence).toBeEnabled();
  await confirmFence.click();

  await expect(page.locator("#inspector-title")).toHaveText("Fence 1");
  await expect(page.locator("#inspector-details")).toContainText("Player built");
  await expect(page.locator("#build-menu-status")).toHaveText("Fence 1 built.");

  const { fences } = await page.evaluate(() => window.__zooTestApi.getState());
  expect(fences.length).toBeGreaterThan(0);
  for (const segment of fences) {
    expect(Number.isInteger(segment.start.x)).toBe(true);
    expect(Number.isInteger(segment.end.x)).toBe(true);
    expect(Math.abs(segment.start.z % 1)).toBeCloseTo(0.5);
    expect(Math.abs(segment.end.z % 1)).toBeCloseTo(0.5);
  }
});

test("assigns a worker to the selected building", async ({ page }) => {
  await startZoo(page);

  await page.getByRole("button", { name: /Assign Worker/ }).click();

  await expect(page.locator("#inspector-title")).toHaveText("Savanna Habitat");
  await expect(page.locator("#inspector-details")).toContainText("Worker 1");
});

test("snaps off-grid building placement to tile centers", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();

  await page.getByRole("button", { name: "Place Restroom" }).click();
  const point = await groundPoint(page, -4.2, -3.2);
  await page.mouse.click(point.x, point.y);

  const state = await page.evaluate(() => window.__zooTestApi.getState());
  const placedRestroom = state.buildings.find((building) =>
    building.id.startsWith("placed_restroom_"),
  );
  expect(placedRestroom).toBeTruthy();
  expect(placedRestroom.position.x).toBe(-4.5);
  expect(placedRestroom.position.z).toBe(-3);
});
