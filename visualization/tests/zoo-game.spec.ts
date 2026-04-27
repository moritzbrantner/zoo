// @ts-nocheck
import { expect, test } from "./fixtures/zooGame";

test.describe("zoo game state fixtures", () => {
  test("buildings report worker manning instead of scripted lifecycle phases", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await zooGame.clickSelection("building-savanna_habitat");
    await expect(page.locator("#inspector-title")).toHaveText("Savanna Habitat");
    await expect(page.locator("#inspector-details")).toContainText("Unmanned");
    await expect(page.locator("#inspector-details")).toContainText("0 / 2");
    await expect(page.locator("#inspector-details")).toContainText("Built layout");

    await page.getByRole("button", { name: /Assign Worker/ }).click();
    await expect(page.locator("#inspector-details")).toContainText("1 / 2");

    await page.getByRole("button", { name: /Assign Worker/ }).click();
    await expect(page.locator("#inspector-details")).toContainText("Active");
    await expect(page.locator("#inspector-details")).toContainText("Running");
    await expect(page.locator("#inspector-details")).toContainText("2 / 2");
  });

  test("staffing a habitat exposes visitor objects and resource output", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await expect.poll(() => zooGame.hasSelectionPoint("visitor-2")).toBe(false);
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    await expect.poll(() => zooGame.hasSelectionPoint("visitor-2")).toBe(true);
    await zooGame.clickSelection("visitor-2");
    await expect(page.locator("#inspector-title")).toHaveText("Visitor 2");
    await expect(page.locator("#inspector-details")).toContainText("On path");
    await expect(page.locator("#inspector-details")).toContainText("Guest loop");

    await page.getByRole("button", { name: "Inspect Visitors" }).click();
    await expect(page.locator("#inspector-details")).toContainText("14 / 42");
  });

  test("right-clicks a building and assigns workers until it is fully manned", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await zooGame.rightClickSelection("building-savanna_habitat");
    const menu = page.getByRole("menu", { name: "Quick actions" });
    await expect(menu).toBeVisible();
    await expect(page.locator("#context-menu-title")).toHaveText("Savanna Habitat");
    await expect(menu.getByRole("menuitem", { name: "Assign Worker" })).toBeEnabled();

    await menu.getByRole("menuitem", { name: "Assign Worker" }).click();
    await expect(page.locator("#inspector-details")).toContainText("1 / 2");

    await zooGame.rightClickSelection("building-savanna_habitat");
    await menu.getByRole("menuitem", { name: "Assign Worker" }).click();
    await expect(page.locator("#inspector-details")).toContainText("2 / 2");
    await expect
      .poll(() => zooGame.state())
      .toMatchObject({
        workers: [
          {
            label: "Worker 1",
            assignedBuildingId: "savanna_habitat",
          },
          {
            label: "Worker 2",
            assignedBuildingId: "savanna_habitat",
          },
        ],
      });

    await expect(page.getByRole("button", { name: "Fully Manned" })).toBeDisabled();
  });

  test("reassigns a selected worker with right click and moves it on ground right click", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.clickSelection("worker-spawned_1");
    await expect(page.locator("#inspector-title")).toHaveText("Worker 1");

    await zooGame.rightClickSelection("building-keeper_kitchen");
    await expect(page.getByLabel("Quick actions")).toBeHidden();
    await expect(page.locator("#inspector-title")).toHaveText("Worker 1");
    await expect(page.locator("#inspector-details")).toContainText("Keeper Kitchen");

    const reassigned = await zooGame.state();
    expect(reassigned.buildings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "savanna_habitat",
          assignedWorkers: 0,
        }),
        expect.objectContaining({
          id: "keeper_kitchen",
          assignedWorkers: 1,
        }),
      ]),
    );
    expect(reassigned.workers[0]).toMatchObject({
      assignmentTargetId: "building-keeper_kitchen",
      assignedBuildingId: "keeper_kitchen",
    });

    await zooGame.rightClickSelection("landmark-central-garden");
    await expect(page.locator("#inspector-details")).toContainText("Central Garden");

    const assignedToLandmark = await zooGame.state();
    expect(assignedToLandmark.workers[0]).toMatchObject({
      assignmentTargetId: "landmark-central-garden",
      assignmentTargetCategory: "Landmark",
      assignedBuildingId: null,
    });

    await zooGame.clickGround(-5.5, -4, { button: "right" });
    await expect(page.getByLabel("Quick actions")).toBeHidden();
    await expect(page.locator("#inspector-details")).toContainText("Walking");

    const walking = await zooGame.state();
    expect(walking.workers[0]).toMatchObject({
      assignmentTargetId: null,
      assignedBuildingId: null,
      walkTarget: expect.objectContaining({ label: "ground" }),
    });
    expect(walking.workers[0].walkTarget.x).toBeCloseTo(-5.5, 1);
    expect(walking.workers[0].walkTarget.z).toBeCloseTo(-4, 1);

    await expect
      .poll(async () => (await zooGame.state()).workers[0].walkTarget, {
        timeout: 12_000,
      })
      .toBeNull();

    const arrived = await zooGame.state();
    expect(arrived.workers[0].position.x).toBeCloseTo(-5.5, 1);
    expect(arrived.workers[0].position.z).toBeCloseTo(-4, 1);
  });

  test("selected worker reassignment to a building keeps a walk target until arrival", async ({
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.clickSelection("worker-spawned_1");
    await zooGame.rightClickSelection("building-keeper_kitchen");

    const reassigned = await zooGame.state();
    expect(reassigned.workers[0]).toMatchObject({
      assignedBuildingId: "keeper_kitchen",
      walkTarget: expect.objectContaining({ label: "Keeper Kitchen" }),
    });

    await expect
      .poll(async () => (await zooGame.state()).workers[0].walkTarget, {
        timeout: 12_000,
      })
      .toBeNull();

    const arrived = await zooGame.state();
    expect(arrived.workers[0]).toMatchObject({
      assignedBuildingId: "keeper_kitchen",
      walkTarget: null,
    });
  });

  test("places a building by clicking a clear ground point and rejects an occupied point", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await page.getByRole("button", { name: "Place building" }).click();

    await page.getByRole("button", { name: "Place Restroom" }).click();
    await zooGame.clickGround(-4.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Restroom");
    await expect(page.locator("#inspector-details")).toContainText("Player placed");
    await expect(page.locator("#inspector-details")).toContainText("Constructing");
    await expect(page.locator("#inspector-details")).toContainText("0 / 1");
    await expect(page.locator("#build-menu-status")).toHaveText(
      "Restroom construction started (10s).",
    );
    await expect
      .poll(() => zooGame.state())
      .toMatchObject({
        buildings: expect.arrayContaining([
          expect.objectContaining({
            label: "Restroom",
            position: {
              x: -4.5,
              z: -3,
            },
          }),
        ]),
      });

    await page.getByRole("button", { name: "Place Food Store" }).click();
    await zooGame.clickGround(-4.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Restroom");
    await expect(page.locator("#build-menu-status")).toHaveText("Choose a clear tile.");
  });

  test("builds guest stores and applies their staffed outputs", async ({ page, zooGame }) => {
    await zooGame.start();
    await page.getByRole("button", { name: "Place building" }).click();

    await page.getByRole("button", { name: "Place Food Store" }).click();
    await zooGame.clickGround(-4.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Food Store");
    await expect(page.locator("#inspector-details")).toContainText(
      "Serves guests and turns foot traffic into revenue",
    );

    await page.getByRole("button", { name: "Place Gift Shop" }).click();
    await zooGame.clickGround(1.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Gift Shop");
    await expect(page.locator("#inspector-details")).toContainText(
      "Sells souvenirs and generates research funding",
    );

    await zooGame.setState(20);
    const beforeStaffing = await zooGame.state();

    await zooGame.assignWorker("building-placed_snack_kiosk_1");
    await zooGame.assignWorker("building-placed_souvenir_stall_2");
    const afterStaffing = await zooGame.state();

    expect(afterStaffing.resources.values.coins - beforeStaffing.resources.values.coins).toBe(135);
    expect(
      afterStaffing.resources.values.research_points - beforeStaffing.resources.values.research_points,
    ).toBe(2);
    expect(
      afterStaffing.resources.values.reputation - beforeStaffing.resources.values.reputation,
    ).toBe(1);
  });

  test("uses build and staffing hotkeys for selected actions", async ({ page, zooGame }) => {
    await zooGame.start();

    await page.keyboard.press("b");
    await expect(page.locator(".build-menu")).toBeVisible();

    await page.keyboard.press("4");
    await zooGame.clickGround(-4.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Restroom");
    await expect(page.locator("#build-menu-status")).toHaveText(
      "Restroom construction started (10s).",
    );

    await page.keyboard.press("b");
    await zooGame.clickSelection("building-savanna_habitat");
    await page.keyboard.press("a");
    await expect(page.locator("#inspector-details")).toContainText("1 / 2");
  });

  test("commands a selected worker with the keyboard", async ({ page, zooGame }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.clickSelection("worker-spawned_1");
    await page.keyboard.press("m");
    await expect(page.locator("#inspector-summary")).toContainText("Command mode");

    await zooGame.clickSelection("building-keeper_kitchen");
    await expect(page.locator("#inspector-title")).toHaveText("Worker 1");
    await expect(page.locator("#inspector-details")).toContainText("Keeper Kitchen");

    const reassigned = await zooGame.state();
    expect(reassigned.workers[0]).toMatchObject({
      assignmentTargetId: "building-keeper_kitchen",
      assignedBuildingId: "keeper_kitchen",
      walkTarget: expect.objectContaining({ label: "Keeper Kitchen" }),
    });
  });

  test("fires context menu actions from hotkeys", async ({ page, zooGame }) => {
    await zooGame.start();

    await zooGame.rightClickSelection("building-savanna_habitat");
    await expect(page.getByLabel("Quick actions")).toBeVisible();
    await page.keyboard.press("a");

    await expect(page.getByLabel("Quick actions")).toBeHidden();
    await expect(page.locator("#inspector-details")).toContainText("1 / 2");
  });

  test("clicks resource rows against the staffed zoo state", async ({ page, zooGame }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    await page.getByRole("button", { name: "Inspect Visitors" }).click();
    await expect(page.locator("#inspector-title")).toHaveText("Visitors");
    await expect(page.locator("#inspector-details")).toContainText("14 / 42");
    await expect(page.locator("#inspector-details")).toContainText("Staffing needed");

    await page.getByRole("button", { name: "Inspect Conservation" }).click();
    await expect(page.locator("#inspector-details")).toContainText("2");
  });

  test("entry fee changes visitor demand and arrival pace", async ({ page, zooGame }) => {
    await zooGame.start();

    const starting = await zooGame.state();
    expect(starting.pricing.entryFee).toBe(12);
    expect(starting.pricing.willingness).toBeGreaterThan(12);

    const cheap = await zooGame.setEntryFee(4);
    await expect(page.locator("#entry-fee-value")).toHaveText("$4");
    expect(cheap.pricing.demandPercent).toBeGreaterThan(starting.pricing.demandPercent);

    await zooGame.setState(60);
    const cheapAfterMinute = await zooGame.state();

    const expensive = await zooGame.setEntryFee(70);
    expect(expensive.pricing.demandPercent).toBeLessThan(cheap.pricing.demandPercent);
    await zooGame.setState(60);
    const expensiveAfterMinute = await zooGame.state();

    expect(cheapAfterMinute.resources.values.visitors).toBeGreaterThan(
      expensiveAfterMinute.resources.values.visitors,
    );
    expect(expensiveAfterMinute.pricing.expectedCustomersPerMinute).toBeLessThan(
      cheapAfterMinute.pricing.expectedCustomersPerMinute,
    );
  });
});
