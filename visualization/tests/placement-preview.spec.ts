// @ts-nocheck
import { expect, test } from "./fixtures/zooGame";

test("online build preview uses Rust placement evaluation for rotated occupied tiles and click commands", async ({
  page,
  zooGame,
}) => {
  await page.goto("/?e2e=1");
  await zooGame.ensureTestApiReady();
  await page.getByRole("button", { name: /^(Start|Continue) Game$/ }).click();
  await page.evaluate(() => window.__zooTestApi.setMotionEffects(false));
  await expect(page.locator("#sync-status")).toContainText("Server:");
  await expect(page.getByLabel("Quick actions")).toBeHidden();

  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Place Ticket Booth" }).click();
  const placementPoint = await zooGame.groundPoint(3.5, -2.5);
  await page.mouse.move(placementPoint.x, placementPoint.y);

  const northPreview = await expect
    .poll(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()))
    .toMatchObject({
      kind: "ticket_booth",
      orientation: "North",
      valid: true,
      location: { x: 15, y: 6, elevation: 0 },
    })
    .then(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()));
  expect(northPreview).toMatchObject({
    kind: "ticket_booth",
    orientation: "North",
    valid: true,
    location: { x: 15, y: 6, elevation: 0 },
  });
  expect(northPreview.occupiedTiles).toHaveLength(4);
  await expect(page.locator("#build-menu-status")).toHaveText("Click to place.");

  await page.keyboard.press("r");
  const eastPreview = await expect
    .poll(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()))
    .toMatchObject({
      kind: "ticket_booth",
      orientation: "East",
      valid: true,
      location: { x: 15, y: 6, elevation: 0 },
    })
    .then(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()));
  expect(eastPreview).toMatchObject({
    kind: "ticket_booth",
    orientation: "East",
    valid: true,
    location: { x: 15, y: 6, elevation: 0 },
  });
  expect(eastPreview.occupiedTiles).toHaveLength(4);
  expect(eastPreview.occupiedTiles).not.toEqual(northPreview.occupiedTiles);

  await page.mouse.click(placementPoint.x, placementPoint.y);
  await expect
    .poll(async () => {
      const state = await zooGame.state();
      return state.buildings.find((building) => building.id.startsWith("placed_ticket_booth_"));
    })
    .toMatchObject({
      rotationQuarter: 1,
      orientation: "East",
    });
});

test("offline build preview uses WASM placement rejection before local placement", async ({
  page,
  zooGame,
}) => {
  await page.goto("/?e2e=1");
  await zooGame.ensureTestApiReady();
  const state = await page.evaluate(() => window.__zooTestApi.startLocalWasmSession());
  expect(state.syncStatus).toContain("WASM: local");

  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Place Animal Area" }).click();
  const invalidPoint = await zooGame.groundPoint(-3.5, -8.5);
  await page.mouse.move(invalidPoint.x, invalidPoint.y);

  const invalidPreview = await expect
    .poll(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()))
    .toMatchObject({
      kind: "animal_area",
      orientation: "North",
      valid: false,
      location: { x: 8, y: 0, elevation: 0 },
    })
    .then(() => page.evaluate(() => window.__zooTestApi.placementPreviewState()));
  expect(invalidPreview).toMatchObject({
    kind: "animal_area",
    orientation: "North",
    valid: false,
    location: { x: 8, y: 0, elevation: 0 },
  });
  expect(invalidPreview.rejection.code).toBe("placement_rule_not_met");
  await expect(page.locator("#build-menu-status")).not.toHaveText("Click to place.");

  await page.mouse.click(invalidPoint.x, invalidPoint.y);
  expect(
    (await zooGame.state()).buildings.some((building) =>
      building.id.startsWith("placed_animal_area_"),
    ),
  ).toBe(false);
});
