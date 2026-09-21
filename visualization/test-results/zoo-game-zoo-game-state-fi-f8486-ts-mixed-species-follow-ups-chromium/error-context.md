# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: zoo-game.spec.ts >> zoo game state fixtures >> buys rabbits after a wood enclosure and rejects mixed-species follow-ups
- Location: tests/zoo-game.spec.ts:471:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#build-menu-status')
Expected: "Confirm fence."
Received: "Fence crosses a building or existing fence."
Timeout:  5000ms

Call log:
  - Expect "to.have.text" with timeout 5000ms
  - waiting for locator('#build-menu-status')
    8 × locator resolved to <p id="build-menu-status">Fence crosses a building or existing fence.</p>
      - unexpected value "Fence crosses a building or existing fence."

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
        - status [ref=e11]: 5 workers available
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
      - button "Inspect Visitors" [ref=e74] [cursor=pointer]:
        - generic [ref=e76]: Visitors
        - generic [ref=e77]: 12 / 42
      - button "Inspect Research" [ref=e79] [cursor=pointer]:
        - generic [ref=e81]: Research
        - generic [ref=e82]: 0 / 100
      - button "Inspect Reputation" [ref=e84] [cursor=pointer]:
        - generic [ref=e86]: Reputation
        - generic [ref=e87]: "1"
      - button "Inspect Conservation" [ref=e89] [cursor=pointer]:
        - generic [ref=e91]: Conservation
        - generic [ref=e92]: "0"
  - region "Selected element":
    - heading "Savanna Habitat" [level=2]
    - paragraph: Creates visitors and conservation
    - button "Assign Worker (0/2)" [ref=e94] [cursor=pointer]:
      - generic [ref=e95]: Assign Worker (0/2)
      - generic [ref=e96]: A
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
  - complementary "Build menu" [ref=e97]:
    - generic [ref=e98]:
      - generic [ref=e99]:
        - heading "Build" [level=2] [ref=e100]
        - paragraph [ref=e101]: Fence crosses a building or existing fence.
      - button "Close build menu" [ref=e102] [cursor=pointer]: x
    - searchbox "Search build menu" [ref=e103]
    - list [ref=e104]:
      - list [ref=e105]:
        - heading "Entry" [level=3] [ref=e106]
        - button "Place Customer Entry" [ref=e107] [cursor=pointer]:
          - generic [ref=e109]:
            - generic [ref=e110]:
              - strong [ref=e111]: Customer Entry
              - generic [ref=e112]: "1"
            - generic [ref=e113]:
              - generic [ref=e114]: Starter
              - generic [ref=e115]: Instant
              - generic [ref=e116]: No workers
      - list [ref=e117]:
        - heading "Guest Services" [level=3] [ref=e118]
        - button "Place Ticket Booth" [ref=e119] [cursor=pointer]:
          - generic [ref=e121]:
            - generic [ref=e122]:
              - strong [ref=e123]: Ticket Booth
              - generic [ref=e124]: "2"
            - generic [ref=e125]:
              - generic [ref=e126]: 24 coins, 12 lumber
              - generic [ref=e127]: 6s
              - generic [ref=e128]: 1 worker
        - button "Place Guest Plaza" [ref=e129] [cursor=pointer]:
          - generic [ref=e131]:
            - generic [ref=e132]:
              - strong [ref=e133]: Guest Plaza
              - generic [ref=e134]: "3"
            - generic [ref=e135]:
              - generic [ref=e136]: 30 coins, 18 lumber
              - generic [ref=e137]: 5s
              - generic [ref=e138]: No workers
        - button "Place Restroom" [ref=e139] [cursor=pointer]:
          - generic [ref=e141]:
            - generic [ref=e142]:
              - strong [ref=e143]: Restroom
              - generic [ref=e144]: "4"
            - generic [ref=e145]:
              - generic [ref=e146]: 35 coins, 8 water
              - generic [ref=e147]: 10s
              - generic [ref=e148]: 1 worker
        - button "Place Food Store" [ref=e149] [cursor=pointer]:
          - generic [ref=e151]:
            - generic [ref=e152]:
              - strong [ref=e153]: Food Store
              - generic [ref=e154]: "5"
            - generic [ref=e155]:
              - generic [ref=e156]: 40 coins, 10 lumber
              - generic [ref=e157]: 12s
              - generic [ref=e158]: 1 worker
        - button "Place Gift Shop" [ref=e159] [cursor=pointer]:
          - generic [ref=e161]:
            - generic [ref=e162]:
              - strong [ref=e163]: Gift Shop
              - generic [ref=e164]: "6"
            - generic [ref=e165]:
              - generic [ref=e166]: 55 coins, 16 lumber
              - generic [ref=e167]: 15s
              - generic [ref=e168]: 1 worker
      - list [ref=e169]:
        - heading "Staff" [level=3] [ref=e170]
        - button "Place Zookeeper House" [ref=e171] [cursor=pointer]:
          - generic [ref=e173]:
            - generic [ref=e174]:
              - strong [ref=e175]: Zookeeper House
              - generic [ref=e176]: "7"
            - generic [ref=e177]:
              - generic [ref=e178]: Starter
              - generic [ref=e179]: Instant
              - generic [ref=e180]: No workers
        - button "Place Keeper Kitchen" [ref=e181] [cursor=pointer]:
          - generic [ref=e183]:
            - generic [ref=e184]:
              - strong [ref=e185]: Keeper Kitchen
              - generic [ref=e186]: "8"
            - generic [ref=e187]:
              - generic [ref=e188]: 35 coins, 18 lumber
              - generic [ref=e189]: 12s
              - generic [ref=e190]: 1 worker
        - button "Place Feed Shed" [ref=e191] [cursor=pointer]:
          - generic [ref=e193]:
            - generic [ref=e194]:
              - strong [ref=e195]: Feed Shed
              - generic [ref=e196]: "9"
            - generic [ref=e197]:
              - generic [ref=e198]: 15 lumber
              - generic [ref=e199]: 5s
              - generic [ref=e200]: No workers
        - button "Place Vet Clinic" [ref=e201] [cursor=pointer]:
          - generic [ref=e203]:
            - generic [ref=e204]:
              - strong [ref=e205]: Vet Clinic
              - generic [ref=e206]: "0"
            - generic [ref=e207]:
              - generic [ref=e208]: 60 coins, 18 lumber
              - generic [ref=e209]: 18s
              - generic [ref=e210]: 1 worker
        - button "Place Maintenance Shed" [ref=e211] [cursor=pointer]:
          - generic [ref=e213]:
            - generic [ref=e214]:
              - strong [ref=e215]: Maintenance Shed
              - generic [ref=e216]: Q
            - generic [ref=e217]:
              - generic [ref=e218]: 45 coins, 20 lumber
              - generic [ref=e219]: 14s
              - generic [ref=e220]: 1 worker
        - button "Place Research Office" [ref=e221] [cursor=pointer]:
          - generic [ref=e223]:
            - generic [ref=e224]:
              - strong [ref=e225]: Research Office
              - generic [ref=e226]: W
            - generic [ref=e227]:
              - generic [ref=e228]: 80 coins, 24 lumber
              - generic [ref=e229]: 20s
              - generic [ref=e230]: 1 worker
      - list [ref=e231]:
        - heading "Habitats" [level=3] [ref=e232]
        - button "Place Animal Area" [ref=e233] [cursor=pointer]:
          - generic [ref=e235]:
            - generic [ref=e236]:
              - strong [ref=e237]: Animal Area
              - generic [ref=e238]: E
            - generic [ref=e239]:
              - generic [ref=e240]: 50 coins, 20 lumber
              - generic [ref=e241]: 18s
              - generic [ref=e242]: 1 worker
        - button "Place Savanna Habitat" [ref=e243] [cursor=pointer]:
          - generic [ref=e245]:
            - generic [ref=e246]:
              - strong [ref=e247]: Savanna Habitat
              - generic [ref=e248]: R
            - generic [ref=e249]:
              - generic [ref=e250]: 70 coins, 28 lumber
              - generic [ref=e251]: 24s
              - generic [ref=e252]: 2 workers
        - button "Place Wetlands Habitat" [ref=e253] [cursor=pointer]:
          - generic [ref=e255]:
            - generic [ref=e256]:
              - strong [ref=e257]: Wetlands Habitat
              - generic [ref=e258]: T
            - generic [ref=e259]:
              - generic [ref=e260]: 70 coins, 28 lumber
              - generic [ref=e261]: 24s
              - generic [ref=e262]: 2 workers
        - button "Place Aviary" [ref=e263] [cursor=pointer]:
          - generic [ref=e265]:
            - generic [ref=e266]:
              - strong [ref=e267]: Aviary
              - generic [ref=e268]: "Y"
            - generic [ref=e269]:
              - generic [ref=e270]: 70 coins, 28 lumber
              - generic [ref=e271]: 24s
              - generic [ref=e272]: 2 workers
        - button "Place Reptile House" [ref=e273] [cursor=pointer]:
          - generic [ref=e275]:
            - generic [ref=e276]:
              - strong [ref=e277]: Reptile House
              - generic [ref=e278]: U
            - generic [ref=e279]:
              - generic [ref=e280]: 70 coins, 28 lumber
              - generic [ref=e281]: 24s
              - generic [ref=e282]: 2 workers
    - button "Buy more land for $120 and expand the zoo to 26 by 20 tiles" [ref=e284] [cursor=pointer]: Buy Land for $120
    - generic [ref=e285]:
      - paragraph [ref=e286]: Fence Type
      - list [ref=e287]:
        - button "Wood Fence" [pressed] [ref=e288] [cursor=pointer]
        - button "Steel Fence" [ref=e289] [cursor=pointer]
        - button "Glass Barrier" [ref=e290] [cursor=pointer]
    - generic [ref=e291]:
      - paragraph [ref=e292]: Path Type
      - list [ref=e293]:
        - button "Guest Path" [pressed] [ref=e294] [cursor=pointer]
        - button "Staff Path" [ref=e295] [cursor=pointer]
        - button "Service Path" [ref=e296] [cursor=pointer]
    - generic "Map builder" [ref=e297]:
      - button "Draw Path" [ref=e298] [cursor=pointer]:
        - generic [ref=e299]: Draw Path
        - generic [ref=e300]: P
      - button "Confirm Path" [disabled] [ref=e301]:
        - generic [ref=e302]: Confirm Path
        - generic [ref=e303]: Enter
      - button "Cancel" [ref=e304] [cursor=pointer]:
        - generic [ref=e305]: Cancel
        - generic [ref=e306]: Esc
      - button "Define Area" [ref=e307] [cursor=pointer]:
        - generic [ref=e308]: Define Area
        - generic [ref=e309]: A
      - button "Confirm Area" [disabled] [ref=e310]:
        - generic [ref=e311]: Confirm Area
        - generic [ref=e312]: Enter
      - button "Build Fence" [active] [pressed] [ref=e313] [cursor=pointer]:
        - generic [ref=e314]: Build Fence
        - generic [ref=e315]: F
      - button "Confirm Fence" [disabled] [ref=e316]:
        - generic [ref=e317]: Confirm Fence
        - generic [ref=e318]: Enter
  - navigation "Game controls" [ref=e319]:
    - button "Reset camera" [ref=e320] [cursor=pointer]: ^
    - button "Place building" [pressed] [ref=e321] [cursor=pointer]
    - button "Return to main menu" [ref=e323] [cursor=pointer]
    - button "Settings" [ref=e325] [cursor=pointer]
```

# Test source

```ts
  382 |     await expect(page.locator("#build-menu-status")).toHaveText(
  383 |       "Restroom construction started (10s).",
  384 |     );
  385 |     await expect
  386 |       .poll(() => zooGame.state())
  387 |       .toMatchObject({
  388 |         buildings: expect.arrayContaining([
  389 |           expect.objectContaining({
  390 |             label: "Restroom",
  391 |             position: {
  392 |               x: -4.5,
  393 |               z: -2.5,
  394 |             },
  395 |           }),
  396 |         ]),
  397 |       });
  398 | 
  399 |     await page.getByRole("button", { name: "Place Food Store" }).click();
  400 |     await zooGame.clickGround(-4.5, -3);
  401 |     await expect(page.locator("#inspector-title")).toHaveText("Restroom");
  402 |     await expect(page.locator("#build-menu-status")).toHaveText("Choose a clear tile.");
  403 |   });
  404 | 
  405 |   test("shows the nine-species animal roster for a selected animal area", async ({
  406 |     page,
  407 |     zooGame,
  408 |   }) => {
  409 |     await zooGame.start();
  410 |     await zooGame.placeBuildingForTest("animal_area", 1.5, -3.5);
  411 |     await zooGame.setState(20);
  412 |     await zooGame.select("building-placed_animal_area_1");
  413 | 
  414 |     await expect(page.locator("#animal-roster")).toBeVisible();
  415 |     await expect(page.locator("#animal-roster-list").getByRole("button")).toHaveCount(9);
  416 |     await expect(page.locator("#animal-roster-list")).toContainText("Rabbit Colony");
  417 |     await expect(page.locator("#animal-roster-list")).toContainText("Elephant Herd");
  418 |     await expect(page.locator("#animal-roster-list")).toContainText("Unlocks at 48 visitors");
  419 |     await expect(page.getByRole("button", { name: /Rabbit Colony/ })).toBeDisabled();
  420 |     await expect(page.locator("#animal-roster-list")).toContainText("Steel Fence x4");
  421 |   });
  422 | 
  423 |   test("drags an animal group into an empty compatible animal area", async ({
  424 |     page,
  425 |     zooGame,
  426 |   }) => {
  427 |     await zooGame.start();
  428 |     await zooGame.placeBuildingForTest("animal_area", -4.5, -3);
  429 |     await zooGame.placeBuildingForTest("animal_area", -1.5, -3);
  430 |     await zooGame.seedAnimalGroup("placed_animal_area_1", "rabbit_colony");
  431 |     await zooGame.dragSelectionToGround("animal-group-1", -1.5, -3);
  432 | 
  433 |     await expect(page.locator("#build-menu-status")).toHaveText("Rabbit Colony moved to Animal Area.");
  434 |     await expect
  435 |       .poll(() => zooGame.state())
  436 |       .toMatchObject({
  437 |         animals: expect.arrayContaining([
  438 |           expect.objectContaining({
  439 |             id: "animal-group-1",
  440 |             buildingId: "placed_animal_area_2",
  441 |           }),
  442 |         ]),
  443 |       });
  444 |   });
  445 | 
  446 |   test("drags an animal group into another area when it already contains the same species", async ({
  447 |     zooGame,
  448 |   }) => {
  449 |     await zooGame.start();
  450 |     await zooGame.placeBuildingForTest("animal_area", -4.5, -3);
  451 |     await zooGame.placeBuildingForTest("animal_area", -1.5, -3);
  452 |     await zooGame.seedAnimalGroup("placed_animal_area_1", "rabbit_colony");
  453 |     await zooGame.seedAnimalGroup("placed_animal_area_2", "rabbit_colony");
  454 | 
  455 |     await zooGame.dragSelectionToGround("animal-group-1", -1.5, -3);
  456 | 
  457 |     await expect
  458 |       .poll(async () => {
  459 |         const state = await zooGame.state();
  460 |         return {
  461 |           firstArea: state.animals.filter((animal) => animal.buildingId === "placed_animal_area_1").length,
  462 |           secondArea: state.animals.filter((animal) => animal.buildingId === "placed_animal_area_2").length,
  463 |         };
  464 |       })
  465 |       .toEqual({
  466 |         firstArea: 0,
  467 |         secondArea: 2,
  468 |       });
  469 |   });
  470 | 
  471 |   test("buys rabbits after a wood enclosure and rejects mixed-species follow-ups", async ({
  472 |     page,
  473 |     zooGame,
  474 |   }) => {
  475 |     await zooGame.start();
  476 |     await zooGame.placeBuildingForTest("animal_area", 1.5, -3.5);
  477 |     await zooGame.setState(20);
  478 | 
  479 |     await page.getByRole("button", { name: "Place building" }).click();
  480 |     await page.getByRole("button", { name: "Build Fence" }).click();
  481 |     await zooGame.dragGround(0, -5, 3, -5);
> 482 |     await expect(page.locator("#build-menu-status")).toHaveText("Confirm fence.");
      |                                                     ^ Error: expect(locator).toHaveText(expected) failed
  483 |     await page.getByRole("button", { name: "Confirm Fence" }).click();
  484 | 
  485 |     const beforeRabbit = await zooGame.state();
  486 |     await page.getByRole("button", { name: "Close build menu" }).click();
  487 |     await zooGame.select("building-placed_animal_area_1");
  488 |     await page.getByRole("button", { name: /Rabbit Colony/ }).click();
  489 |     await expect(page.locator("#build-menu-status")).toHaveText(
  490 |       "Rabbit Colony added to Animal Area.",
  491 |     );
  492 | 
  493 |     const afterRabbit = await zooGame.state();
  494 |     expect(afterRabbit.animals).toEqual(
  495 |       expect.arrayContaining([
  496 |         expect.objectContaining({
  497 |           kind: "rabbit_colony",
  498 |           buildingId: "placed_animal_area_1",
  499 |         }),
  500 |       ]),
  501 |     );
  502 |     expect(afterRabbit.resources.values.vegetables).toBeLessThan(
  503 |       beforeRabbit.resources.values.vegetables,
  504 |     );
  505 |     expect(afterRabbit.resources.values.water).toBeLessThan(beforeRabbit.resources.values.water);
  506 |     expect(afterRabbit.pricing.animalCount).toBe(beforeRabbit.pricing.animalCount + 1);
  507 | 
  508 |     await zooGame.setState(120);
  509 |     await expect(page.locator("#animal-roster")).toBeVisible();
  510 |     await page.getByRole("button", { name: /Tortoise Group/ }).click();
  511 |     await expect(page.locator("#build-menu-status")).toHaveText(
  512 |       "Animal Area already contains Rabbit Colony.",
  513 |     );
  514 |   });
  515 | 
  516 |   test("buys more land and unlocks new building space beyond the original fence", async ({
  517 |     page,
  518 |     zooGame,
  519 |   }) => {
  520 |     await zooGame.start();
  521 |     await page.getByRole("button", { name: "Place building" }).click();
  522 | 
  523 |     await page.locator("#buy-land").click();
  524 |     await expect(page.locator("#build-menu-status")).toHaveText(
  525 |       "Zoo grounds expanded to 26 x 20 tiles for $120.",
  526 |     );
  527 | 
  528 |     const expanded = await zooGame.state();
  529 |     expect(expanded.land).toMatchObject({
  530 |       footprint: {
  531 |         columns: 26,
  532 |         rows: 20,
  533 |       },
  534 |       purchases: 1,
  535 |       nextCost: 180,
  536 |     });
  537 |     expect(expanded.resources.values.coins).toBe(300);
  538 | 
  539 |     await page.getByRole("button", { name: "Place Restroom" }).click();
  540 |     await zooGame.clickGround(0.2, 3.9);
  541 |     await expect(page.locator("#inspector-title")).toHaveText("Restroom");
  542 | 
  543 |     const placed = await zooGame.state();
  544 |     expect(placed.buildings).toEqual(
  545 |       expect.arrayContaining([
  546 |         expect.objectContaining({
  547 |           id: "placed_restroom_1",
  548 |           position: {
  549 |             x: 0.5,
  550 |             z: 3.5,
  551 |           },
  552 |         }),
  553 |       ]),
  554 |     );
  555 |   });
  556 | 
  557 |   test("builds guest stores and applies their staffed outputs", async ({ page, zooGame }) => {
  558 |     await zooGame.start();
  559 |     await page.getByRole("button", { name: "Place building" }).click();
  560 | 
  561 |     await page.getByRole("button", { name: "Place Food Store" }).click();
  562 |     await zooGame.clickGround(-4.5, -3);
  563 |     await expect(page.locator("#inspector-title")).toHaveText("Food Store");
  564 |     await expect(page.locator("#inspector-details")).toContainText(
  565 |       "Serves guests and turns foot traffic into revenue",
  566 |     );
  567 | 
  568 |     await page.getByRole("button", { name: "Place Gift Shop" }).click();
  569 |     await zooGame.clickGround(5.5, -1.5);
  570 |     await expect(page.locator("#inspector-title")).toHaveText("Gift Shop");
  571 |     await expect(page.locator("#inspector-details")).toContainText(
  572 |       "Sells souvenirs and generates research funding",
  573 |     );
  574 | 
  575 |     await zooGame.setState(20);
  576 |     const beforeStaffing = await zooGame.state();
  577 | 
  578 |     await zooGame.assignWorker("building-placed_snack_kiosk_1");
  579 |     await zooGame.assignWorker("building-placed_souvenir_stall_2");
  580 |     const afterStaffing = await zooGame.state();
  581 | 
  582 |     expect(afterStaffing.resources.values.coins - beforeStaffing.resources.values.coins).toBe(135);
```