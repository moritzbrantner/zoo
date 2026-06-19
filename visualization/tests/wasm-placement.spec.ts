// @ts-nocheck
import { expect, test } from "./fixtures/zooGame";

test("offline WASM placement evaluates and applies local construction commands", async ({
  page,
  zooGame,
}) => {
  await page.goto("/?e2e=1");
  await zooGame.ensureTestApiReady();

  const state = await page.evaluate(() => window.__zooTestApi.startLocalWasmSession());
  expect(state.syncStatus).toContain("WASM: local");

  const valid = await page.evaluate(() =>
    window.__zooTestApi.evaluateWasmPlacement("animal_area", 8, 11, "North"),
  );
  expect(valid.valid).toBe(true);
  expect(valid.occupied_tiles).toHaveLength(16);
  expect(valid.rejection).toBeNull();

  const invalid = await page.evaluate(() =>
    window.__zooTestApi.evaluateWasmPlacement("animal_area", 28, 11, "North"),
  );
  expect(invalid.valid).toBe(false);
  expect(invalid.rejection.code).toBe("placement_rule_not_met");
  expect(invalid.rejection.message).toContain("starter_plot");

  const accepted = await page.evaluate(() =>
    window.__zooTestApi.applySessionCommand({
      Engine: {
        ConstructBuilding: {
          kind: "animal_area",
          location: { x: 8, y: 11, elevation: 0 },
          orientation: "North",
        },
      },
    }),
  );
  expect(accepted.accepted).toBe(true);
  expect(accepted.version).toBe(1);
  expect(accepted.view.buildings.some((building) => building.kind === "animal_area")).toBe(true);

  const animalAreaCount = accepted.view.buildings.filter(
    (building) => building.kind === "animal_area",
  ).length;
  const rejected = await page.evaluate(() =>
    window.__zooTestApi.applySessionCommand(
      {
        Engine: {
          ConstructBuilding: {
            kind: "animal_area",
            location: { x: 28, y: 11, elevation: 0 },
            orientation: "North",
          },
        },
      },
      1,
    ),
  );
  expect(rejected.accepted).toBe(false);
  expect(rejected.version).toBe(1);
  expect(rejected.error).toContain("placement rule is not met");
  expect(rejected.view.buildings.filter((building) => building.kind === "animal_area")).toHaveLength(
    animalAreaCount,
  );
});
