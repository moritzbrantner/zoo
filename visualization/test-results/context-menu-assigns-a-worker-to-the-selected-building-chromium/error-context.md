# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-menu.spec.ts >> assigns a worker to the selected building
- Location: tests/context-menu.spec.ts:211:0

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#inspector-details')
Expected substring: "Worker 1"
Received string:    "TypeBuildingLevel1StatusUnmannedProductionNeeds workersManning0 / 2WorkersNoneRoleCreates visitors and conservationOutput14 visitors and 2 conservationSourceBuilt layout"
Timeout: 5000ms

Call log:
  - Expect "to.have.text" with timeout 5000ms
  - waiting for locator('#inspector-details')
    8 × locator resolved to <dl id="inspector-details">…</dl>
      - unexpected value "TypeBuildingLevel1StatusUnmannedProductionNeeds workersManning0 / 2WorkersNoneRoleCreates visitors and conservationOutput14 visitors and 2 conservationSourceBuilt layout"

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
        - paragraph [ref=e9]: "Server: dev-world-1781907822309783438 v4"
      - generic "Zoo counters" [ref=e10]:
        - status [ref=e11]: 4 workers available
        - status [ref=e12]: 4s
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Entry fee
        - status [ref=e16]: $12
      - slider "Entry fee" [ref=e17]: "12"
      - generic [ref=e18]:
        - generic [ref=e19]: $8 willing
        - generic [ref=e20]: 35% demand
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
      - list [ref=e33]:
        - listitem [ref=e34]:
          - generic [ref=e35]: Positive cashflow
          - generic [ref=e36]: done
        - listitem [ref=e37]:
          - generic [ref=e38]: Open first habitat
          - generic [ref=e39]: 0 / 1
        - listitem [ref=e40]:
          - generic [ref=e41]: Reach 25 visitors
          - generic [ref=e42]: 0 / 25
        - listitem [ref=e43]:
          - generic [ref=e44]: Average animal welfare 70
          - generic [ref=e45]: 0 / 70
        - listitem [ref=e46]:
          - generic [ref=e47]: Earn guest-service revenue
          - generic [ref=e48]: 0 / 1
        - listitem [ref=e49]:
          - generic [ref=e50]: Place 2 animal species
          - generic [ref=e51]: 0 / 2
    - generic [ref=e52]:
      - button "Inspect Coins" [ref=e53] [cursor=pointer]:
        - generic [ref=e55]: Coins
        - generic [ref=e56]: "402"
      - button "Inspect Lumber" [ref=e58] [cursor=pointer]:
        - generic [ref=e60]: Lumber
        - generic [ref=e61]: "258"
      - button "Inspect Vegetables" [ref=e63] [cursor=pointer]:
        - generic [ref=e65]: Vegetables
        - generic [ref=e66]: "80"
      - button "Inspect Meat" [ref=e68] [cursor=pointer]:
        - generic [ref=e70]: Meat
        - generic [ref=e71]: "40"
      - button "Inspect Fish" [ref=e73] [cursor=pointer]:
        - generic [ref=e75]: Fish
        - generic [ref=e76]: "40"
      - button "Inspect Animal Feed" [ref=e78] [cursor=pointer]:
        - generic [ref=e80]: Animal Feed
        - generic [ref=e81]: 0 / 80
      - button "Inspect Medicine" [ref=e83] [cursor=pointer]:
        - generic [ref=e85]: Medicine
        - generic [ref=e86]: 0 / 40
      - button "Inspect Water" [ref=e88] [cursor=pointer]:
        - generic [ref=e90]: Water
        - generic [ref=e91]: 80 / 120
      - button "Inspect Visitors" [ref=e93] [cursor=pointer]:
        - generic [ref=e95]: Visitors
        - generic [ref=e96]: 0 / 180
      - button "Inspect Research" [ref=e98] [cursor=pointer]:
        - generic [ref=e100]: Research
        - generic [ref=e101]: 0 / 100
      - button "Inspect Reputation" [ref=e103] [cursor=pointer]:
        - generic [ref=e105]: Reputation
        - generic [ref=e106]: "1"
      - button "Inspect Conservation" [ref=e108] [cursor=pointer]:
        - generic [ref=e110]: Conservation
        - generic [ref=e111]: "0"
  - region "Selected element":
    - heading "Savanna Habitat" [level=2]
    - paragraph: Creates visitors and conservation
    - button "Assign Worker (0/2)" [active] [ref=e113] [cursor=pointer]:
      - generic [ref=e114]: Assign Worker (0/2)
      - generic [ref=e115]: A
    - generic:
      - term: Type
      - definition: Building
      - term: Level
      - definition: "1"
      - term: Status
      - definition: Unmanned
      - term: Production
      - definition: Needs workers
      - term: Manning
      - definition: 0 / 2
      - term: Workers
      - definition: None
      - term: Role
      - definition: Creates visitors and conservation
      - term: Output
      - definition: 14 visitors and 2 conservation
      - term: Source
      - definition: Built layout
  - navigation "Game controls" [ref=e116]:
    - button "Reset camera" [ref=e117] [cursor=pointer]: ^
    - button "Place building" [ref=e118] [cursor=pointer]
    - button "Return to main menu" [ref=e120] [cursor=pointer]
    - button "Settings" [ref=e122] [cursor=pointer]
```

# Test source

```ts
  117 |   const start = await groundPoint(page, -5.5, -4);
  118 |   const end = await groundPoint(page, -4.5, -4);
  119 |   await page.mouse.move(start.x, start.y);
  120 |   await page.mouse.down();
  121 |   await page.mouse.move(end.x, end.y, { steps: 8 });
  122 |   await page.mouse.up();
  123 | 
  124 |   const confirmPath = page.getByRole("button", { name: "Confirm Path" });
  125 |   await expect(confirmPath).toBeEnabled();
  126 |   await confirmPath.click();
  127 | 
  128 |   await expect(page.locator("#inspector-title")).toHaveText("Service Path 1");
  129 |   await expect(page.locator("#build-menu-status")).toHaveText("Service Path 1 built.");
  130 | });
  131 | 
  132 | test("defines an area from the build menu", async ({ page }) => {
  133 |   await startZoo(page);
  134 |   await page.getByRole("button", { name: "Place building" }).click();
  135 |   await page.getByRole("button", { name: "Define Area" }).click();
  136 | 
  137 |   await expect(page.getByRole("button", { name: "Define Area" })).toHaveAttribute(
  138 |     "aria-pressed",
  139 |     "true",
  140 |   );
  141 | 
  142 |   const confirmArea = page.getByRole("button", { name: "Confirm Area" });
  143 |   const attempts = [
  144 |     [-5.5, -4, -3.5, -4],
  145 |     [2.5, 0, 4.5, 0],
  146 |     [-5.5, 4, -3.5, 4],
  147 |   ];
  148 | 
  149 |   for (const [startX, startZ, endX, endZ] of attempts) {
  150 |     const start = await groundPoint(page, startX, startZ);
  151 |     const end = await groundPoint(page, endX, endZ);
  152 |     await page.mouse.move(start.x, start.y);
  153 |     await page.mouse.down();
  154 |     await page.mouse.move(end.x, end.y, { steps: 8 });
  155 |     await page.mouse.up();
  156 |     if (await confirmArea.isEnabled()) break;
  157 |   }
  158 | 
  159 |   await expect(confirmArea).toBeEnabled();
  160 |   await confirmArea.click();
  161 | 
  162 |   await expect(page.locator("#inspector-title")).toHaveText("Guest Area 1");
  163 |   await expect(page.locator("#inspector-details")).toContainText("Player defined");
  164 |   await expect(page.locator("#build-menu-status")).toHaveText("Guest Area 1 defined.");
  165 | });
  166 | 
  167 | test("builds a fence from the build menu", async ({ page }) => {
  168 |   await startZoo(page);
  169 |   await page.getByRole("button", { name: "Place building" }).click();
  170 |   await page.getByRole("button", { name: "Build Fence" }).click();
  171 | 
  172 |   await expect(page.getByRole("button", { name: "Build Fence" })).toHaveAttribute(
  173 |     "aria-pressed",
  174 |     "true",
  175 |   );
  176 | 
  177 |   const confirmFence = page.getByRole("button", { name: "Confirm Fence" });
  178 |   const attempts = [
  179 |     [-5, -3.5, -2, -3.5],
  180 |     [2, -3.5, 5, -3.5],
  181 |     [5, -3.5, 5, -0.5],
  182 |   ];
  183 | 
  184 |   for (const [startX, startZ, endX, endZ] of attempts) {
  185 |     const start = await groundPoint(page, startX, startZ);
  186 |     const end = await groundPoint(page, endX, endZ);
  187 |     await page.mouse.move(start.x, start.y);
  188 |     await page.mouse.down();
  189 |     await page.mouse.move(end.x, end.y, { steps: 8 });
  190 |     await page.mouse.up();
  191 |     if (await confirmFence.isEnabled()) break;
  192 |   }
  193 | 
  194 |   await expect(confirmFence).toBeEnabled();
  195 |   await confirmFence.click();
  196 | 
  197 |   await expect(page.locator("#inspector-title")).toHaveText("Wood Fence 1");
  198 |   await expect(page.locator("#inspector-details")).toContainText("Player built");
  199 |   await expect(page.locator("#build-menu-status")).toHaveText("Wood Fence 1 built.");
  200 | 
  201 |   const { fences } = await page.evaluate(() => window.__zooTestApi.getState());
  202 |   expect(fences.length).toBeGreaterThan(0);
  203 |   for (const segment of fences) {
  204 |     expect(Number.isInteger(segment.start.x)).toBe(true);
  205 |     expect(Number.isInteger(segment.end.x)).toBe(true);
  206 |     expect(Number.isInteger(segment.start.z)).toBe(true);
  207 |     expect(Number.isInteger(segment.end.z)).toBe(true);
  208 |   }
  209 | });
  210 | 
  211 | test("assigns a worker to the selected building", async ({ page }) => {
  212 |   await startZoo(page);
  213 | 
  214 |   await page.getByRole("button", { name: /Assign Worker/ }).click();
  215 | 
  216 |   await expect(page.locator("#inspector-title")).toHaveText("Savanna Habitat");
> 217 |   await expect(page.locator("#inspector-details")).toContainText("Worker 1");
      |                                                   ^ Error: expect(locator).toContainText(expected) failed
  218 | });
  219 | 
  220 | test("does not open the scene context menu through visible overlays", async ({ page }) => {
  221 |   await startZoo(page);
  222 | 
  223 |   const inspector = page.locator(".inspector");
  224 |   await expect(inspector).toBeVisible();
  225 |   const box = await inspector.boundingBox();
  226 |   expect(box).toBeTruthy();
  227 | 
  228 |   await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  229 | 
  230 |   await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();
  231 | });
  232 | 
  233 | test("snaps off-grid building placement to tile centers", async ({ page }) => {
  234 |   await startZoo(page);
  235 |   await page.getByRole("button", { name: "Place building" }).click();
  236 | 
  237 |   await page.getByRole("button", { name: "Place Restroom" }).click();
  238 |   const point = await groundPoint(page, -4.2, -3.2);
  239 |   await page.mouse.click(point.x, point.y);
  240 | 
  241 |   const state = await page.evaluate(() => window.__zooTestApi.getState());
  242 |   const placedRestroom = state.buildings.find((building) =>
  243 |     building.id.startsWith("placed_restroom_"),
  244 |   );
  245 |   expect(placedRestroom).toBeTruthy();
  246 |   expect(placedRestroom.position.x).toBe(-4.5);
  247 |   expect(placedRestroom.position.z).toBe(-3.5);
  248 | });
  249 | 
```