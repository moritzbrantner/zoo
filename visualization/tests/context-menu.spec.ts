// @ts-nocheck
import { expect, test } from "@playwright/test";

async function startZoo(page) {
  await page.goto("/?e2e=1");
  const startButton = page.getByRole("button", { name: /^(Start|Continue) Game$/ });
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
  await page.getByRole("button", { name: /^(Start|Continue) Game$/ }).click();
  await expect(page.getByLabel("Quick actions")).toBeHidden();
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

test("groups and searches build menu items", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();

  await expect(page.locator(".build-category-title")).toHaveText([
    "Entry",
    "Guest Services",
    "Staff",
    "Habitats",
  ]);

  await page.getByLabel("Search build menu").fill("food");
  await expect(page.locator(".build-category:not([hidden]) .build-category-title")).toHaveText([
    "Guest Services",
  ]);
  await expect(page.getByRole("button", { name: "Place Food Store" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place Restroom" })).toBeHidden();

  await page.getByLabel("Search build menu").fill("habitat");
  await expect(page.locator(".build-category:not([hidden]) .build-category-title")).toHaveText([
    "Habitats",
  ]);
  await expect(page.getByRole("button", { name: "Place Savanna Habitat" })).toBeVisible();

  await page.getByLabel("Search build menu").fill("nothing");
  await expect(page.locator("#build-search-empty")).toBeVisible();
});

test("draws and confirms a path from the build menu", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Staff Path" }).click();
  await page.getByRole("button", { name: "Draw Path" }).click();

  await expect(page.getByRole("button", { name: "Draw Path" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Staff Path" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const confirmPath = page.getByRole("button", { name: "Confirm Path" });
  const attempts = [
    [-0.5, 6.5, 0.5, 6.5],
    [-0.5, 7.5, 0.5, 7.5],
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

  await expect(page.locator("#inspector-title")).toHaveText("Staff Path 1");
  await expect(page.locator("#inspector-details")).toContainText("Player drawn");
  await expect(page.locator("#inspector-details")).toContainText("Staff Path");
  await expect(page.locator("#build-menu-status")).toHaveText("Staff Path 1 built.");
});

test("draws a new path starting from clear ground", async ({ page }) => {
  await startZoo(page);
  await page.getByRole("button", { name: "Place building" }).click();
  await page.getByRole("button", { name: "Service Path" }).click();
  await page.getByRole("button", { name: "Draw Path" }).click();

  const start = await groundPoint(page, -5.5, -4);
  const end = await groundPoint(page, -4.5, -4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();

  const confirmPath = page.getByRole("button", { name: "Confirm Path" });
  await expect(confirmPath).toBeEnabled();
  await confirmPath.click();

  await expect(page.locator("#inspector-title")).toHaveText("Service Path 1");
  await expect(page.locator("#build-menu-status")).toHaveText("Service Path 1 built.");
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

  await expect(page.locator("#inspector-title")).toHaveText("Wood Fence 1");
  await expect(page.locator("#inspector-details")).toContainText("Player built");
  await expect(page.locator("#build-menu-status")).toHaveText("Wood Fence 1 built.");

  const { fences } = await page.evaluate(() => window.__zooTestApi.getState());
  expect(fences.length).toBeGreaterThan(0);
  for (const segment of fences) {
    expect(Number.isInteger(segment.start.x)).toBe(true);
    expect(Number.isInteger(segment.end.x)).toBe(true);
    expect(Number.isInteger(segment.start.z)).toBe(true);
    expect(Number.isInteger(segment.end.z)).toBe(true);
  }
});

test("assigns a worker to the selected building", async ({ page }) => {
  await startZoo(page);

  await page.getByRole("button", { name: /Assign Worker/ }).click();

  await expect(page.locator("#inspector-title")).toHaveText("Savanna Habitat");
  await expect(page.locator("#inspector-details")).toContainText("Worker 1");
});

test("does not open the scene context menu through visible overlays", async ({ page }) => {
  await startZoo(page);

  const inspector = page.locator(".inspector");
  await expect(inspector).toBeVisible();
  const box = await inspector.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });

  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();
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
  expect(placedRestroom.position.z).toBe(-3.5);
});
