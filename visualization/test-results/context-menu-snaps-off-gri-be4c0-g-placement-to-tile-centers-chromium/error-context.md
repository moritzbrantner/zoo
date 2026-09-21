# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-menu.spec.ts >> snaps off-grid building placement to tile centers
- Location: tests/context-menu.spec.ts:233:0

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
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
        - paragraph [ref=e9]: "Server: dev-world-1781907837192877348 v1"
      - generic "Zoo counters" [ref=e10]:
        - status [ref=e11]: 4 workers available
        - status [ref=e12]: 1s
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
          - generic [ref=e42]: 4 / 25
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
        - generic [ref=e96]: 4 / 180
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
    - button "Assign Worker (0/2)" [ref=e113] [cursor=pointer]:
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
  - complementary "Build menu" [ref=e116]:
    - generic [ref=e117]:
      - generic [ref=e118]:
        - heading "Build" [level=2] [ref=e119]
        - paragraph [ref=e120]: Building must touch a path.
      - button "Close build menu" [ref=e121] [cursor=pointer]: x
    - searchbox "Search build menu" [ref=e122]
    - list [ref=e123]:
      - list [ref=e124]:
        - heading "Entry" [level=3] [ref=e125]
        - button "Place Customer Entry" [ref=e126] [cursor=pointer]:
          - generic [ref=e128]:
            - generic [ref=e129]:
              - strong [ref=e130]: Customer Entry
              - generic [ref=e131]: "1"
            - generic [ref=e132]:
              - generic [ref=e133]: Starter
              - generic [ref=e134]: Instant
              - generic [ref=e135]: No workers
      - list [ref=e136]:
        - heading "Guest Services" [level=3] [ref=e137]
        - button "Place Ticket Booth" [ref=e138] [cursor=pointer]:
          - generic [ref=e140]:
            - generic [ref=e141]:
              - strong [ref=e142]: Ticket Booth
              - generic [ref=e143]: "2"
            - generic [ref=e144]:
              - generic [ref=e145]: 24 coins, 12 lumber
              - generic [ref=e146]: 6s
              - generic [ref=e147]: 1 worker
        - button "Place Guest Plaza" [ref=e148] [cursor=pointer]:
          - generic [ref=e150]:
            - generic [ref=e151]:
              - strong [ref=e152]: Guest Plaza
              - generic [ref=e153]: "3"
            - generic [ref=e154]:
              - generic [ref=e155]: 30 coins, 18 lumber
              - generic [ref=e156]: 5s
              - generic [ref=e157]: No workers
        - button "Place Restroom" [active] [pressed] [ref=e158] [cursor=pointer]:
          - generic [ref=e160]:
            - generic [ref=e161]:
              - strong [ref=e162]: Restroom
              - generic [ref=e163]: "4"
            - generic [ref=e164]:
              - generic [ref=e165]: 35 coins, 8 water
              - generic [ref=e166]: 10s
              - generic [ref=e167]: 1 worker
        - button "Place Food Store" [ref=e168] [cursor=pointer]:
          - generic [ref=e170]:
            - generic [ref=e171]:
              - strong [ref=e172]: Food Store
              - generic [ref=e173]: "5"
            - generic [ref=e174]:
              - generic [ref=e175]: 40 coins, 10 lumber
              - generic [ref=e176]: 12s
              - generic [ref=e177]: 1 worker
        - button "Place Gift Shop" [ref=e178] [cursor=pointer]:
          - generic [ref=e180]:
            - generic [ref=e181]:
              - strong [ref=e182]: Gift Shop
              - generic [ref=e183]: "6"
            - generic [ref=e184]:
              - generic [ref=e185]: 55 coins, 16 lumber
              - generic [ref=e186]: 15s
              - generic [ref=e187]: 1 worker
      - list [ref=e188]:
        - heading "Staff" [level=3] [ref=e189]
        - button "Place Zookeeper House" [ref=e190] [cursor=pointer]:
          - generic [ref=e192]:
            - generic [ref=e193]:
              - strong [ref=e194]: Zookeeper House
              - generic [ref=e195]: "7"
            - generic [ref=e196]:
              - generic [ref=e197]: Starter
              - generic [ref=e198]: Instant
              - generic [ref=e199]: No workers
        - button "Place Keeper Kitchen" [ref=e200] [cursor=pointer]:
          - generic [ref=e202]:
            - generic [ref=e203]:
              - strong [ref=e204]: Keeper Kitchen
              - generic [ref=e205]: "8"
            - generic [ref=e206]:
              - generic [ref=e207]: 35 coins, 18 lumber
              - generic [ref=e208]: 12s
              - generic [ref=e209]: 1 worker
        - button "Place Feed Shed" [ref=e210] [cursor=pointer]:
          - generic [ref=e212]:
            - generic [ref=e213]:
              - strong [ref=e214]: Feed Shed
              - generic [ref=e215]: "9"
            - generic [ref=e216]:
              - generic [ref=e217]: 15 lumber
              - generic [ref=e218]: 5s
              - generic [ref=e219]: No workers
        - button "Place Vet Clinic" [ref=e220] [cursor=pointer]:
          - generic [ref=e222]:
            - generic [ref=e223]:
              - strong [ref=e224]: Vet Clinic
              - generic [ref=e225]: "0"
            - generic [ref=e226]:
              - generic [ref=e227]: 60 coins, 18 lumber
              - generic [ref=e228]: 18s
              - generic [ref=e229]: 1 worker
        - button "Place Maintenance Shed" [ref=e230] [cursor=pointer]:
          - generic [ref=e232]:
            - generic [ref=e233]:
              - strong [ref=e234]: Maintenance Shed
              - generic [ref=e235]: Q
            - generic [ref=e236]:
              - generic [ref=e237]: 45 coins, 20 lumber
              - generic [ref=e238]: 14s
              - generic [ref=e239]: 1 worker
        - button "Place Research Office" [ref=e240] [cursor=pointer]:
          - generic [ref=e242]:
            - generic [ref=e243]:
              - strong [ref=e244]: Research Office
              - generic [ref=e245]: W
            - generic [ref=e246]:
              - generic [ref=e247]: 80 coins, 24 lumber
              - generic [ref=e248]: 20s
              - generic [ref=e249]: 1 worker
      - list [ref=e250]:
        - heading "Habitats" [level=3] [ref=e251]
        - button "Place Animal Area" [ref=e252] [cursor=pointer]:
          - generic [ref=e254]:
            - generic [ref=e255]:
              - strong [ref=e256]: Animal Area
              - generic [ref=e257]: E
            - generic [ref=e258]:
              - generic [ref=e259]: 50 coins, 20 lumber
              - generic [ref=e260]: 18s
              - generic [ref=e261]: 1 worker
        - button "Place Savanna Habitat" [ref=e262] [cursor=pointer]:
          - generic [ref=e264]:
            - generic [ref=e265]:
              - strong [ref=e266]: Savanna Habitat
              - generic [ref=e267]: R
            - generic [ref=e268]:
              - generic [ref=e269]: 70 coins, 28 lumber
              - generic [ref=e270]: 24s
              - generic [ref=e271]: 2 workers
        - button "Place Wetlands Habitat" [ref=e272] [cursor=pointer]:
          - generic [ref=e274]:
            - generic [ref=e275]:
              - strong [ref=e276]: Wetlands Habitat
              - generic [ref=e277]: T
            - generic [ref=e278]:
              - generic [ref=e279]: 70 coins, 28 lumber
              - generic [ref=e280]: 24s
              - generic [ref=e281]: 2 workers
        - button "Place Aviary" [ref=e282] [cursor=pointer]:
          - generic [ref=e284]:
            - generic [ref=e285]:
              - strong [ref=e286]: Aviary
              - generic [ref=e287]: "Y"
            - generic [ref=e288]:
              - generic [ref=e289]: 70 coins, 28 lumber
              - generic [ref=e290]: 24s
              - generic [ref=e291]: 2 workers
        - button "Place Reptile House" [ref=e292] [cursor=pointer]:
          - generic [ref=e294]:
            - generic [ref=e295]:
              - strong [ref=e296]: Reptile House
              - generic [ref=e297]: U
            - generic [ref=e298]:
              - generic [ref=e299]: 70 coins, 28 lumber
              - generic [ref=e300]: 24s
              - generic [ref=e301]: 2 workers
    - button "Buy more land for $120 and expand the zoo to 26 by 20 tiles" [ref=e303] [cursor=pointer]: Buy Land for $120
    - generic [ref=e304]:
      - paragraph [ref=e305]: Fence Type
      - list [ref=e306]:
        - button "Wood Fence" [pressed] [ref=e307] [cursor=pointer]
        - button "Steel Fence" [ref=e308] [cursor=pointer]
        - button "Glass Barrier" [ref=e309] [cursor=pointer]
    - generic [ref=e310]:
      - paragraph [ref=e311]: Path Type
      - list [ref=e312]:
        - button "Guest Path" [pressed] [ref=e313] [cursor=pointer]
        - button "Staff Path" [ref=e314] [cursor=pointer]
        - button "Service Path" [ref=e315] [cursor=pointer]
    - generic "Map builder" [ref=e316]:
      - button "Draw Path" [ref=e317] [cursor=pointer]:
        - generic [ref=e318]: Draw Path
        - generic [ref=e319]: P
      - button "Confirm Path" [disabled] [ref=e320]:
        - generic [ref=e321]: Confirm Path
        - generic [ref=e322]: Enter
      - button "Cancel" [disabled] [ref=e323]:
        - generic [ref=e324]: Cancel
        - generic [ref=e325]: Esc
      - button "Define Area" [ref=e326] [cursor=pointer]:
        - generic [ref=e327]: Define Area
        - generic [ref=e328]: A
      - button "Confirm Area" [disabled] [ref=e329]:
        - generic [ref=e330]: Confirm Area
        - generic [ref=e331]: Enter
      - button "Build Fence" [ref=e332] [cursor=pointer]:
        - generic [ref=e333]: Build Fence
        - generic [ref=e334]: F
      - button "Confirm Fence" [disabled] [ref=e335]:
        - generic [ref=e336]: Confirm Fence
        - generic [ref=e337]: Enter
  - navigation "Game controls" [ref=e338]:
    - button "Reset camera" [ref=e339] [cursor=pointer]: ^
    - button "Place building" [pressed] [ref=e340] [cursor=pointer]
    - button "Return to main menu" [ref=e342] [cursor=pointer]
    - button "Settings" [ref=e344] [cursor=pointer]
```

# Test source

```ts
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
  217 |   await expect(page.locator("#inspector-details")).toContainText("Worker 1");
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
> 245 |   expect(placedRestroom).toBeTruthy();
      |                         ^ Error: expect(received).toBeTruthy()
  246 |   expect(placedRestroom.position.x).toBe(-4.5);
  247 |   expect(placedRestroom.position.z).toBe(-3.5);
  248 | });
  249 | 
```