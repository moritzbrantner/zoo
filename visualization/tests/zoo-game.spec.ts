// @ts-nocheck
import { expect, test } from "./fixtures/zooGame";

test.describe("zoo game state fixtures", () => {
  test("main menu exposes start, settings, and wiki flows", async ({ page, zooGame }) => {
    await page.goto("/?e2e=1");
    await zooGame.ensureTestApiReady();
    const mainMenu = page.getByLabel("Main menu");

    await expect(mainMenu.getByRole("button", { name: "Start Game" })).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: "Simulations" })).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: "Wiki" })).toBeVisible();

    await mainMenu.getByRole("button", { name: "Simulations" }).click();
    await expect(mainMenu.getByRole("button", { name: /Staffing Needed/ })).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: /Operating Zoo/ })).toBeVisible();

    await mainMenu.getByRole("button", { name: "Wiki" }).click();
    const wikiDialog = page.getByRole("dialog", { name: "Zoo Wiki" });
    await expect(wikiDialog).toBeVisible();
    await expect(wikiDialog).toContainText("Core Loop");
    await expect(wikiDialog).toContainText("Customer Entry");
    await expect(wikiDialog).toContainText("Rabbit Colony");
  });

  test("simulations menu starts the operating zoo preset", async ({ page, zooGame }) => {
    await page.goto("/?e2e=1");
    await zooGame.ensureTestApiReady();

    await page.getByRole("button", { name: "Simulations" }).click();
    await page.getByRole("button", { name: /Operating Zoo/ }).click();
    await page.evaluate(() => window.__zooTestApi.setMotionEffects(false));

    const state = await zooGame.state();
    expect(state.time).toBe(24);
    expect(state.simulationStarted).toBe(true);
    expect(state.animals.map((animal) => animal.kind)).toContain("rabbit_colony");
    expect(state.workers).toHaveLength(4);
    expect(state.visitors.some((visitor) => visitor.visible)).toBe(true);
  });

  test("returning to the main menu allows continuing the current zoo", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.setState(24);

    await page.getByRole("button", { name: "Return to main menu" }).click();
    await expect(page.getByRole("button", { name: "Continue Game" })).toBeVisible();

    await page.getByRole("button", { name: "Continue Game" }).click();
    await expect.poll(() => zooGame.state().then((state) => state.time)).toBeGreaterThanOrEqual(24);
  });

  test("buildings report worker manning instead of scripted lifecycle phases", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    expect((await zooGame.state()).availableWorkers).toBe(4);
    await expect(page.locator("#available-workers")).toHaveText("4 workers available");

    await zooGame.clickSelection("building-savanna_habitat");
    await expect(page.locator("#inspector-title")).toHaveText("Savanna Habitat");
    await expect(page.locator("#inspector-details")).toContainText("Unmanned");
    await expect(page.locator("#inspector-details")).toContainText("0 / 2");
    await expect(page.locator("#inspector-details")).toContainText("Built layout");

    await page.getByRole("button", { name: /Assign Worker/ }).click();
    expect((await zooGame.state()).availableWorkers).toBe(3);
    await expect(page.locator("#available-workers")).toHaveText("3 workers available");
    await expect(page.locator("#inspector-details")).toContainText("1 / 2");

    await page.getByRole("button", { name: /Assign Worker/ }).click();
    expect((await zooGame.state()).availableWorkers).toBe(2);
    await expect(page.locator("#available-workers")).toHaveText("2 workers available");
    await expect(page.locator("#inspector-details")).toContainText("Active");
    await expect(page.locator("#inspector-details")).toContainText("Running");
    await expect(page.locator("#inspector-details")).toContainText("2 / 2");
  });

  test("staffing a habitat exposes visitor objects and resource output", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await expect.poll(() => zooGame.hasSelectionPoint("visitor-1")).toBe(false);
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.setState(12);
    await expect.poll(() => zooGame.hasSelectionPoint("visitor-1")).toBe(true);
    await zooGame.clickSelection("visitor-1");
    await expect(page.locator("#inspector-title")).toHaveText("Visitor 1");
    await expect(page.locator("#inspector-details")).toContainText("Visiting animals");
    await expect(page.locator("#inspector-details")).toContainText("Guest loop");

    await page.getByRole("button", { name: /Open History/ }).click();
    const visitorHistory = page.getByRole("dialog", { name: "Visitor 1 History" });
    await expect(visitorHistory).toBeVisible();
    await expect(visitorHistory).toContainText("Entered zoo");
    await expect(visitorHistory).toContainText("Heading to");
    await expect(visitorHistory).toContainText("Visiting animals");
    await visitorHistory.getByRole("button", { name: "Close visitor history" }).click();

    await page.getByRole("button", { name: "Inspect Visitors" }).click();
    await expect(page.locator("#inspector-details")).toContainText(/\d+ \/ 42/);
  });

  test("visitor animation paces arrivals and keeps entered guests inside the park", async ({
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    const staffed = await zooGame.state();
    expect(staffed.visitors.filter((visitor) => visitor.visible)).toHaveLength(1);

    await zooGame.setState(3);
    const beforeNextEntry = await zooGame.state();
    expect(beforeNextEntry.visitors.filter((visitor) => visitor.visible)).toHaveLength(1);

    await zooGame.setState(5);
    const afterNextEntry = await zooGame.state();
    expect(afterNextEntry.visitors.filter((visitor) => visitor.visible)).toHaveLength(2);

    await zooGame.setState(20);
    const circulated = await zooGame.state();
    expect(circulated.visitors[0].position.z).toBeLessThanOrEqual(4.5);
    expect(
      circulated.visitors
        .filter((visitor) => visitor.visible)
        .every((visitor) => visitor.onPath),
    ).toBe(true);
  });

  test("visitors pick weighted buildings and pause before choosing another stop", async ({
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.setState(5);
    const arrivals = await zooGame.state();
    const activeTargets = arrivals.visitors
      .filter((visitor) => visitor.active)
      .map((visitor) => visitor.targetBuildingId);
    expect(new Set(activeTargets).size).toBeGreaterThan(1);

    await zooGame.setState(12);
    const interacting = await zooGame.state();
    expect(interacting.visitors[0]).toMatchObject({
      currentBuildingId: "savanna_habitat",
      interaction: "Visiting animals",
    });

    await zooGame.setState(22);
    const afterDwell = await zooGame.state();
    expect(afterDwell.visitors[0].recentlyVisitedBuildingIds).toContain("savanna_habitat");
    expect(afterDwell.visitors[0].targetBuildingId).not.toBe("savanna_habitat");
  });

  test("building visitor point-of-interest defaults are configurable by building kind", async ({
    zooGame,
  }) => {
    await zooGame.start();
    const state = await zooGame.placeBuildingForTest("animal_area", -5, -4);
    const buildingsById = Object.fromEntries(
      state.buildings.map((building) => [building.id, building]),
    );

    expect(buildingsById.keeper_kitchen.visitorPointOfInterest).toBe(false);
    expect(buildingsById.feed_shed.visitorPointOfInterest).toBe(false);
    expect(buildingsById.customer_entry.visitorPointOfInterest).toBe(false);
    expect(buildingsById.ticket_booth.visitorPointOfInterest).toBe(true);
    expect(buildingsById.guest_plaza.visitorPointOfInterest).toBe(true);
    expect(buildingsById.savanna_habitat.visitorPointOfInterest).toBe(true);
    expect(buildingsById.placed_animal_area_1.visitorPointOfInterest).toBe(true);
  });

  test("visitors leave when no activity clears their interest threshold", async ({ zooGame }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.setState(5);
    const leaving = await zooGame.exhaustVisitorInterest(0);
    expect(leaving.visitors[0]).toMatchObject({
      active: true,
      leavingZoo: true,
      status: "Leaving",
      targetBuildingId: null,
      interaction: "Leaving zoo",
    });

    await zooGame.setState(40);
    const departed = await zooGame.state();
    expect(departed.visitors[0]).toMatchObject({
      active: false,
      leavingZoo: false,
      visible: false,
    });
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

  test("clicking a worker shows its path and assigned building, and the inspector can reassign it", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.assignWorker("building-savanna_habitat");

    await zooGame.clickSelection("worker-spawned_1");
    await expect(page.locator("#inspector-title")).toHaveText("Worker 1");
    await expect(page.locator("#inspector-details")).toContainText("Assigned Building");
    await expect(page.locator("#inspector-details")).toContainText("Savanna Habitat");
    await expect(page.locator("#inspector-details")).toContainText("Holding at Savanna Habitat");

    await page.getByRole("button", { name: "Assign to Keeper Kitchen" }).click();
    await expect(page.locator("#inspector-details")).toContainText("Keeper Kitchen");
    await expect(page.locator("#inspector-details")).toContainText("Walking");

    await expect
      .poll(async () => (await zooGame.state()).workers[0])
      .toMatchObject({
        assignmentTargetId: "building-keeper_kitchen",
        assignedBuildingId: "keeper_kitchen",
        walkTarget: expect.objectContaining({
          label: "Keeper Kitchen",
        }),
      });
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
              z: -2.5,
            },
          }),
        ]),
      });

    await page.getByRole("button", { name: "Place Food Store" }).click();
    await zooGame.clickGround(-4.5, -3);
    await expect(page.locator("#inspector-title")).toHaveText("Restroom");
    await expect(page.locator("#build-menu-status")).toHaveText("Choose a clear tile.");
  });

  test("shows the nine-species animal roster for a selected animal area", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.placeBuildingForTest("animal_area", 1.5, -3.5);
    await zooGame.setState(20);
    await zooGame.select("building-placed_animal_area_1");

    await expect(page.locator("#animal-roster")).toBeVisible();
    await expect(page.locator("#animal-roster-list").getByRole("button")).toHaveCount(9);
    await expect(page.locator("#animal-roster-list")).toContainText("Rabbit Colony");
    await expect(page.locator("#animal-roster-list")).toContainText("Elephant Herd");
    await expect(page.locator("#animal-roster-list")).toContainText("Unlocks at 48 visitors");
    await expect(page.getByRole("button", { name: /Rabbit Colony/ })).toBeDisabled();
    await expect(page.locator("#animal-roster-list")).toContainText("Steel Fence x4");
  });

  test("drags an animal group into an empty compatible animal area", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.placeBuildingForTest("animal_area", -4.5, -3);
    await zooGame.placeBuildingForTest("animal_area", -1.5, -3);
    await zooGame.seedAnimalGroup("placed_animal_area_1", "rabbit_colony");
    await zooGame.dragSelectionToGround("animal-group-1", -1.5, -3);

    await expect(page.locator("#build-menu-status")).toHaveText("Rabbit Colony moved to Animal Area.");
    await expect
      .poll(() => zooGame.state())
      .toMatchObject({
        animals: expect.arrayContaining([
          expect.objectContaining({
            id: "animal-group-1",
            buildingId: "placed_animal_area_2",
          }),
        ]),
      });
  });

  test("drags an animal group into another area when it already contains the same species", async ({
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.placeBuildingForTest("animal_area", -4.5, -3);
    await zooGame.placeBuildingForTest("animal_area", -1.5, -3);
    await zooGame.seedAnimalGroup("placed_animal_area_1", "rabbit_colony");
    await zooGame.seedAnimalGroup("placed_animal_area_2", "rabbit_colony");

    await zooGame.dragSelectionToGround("animal-group-1", -1.5, -3);

    await expect
      .poll(async () => {
        const state = await zooGame.state();
        return {
          firstArea: state.animals.filter((animal) => animal.buildingId === "placed_animal_area_1").length,
          secondArea: state.animals.filter((animal) => animal.buildingId === "placed_animal_area_2").length,
        };
      })
      .toEqual({
        firstArea: 0,
        secondArea: 2,
      });
  });

  test("buys rabbits after a wood enclosure and rejects mixed-species follow-ups", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await zooGame.placeBuildingForTest("animal_area", 1.5, -3.5);
    await zooGame.setState(20);

    await page.getByRole("button", { name: "Place building" }).click();
    await page.getByRole("button", { name: "Build Fence" }).click();
    await zooGame.dragGround(0, -5, 3, -5);
    await expect(page.locator("#build-menu-status")).toHaveText("Confirm fence.");
    await page.getByRole("button", { name: "Confirm Fence" }).click();

    const beforeRabbit = await zooGame.state();
    await page.getByRole("button", { name: "Close build menu" }).click();
    await zooGame.select("building-placed_animal_area_1");
    await page.getByRole("button", { name: /Rabbit Colony/ }).click();
    await expect(page.locator("#build-menu-status")).toHaveText(
      "Rabbit Colony added to Animal Area.",
    );

    const afterRabbit = await zooGame.state();
    expect(afterRabbit.animals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "rabbit_colony",
          buildingId: "placed_animal_area_1",
        }),
      ]),
    );
    expect(afterRabbit.resources.values.vegetables).toBeLessThan(
      beforeRabbit.resources.values.vegetables,
    );
    expect(afterRabbit.resources.values.water).toBeLessThan(beforeRabbit.resources.values.water);
    expect(afterRabbit.pricing.animalCount).toBe(beforeRabbit.pricing.animalCount + 1);

    await zooGame.setState(120);
    await expect(page.locator("#animal-roster")).toBeVisible();
    await page.getByRole("button", { name: /Tortoise Group/ }).click();
    await expect(page.locator("#build-menu-status")).toHaveText(
      "Animal Area already contains Rabbit Colony.",
    );
  });

  test("buys more land and unlocks new building space beyond the original fence", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();
    await page.getByRole("button", { name: "Place building" }).click();

    await page.locator("#buy-land").click();
    await expect(page.locator("#build-menu-status")).toHaveText(
      "Zoo grounds expanded to 26 x 20 tiles for $120.",
    );

    const expanded = await zooGame.state();
    expect(expanded.land).toMatchObject({
      footprint: {
        columns: 26,
        rows: 20,
      },
      purchases: 1,
      nextCost: 180,
    });
    expect(expanded.resources.values.coins).toBe(300);

    await page.getByRole("button", { name: "Place Restroom" }).click();
    await zooGame.clickGround(0.2, 3.9);
    await expect(page.locator("#inspector-title")).toHaveText("Restroom");

    const placed = await zooGame.state();
    expect(placed.buildings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "placed_restroom_1",
          position: {
            x: 0.5,
            z: 3.5,
          },
        }),
      ]),
    );
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
    await zooGame.clickGround(5.5, -1.5);
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

  test("rotates build previews and hovered buildings with the keyboard", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await page.keyboard.press("b");
    await page.keyboard.press("4");
    const placementPoint = await zooGame.groundPoint(-4.5, -3);
    await page.mouse.move(placementPoint.x, placementPoint.y);
    await page.keyboard.press("r");
    await page.mouse.click(placementPoint.x, placementPoint.y);

    let state = await zooGame.state();
    const placedRestroom = state.buildings.find((building) =>
      building.id.startsWith("placed_restroom_"),
    );
    expect(placedRestroom).toMatchObject({
      rotationQuarter: 1,
      size: {
        width: 1.05,
        depth: 1.25,
      },
    });

    await page.keyboard.press("b");
    const restroomPoint = await zooGame.selectionPoint(`building-${placedRestroom.id}`);
    await page.mouse.move(restroomPoint.x, restroomPoint.y);
    await page.keyboard.press("Shift+KeyR");

    state = await zooGame.state();
    expect(
      state.buildings.find((building) => building.id === placedRestroom.id),
    ).toMatchObject({
      rotationQuarter: 0,
      size: {
        width: 1.25,
        depth: 1.05,
      },
    });
  });

  test("uses the refresh shortcut for active building rotation without reloading", async ({
    page,
    zooGame,
  }) => {
    await zooGame.start();

    await page.keyboard.press("b");
    await page.keyboard.press("4");
    const placementPoint = await zooGame.groundPoint(-4.5, -3);
    await page.mouse.move(placementPoint.x, placementPoint.y);
    const reloadProbe = await page.evaluate(() => {
      window.__zooReloadProbe = crypto.randomUUID();
      return window.__zooReloadProbe;
    });

    await page.keyboard.press("Control+KeyR");

    await expect
      .poll(() => page.evaluate(() => window.__zooReloadProbe ?? null))
      .toBe(reloadProbe);
    await page.mouse.click(placementPoint.x, placementPoint.y);

    const state = await zooGame.state();
    expect(
      state.buildings.find((building) => building.id.startsWith("placed_restroom_")),
    ).toMatchObject({
      rotationQuarter: 1,
    });
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
