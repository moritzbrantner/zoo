# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: zoo-game.spec.ts >> zoo game state fixtures >> clicks resource rows against the staffed zoo state
- Location: tests/zoo-game.spec.ts:713:2

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Inspect Conservation' })
    - locator resolved to <div tabindex="0" role="button" class="resource-row" aria-label="Inspect Conservation" data-selection-id="resource-conservation_points">…</div>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 100ms
    28 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic "Three dimensional zoo game visualization" [ref=e3]
  - region "Zoo state" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Zoo Operations" [level=1] [ref=e7]
        - paragraph [ref=e8]: Staffing needed
        - paragraph [ref=e9]: "Sync: local simulation"
      - generic "Zoo counters" [ref=e10]:
        - status [ref=e11]: 2 workers available
        - status [ref=e12]: 27s
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Entry fee
        - status [ref=e16]: $12
      - slider "Entry fee" [ref=e17]: "12"
      - generic [ref=e18]:
        - generic [ref=e19]: $40 willing
        - generic [ref=e20]: 91% demand
    - generic "Tycoon economy" [ref=e21]:
      - generic [ref=e22]:
        - generic [ref=e23]: Revenue
        - status [ref=e24]: $0
      - generic [ref=e25]:
        - generic [ref=e26]: Expenses
        - status [ref=e27]: $0
      - generic [ref=e28]:
        - generic [ref=e29]: Cashflow / min
        - status [ref=e30]: $0
    - generic "Sandbox milestones" [ref=e31]:
      - heading "Milestones" [level=2] [ref=e32]
      - list
    - generic [ref=e33]:
      - button "Inspect Coins" [ref=e34] [cursor=pointer]:
        - generic [ref=e36]: Coins
        - generic [ref=e37]: "564"
      - button "Inspect Lumber" [ref=e39] [cursor=pointer]:
        - generic [ref=e41]: Lumber
        - generic [ref=e42]: "260"
      - button "Inspect Vegetables" [ref=e44] [cursor=pointer]:
        - generic [ref=e46]: Vegetables
        - generic [ref=e47]: "80"
      - button "Inspect Meat" [ref=e49] [cursor=pointer]:
        - generic [ref=e51]: Meat
        - generic [ref=e52]: "40"
      - button "Inspect Fish" [ref=e54] [cursor=pointer]:
        - generic [ref=e56]: Fish
        - generic [ref=e57]: "40"
      - button "Inspect Animal Feed" [ref=e59] [cursor=pointer]:
        - generic [ref=e61]: Animal Feed
        - generic [ref=e62]: 20 / 80
      - button "Inspect Medicine" [ref=e64] [cursor=pointer]:
        - generic [ref=e66]: Medicine
        - generic [ref=e67]: 6 / 40
      - button "Inspect Water" [ref=e69] [cursor=pointer]:
        - generic [ref=e71]: Water
        - generic [ref=e72]: 80 / 120
      - button "Inspect Visitors" [active] [ref=e74] [cursor=pointer]:
        - generic [ref=e76]: Visitors
        - generic [ref=e77]: 26 / 42
      - button "Inspect Research" [ref=e79] [cursor=pointer]:
        - generic [ref=e81]: Research
        - generic [ref=e82]: 2 / 100
      - button "Inspect Reputation" [ref=e84] [cursor=pointer]:
        - generic [ref=e86]: Reputation
        - generic [ref=e87]: "1"
      - button "Inspect Conservation" [ref=e89] [cursor=pointer]:
        - generic [ref=e91]: Conservation
        - generic [ref=e92]: "2"
  - region "Selected element":
    - heading "Visitors" [level=2]
    - paragraph: Guests available to spend at zoo attractions.
    - generic:
      - term: Type
      - definition: Resource
      - term: Amount
      - definition: 26 / 42
      - term: Capacity
      - definition: "42"
      - term: Phase
      - definition: Staffing needed
  - navigation "Game controls" [ref=e94]:
    - button "Reset camera" [ref=e95] [cursor=pointer]: ^
    - button "Place building" [ref=e96] [cursor=pointer]
    - button "Return to main menu" [ref=e98] [cursor=pointer]
    - button "Settings" [ref=e100] [cursor=pointer]
```

# Test source

```ts
  623 |     let state = await zooGame.state();
  624 |     const placedRestroom = state.buildings.find((building) =>
  625 |       building.id.startsWith("placed_restroom_"),
  626 |     );
  627 |     expect(placedRestroom).toMatchObject({
  628 |       rotationQuarter: 1,
  629 |       size: {
  630 |         width: 1.05,
  631 |         depth: 1.25,
  632 |       },
  633 |     });
  634 | 
  635 |     await page.keyboard.press("b");
  636 |     const restroomPoint = await zooGame.selectionPoint(`building-${placedRestroom.id}`);
  637 |     await page.mouse.move(restroomPoint.x, restroomPoint.y);
  638 |     await page.keyboard.press("Shift+KeyR");
  639 | 
  640 |     state = await zooGame.state();
  641 |     expect(
  642 |       state.buildings.find((building) => building.id === placedRestroom.id),
  643 |     ).toMatchObject({
  644 |       rotationQuarter: 0,
  645 |       size: {
  646 |         width: 1.25,
  647 |         depth: 1.05,
  648 |       },
  649 |     });
  650 |   });
  651 | 
  652 |   test("uses the refresh shortcut for active building rotation without reloading", async ({
  653 |     page,
  654 |     zooGame,
  655 |   }) => {
  656 |     await zooGame.start();
  657 | 
  658 |     await page.keyboard.press("b");
  659 |     await page.keyboard.press("4");
  660 |     const placementPoint = await zooGame.groundPoint(-4.5, -3);
  661 |     await page.mouse.move(placementPoint.x, placementPoint.y);
  662 |     const reloadProbe = await page.evaluate(() => {
  663 |       window.__zooReloadProbe = crypto.randomUUID();
  664 |       return window.__zooReloadProbe;
  665 |     });
  666 | 
  667 |     await page.keyboard.press("Control+KeyR");
  668 | 
  669 |     await expect
  670 |       .poll(() => page.evaluate(() => window.__zooReloadProbe ?? null))
  671 |       .toBe(reloadProbe);
  672 |     await page.mouse.click(placementPoint.x, placementPoint.y);
  673 | 
  674 |     const state = await zooGame.state();
  675 |     expect(
  676 |       state.buildings.find((building) => building.id.startsWith("placed_restroom_")),
  677 |     ).toMatchObject({
  678 |       rotationQuarter: 1,
  679 |     });
  680 |   });
  681 | 
  682 |   test("commands a selected worker with the keyboard", async ({ page, zooGame }) => {
  683 |     await zooGame.start();
  684 |     await zooGame.assignWorker("building-savanna_habitat");
  685 | 
  686 |     await zooGame.clickSelection("worker-spawned_1");
  687 |     await page.keyboard.press("m");
  688 |     await expect(page.locator("#inspector-summary")).toContainText("Command mode");
  689 | 
  690 |     await zooGame.clickSelection("building-keeper_kitchen");
  691 |     await expect(page.locator("#inspector-title")).toHaveText("Worker 1");
  692 |     await expect(page.locator("#inspector-details")).toContainText("Keeper Kitchen");
  693 | 
  694 |     const reassigned = await zooGame.state();
  695 |     expect(reassigned.workers[0]).toMatchObject({
  696 |       assignmentTargetId: "building-keeper_kitchen",
  697 |       assignedBuildingId: "keeper_kitchen",
  698 |       walkTarget: expect.objectContaining({ label: "Keeper Kitchen" }),
  699 |     });
  700 |   });
  701 | 
  702 |   test("fires context menu actions from hotkeys", async ({ page, zooGame }) => {
  703 |     await zooGame.start();
  704 | 
  705 |     await zooGame.rightClickSelection("building-savanna_habitat");
  706 |     await expect(page.getByLabel("Quick actions")).toBeVisible();
  707 |     await page.keyboard.press("a");
  708 | 
  709 |     await expect(page.getByLabel("Quick actions")).toBeHidden();
  710 |     await expect(page.locator("#inspector-details")).toContainText("1 / 2");
  711 |   });
  712 | 
  713 |   test("clicks resource rows against the staffed zoo state", async ({ page, zooGame }) => {
  714 |     await zooGame.start();
  715 |     await zooGame.assignWorker("building-savanna_habitat");
  716 |     await zooGame.assignWorker("building-savanna_habitat");
  717 | 
  718 |     await page.getByRole("button", { name: "Inspect Visitors" }).click();
  719 |     await expect(page.locator("#inspector-title")).toHaveText("Visitors");
  720 |     await expect(page.locator("#inspector-details")).toContainText("14 / 42");
  721 |     await expect(page.locator("#inspector-details")).toContainText("Staffing needed");
  722 | 
> 723 |     await page.getByRole("button", { name: "Inspect Conservation" }).click();
      |                                                                     ^ Error: click: Test timeout of 30000ms exceeded.
  724 |     await expect(page.locator("#inspector-details")).toContainText("2");
  725 |   });
  726 | 
  727 |   test("entry fee changes visitor demand and arrival pace", async ({ page, zooGame }) => {
  728 |     await zooGame.start();
  729 | 
  730 |     const starting = await zooGame.state();
  731 |     expect(starting.pricing.entryFee).toBe(12);
  732 |     expect(starting.pricing.willingness).toBeGreaterThan(12);
  733 | 
  734 |     const cheap = await zooGame.setEntryFee(4);
  735 |     await expect(page.locator("#entry-fee-value")).toHaveText("$4");
  736 |     expect(cheap.pricing.demandPercent).toBeGreaterThan(starting.pricing.demandPercent);
  737 | 
  738 |     await zooGame.setState(60);
  739 |     const cheapAfterMinute = await zooGame.state();
  740 | 
  741 |     const expensive = await zooGame.setEntryFee(70);
  742 |     expect(expensive.pricing.demandPercent).toBeLessThan(cheap.pricing.demandPercent);
  743 |     await zooGame.setState(60);
  744 |     const expensiveAfterMinute = await zooGame.state();
  745 | 
  746 |     expect(cheapAfterMinute.resources.values.visitors).toBeGreaterThan(
  747 |       expensiveAfterMinute.resources.values.visitors,
  748 |     );
  749 |     expect(expensiveAfterMinute.pricing.expectedCustomersPerMinute).toBeLessThan(
  750 |       cheapAfterMinute.pricing.expectedCustomersPerMinute,
  751 |     );
  752 |   });
  753 | });
  754 | 
```