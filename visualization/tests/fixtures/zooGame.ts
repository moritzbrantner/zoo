// @ts-nocheck
import { expect, test as base } from "@playwright/test";

const gameStates = {
  staffingNeeded: 0,
  operating: 0,
};

class ZooGame {
  constructor(page) {
    this.page = page;
  }

  async start(state = "staffingNeeded") {
    await this.page.goto("/?e2e=1");
    await this.ensureTestApiReady();
    await this.page.getByRole("button", { name: "Start Zoo" }).click();
    await this.page.evaluate(() => window.__zooTestApi.setMotionEffects(false));
    await this.setState(state);
    await expect(this.page.getByLabel("Quick actions")).toBeHidden();
  }

  async ensureTestApiReady() {
    const startButton = this.page.getByRole("button", { name: "Start Zoo" });
    await expect(startButton).toBeVisible();
    const ready = await this.page
      .waitForFunction(() => Boolean(window.__zooTestApi?.ready), {
        timeout: 8_000,
      })
      .then(() => true)
      .catch(() => false);

    if (ready) return;

    await this.page.reload();
    await expect(startButton).toBeVisible();
    await this.page.waitForFunction(() => Boolean(window.__zooTestApi?.ready), {
      timeout: 15_000,
    });
  }

  async setState(state) {
    const time = this.timeForState(state);
    await this.page.evaluate((nextTime) => {
      window.__zooTestApi.setTime(nextTime);
    }, time);
    await expect(this.page.locator("#clock")).toContainText(/\d+s/);
  }

  async assignWorker(selectionId) {
    return this.page.evaluate((id) => window.__zooTestApi.assignWorker(id), selectionId);
  }

  async setEntryFee(value) {
    return this.page.evaluate((fee) => window.__zooTestApi.setEntryFee(fee), value);
  }

  timeForState(state) {
    if (typeof state === "number") return state;
    if (!(state in gameStates)) {
      throw new Error(`Unknown zoo game state fixture: ${state}`);
    }
    return gameStates[state];
  }

  async state() {
    return this.page.evaluate(() => window.__zooTestApi.getState());
  }

  async selectionPoint(selectionId) {
    return this.page.evaluate((id) => window.__zooTestApi.selectionPoint(id), selectionId);
  }

  async hasSelectionPoint(selectionId) {
    return this.page.evaluate((id) => window.__zooTestApi.hasSelectionPoint(id), selectionId);
  }

  async groundPoint(x, z) {
    return this.page.evaluate(
      ({ x: worldX, z: worldZ }) => window.__zooTestApi.groundPoint(worldX, worldZ),
      { x, z },
    );
  }

  async clickSelection(selectionId, options = {}) {
    const point = await this.selectionPoint(selectionId);
    await this.page.mouse.click(point.x, point.y, options);
  }

  async rightClickSelection(selectionId) {
    await this.clickSelection(selectionId, { button: "right" });
  }

  async clickGround(x, z, options = {}) {
    const point = await this.groundPoint(x, z);
    await this.page.mouse.click(point.x, point.y, options);
  }
}

const test = base.extend({
  zooGame: async ({ page }, use) => {
    await use(new ZooGame(page));
  },
});

export { expect, gameStates, test };
