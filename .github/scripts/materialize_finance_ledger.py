from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


rust_path = Path("crates/zoo-core/src/lib.rs")
rust = rust_path.read_text()

rust = replace_once(
    rust,
    """#[derive(Clone, Debug)]
struct Keeper {
    id: u32,
    assigned_habitat_id: Option<u32>,
    deliveries_completed: u32,
}

""",
    """#[derive(Clone, Debug)]
struct Keeper {
    id: u32,
    assigned_habitat_id: Option<u32>,
    deliveries_completed: u32,
}

#[derive(Clone, Copy, Debug)]
enum IncomeCategory {
    Admissions,
    Concessions,
}

#[derive(Clone, Copy, Debug)]
enum ExpenseCategory {
    Construction,
    AnimalPurchase,
    HabitatCare,
    AnimalFeed,
    KeeperHiring,
    ParkUpkeep,
    KeeperWages,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
struct FinanceLedger {
    admissions_income_cents: i64,
    concession_income_cents: i64,
    construction_expense_cents: i64,
    animal_purchase_expense_cents: i64,
    habitat_care_expense_cents: i64,
    animal_feed_expense_cents: i64,
    keeper_hiring_expense_cents: i64,
    park_upkeep_expense_cents: i64,
    keeper_wages_expense_cents: i64,
}

impl FinanceLedger {
    fn record_income(&mut self, category: IncomeCategory, cents: i64) {
        match category {
            IncomeCategory::Admissions => self.admissions_income_cents += cents,
            IncomeCategory::Concessions => self.concession_income_cents += cents,
        }
    }

    fn record_expense(&mut self, category: ExpenseCategory, cents: i64) {
        match category {
            ExpenseCategory::Construction => self.construction_expense_cents += cents,
            ExpenseCategory::AnimalPurchase => self.animal_purchase_expense_cents += cents,
            ExpenseCategory::HabitatCare => self.habitat_care_expense_cents += cents,
            ExpenseCategory::AnimalFeed => self.animal_feed_expense_cents += cents,
            ExpenseCategory::KeeperHiring => self.keeper_hiring_expense_cents += cents,
            ExpenseCategory::ParkUpkeep => self.park_upkeep_expense_cents += cents,
            ExpenseCategory::KeeperWages => self.keeper_wages_expense_cents += cents,
        }
    }

    fn income_total_cents(self) -> i64 {
        self.admissions_income_cents + self.concession_income_cents
    }

    fn expense_total_cents(self) -> i64 {
        self.construction_expense_cents
            + self.animal_purchase_expense_cents
            + self.habitat_care_expense_cents
            + self.animal_feed_expense_cents
            + self.keeper_hiring_expense_cents
            + self.park_upkeep_expense_cents
            + self.keeper_wages_expense_cents
    }

    fn profit_cents(self) -> i64 {
        self.income_total_cents() - self.expense_total_cents()
    }
}

""",
    "finance types",
)

rust = replace_once(
    rust,
    """    movement_accumulator: u32,
    income_today_cents: i64,
    expenses_today_cents: i64,
    concession_revenue_today_cents: i64,
}
""",
    """    movement_accumulator: u32,
    finance_today: FinanceLedger,
    finance_previous: Option<FinanceLedger>,
}
""",
    "game state finance fields",
)

rust = replace_once(
    rust,
    """            movement_accumulator: 0,
            income_today_cents: 0,
            expenses_today_cents: 0,
            concession_revenue_today_cents: 0,
        };
""",
    """            movement_accumulator: 0,
            finance_today: FinanceLedger::default(),
            finance_previous: None,
        };
""",
    "default finance fields",
)

rust = replace_once(
    rust,
    """    fn spend(&mut self, cents: i64) -> Result<(), &'static str> {
        if self.cash_cents < cents {
            return Err("Not enough cash");
        }
        self.cash_cents -= cents;
        self.expenses_today_cents += cents;
        Ok(())
    }
""",
    """    fn spend(&mut self, cents: i64, category: ExpenseCategory) -> Result<(), &'static str> {
        if self.cash_cents < cents {
            return Err("Not enough cash");
        }
        self.cash_cents -= cents;
        self.finance_today.record_expense(category, cents);
        Ok(())
    }

    fn earn(&mut self, cents: i64, category: IncomeCategory) {
        self.cash_cents += cents;
        self.finance_today.record_income(category, cents);
    }
""",
    "spend helper",
)

spend_replacements = {
    "self.spend(PATH_COST)": "self.spend(PATH_COST, ExpenseCategory::Construction)",
    "self.spend(kind.build_cost())": "self.spend(kind.build_cost(), ExpenseCategory::Construction)",
    "self.spend(evaluation.cost_cents)": "self.spend(evaluation.cost_cents, ExpenseCategory::Construction)",
    "self.spend(species.purchase_cost())": "self.spend(species.purchase_cost(), ExpenseCategory::AnimalPurchase)",
    "self.spend(FEED_BATCH_COST)": "self.spend(FEED_BATCH_COST, ExpenseCategory::AnimalFeed)",
    "self.spend(KEEPER_HIRE_COST)": "self.spend(KEEPER_HIRE_COST, ExpenseCategory::KeeperHiring)",
    "self.spend(WATER_REFILL_COST)": "self.spend(WATER_REFILL_COST, ExpenseCategory::HabitatCare)",
    "self.spend(CLEAN_HABITAT_COST)": "self.spend(CLEAN_HABITAT_COST, ExpenseCategory::HabitatCare)",
    "self.spend(SHELTER_COST)": "self.spend(SHELTER_COST, ExpenseCategory::HabitatCare)",
}
for old, new in spend_replacements.items():
    if old not in rust:
        raise SystemExit(f"missing spend anchor: {old}")
    rust = rust.replace(old, new)

rust = replace_once(
    rust,
    """                self.day += 1;
                self.income_today_cents = 0;
                self.expenses_today_cents = 0;
                self.concession_revenue_today_cents = 0;
                for stand in &mut self.concessions {
""",
    """                self.day += 1;
                self.finance_previous = Some(self.finance_today);
                self.finance_today = FinanceLedger::default();
                for stand in &mut self.concessions {
""",
    "day rollover",
)

rust = replace_once(
    rust,
    """        self.cash_cents += ADMISSION_PRICE;
        self.income_today_cents += ADMISSION_PRICE;
        self.guests.push(Guest {
""",
    """        self.earn(ADMISSION_PRICE, IncomeCategory::Admissions);
        self.guests.push(Guest {
""",
    "admission income",
)

rust = replace_once(
    rust,
    """            self.cash_cents += price;
            self.income_today_cents += price;
            self.concession_revenue_today_cents += price;
            {
""",
    """            self.earn(price, IncomeCategory::Concessions);
            {
""",
    "concession income",
)

rust = replace_once(
    rust,
    """        let upkeep = self.habitats.len() as i64 * 250
            + animal_count * 125
            + fence_count * 8
            + self.concessions.len() as i64 * 50
            + self.keepers.len() as i64 * KEEPER_HOURLY_WAGE;
        self.cash_cents -= upkeep;
        self.expenses_today_cents += upkeep;
""",
    """        let park_upkeep = self.habitats.len() as i64 * 250
            + animal_count * 125
            + fence_count * 8
            + self.concessions.len() as i64 * 50;
        let keeper_wages = self.keepers.len() as i64 * KEEPER_HOURLY_WAGE;
        self.cash_cents -= park_upkeep + keeper_wages;
        self.finance_today
            .record_expense(ExpenseCategory::ParkUpkeep, park_upkeep);
        self.finance_today
            .record_expense(ExpenseCategory::KeeperWages, keeper_wages);
""",
    "upkeep ledger",
)

rust = replace_once(
    rust,
    """            finance: FinanceView {
                income_today_cents: self.income_today_cents,
                expenses_today_cents: self.expenses_today_cents,
                profit_today_cents: self.income_today_cents - self.expenses_today_cents,
                admission_price_cents: ADMISSION_PRICE,
                concession_revenue_today_cents: self.concession_revenue_today_cents,
            },
""",
    """            finance: FinanceView::new(
                self.day,
                self.finance_today,
                self.finance_previous,
            ),
""",
    "finance snapshot",
)

rust = replace_once(
    rust,
    """#[derive(Serialize)]
struct FinanceView {
    income_today_cents: i64,
    expenses_today_cents: i64,
    profit_today_cents: i64,
    admission_price_cents: i64,
    concession_revenue_today_cents: i64,
}
""",
    """#[derive(Clone, Copy, Debug, Serialize)]
struct FinanceDayView {
    day: u32,
    income_cents: i64,
    expenses_cents: i64,
    profit_cents: i64,
    breakdown: FinanceLedger,
}

impl FinanceDayView {
    fn new(day: u32, ledger: FinanceLedger) -> Self {
        Self {
            day,
            income_cents: ledger.income_total_cents(),
            expenses_cents: ledger.expense_total_cents(),
            profit_cents: ledger.profit_cents(),
            breakdown: ledger,
        }
    }
}

#[derive(Serialize)]
struct FinanceView {
    admission_price_cents: i64,
    current_day: FinanceDayView,
    previous_day: Option<FinanceDayView>,
    profit_change_cents: Option<i64>,
    profit_trend: &'static str,
}

impl FinanceView {
    fn new(day: u32, current: FinanceLedger, previous: Option<FinanceLedger>) -> Self {
        let current_day = FinanceDayView::new(day, current);
        let previous_day =
            previous.map(|ledger| FinanceDayView::new(day.saturating_sub(1), ledger));
        let profit_change_cents =
            previous_day.map(|previous| current_day.profit_cents - previous.profit_cents);
        let profit_trend = match profit_change_cents {
            None => "no_previous_day",
            Some(change) if change > 0 => "up",
            Some(change) if change < 0 => "down",
            Some(_) => "flat",
        };
        Self {
            admission_price_cents: ADMISSION_PRICE,
            current_day,
            previous_day,
            profit_change_cents,
            profit_trend,
        }
    }
}
""",
    "finance view",
)

rust = replace_once(
    rust,
    """        assert_eq!(
            state.concession_revenue_today_cents,
            DRINK_PRICE + FOOD_PRICE
        );
""",
    """        assert_eq!(
            state.finance_today.concession_income_cents,
            DRINK_PRICE + FOOD_PRICE
        );
""",
    "concession test ledger assertion",
)

rust = replace_once(
    rust,
    """        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);

        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);
""",
    """        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);
        assert_eq!(state.finance_today.construction_expense_cents, PATH_COST);

        assert!(state.place_path(5, ENTRANCE_Y).ok);
        assert_eq!(state.cash_cents, before - PATH_COST);
        assert_eq!(state.finance_today.construction_expense_cents, PATH_COST);
""",
    "path ledger idempotence",
)

rust = replace_once(
    rust,
    """        state.charge_upkeep();

        assert_eq!(state.cash_cents, before - KEEPER_HOURLY_WAGE);
    }

    #[test]
    fn simulation_remains_deterministic() {
""",
    """        state.charge_upkeep();

        assert_eq!(state.cash_cents, before - KEEPER_HOURLY_WAGE);
        assert_eq!(
            state.finance_today.keeper_wages_expense_cents,
            KEEPER_HOURLY_WAGE
        );
    }

    #[test]
    fn finance_ledger_reconciles_current_economy_categories() {
        let mut state = GameState::default();
        assert!(state.place_habitat(3, 8, HabitatOrientation::Horizontal).ok);
        let habitat_id = state.habitats[0].id;

        assert!(state.buy_animal_feed().ok);
        assert!(state.hire_keeper().ok);
        assert!(state.schedule_keeper(habitat_id).ok);
        assert!(state.adopt(habitat_id, "capybara").ok);

        let care_before = state.finance_today.habitat_care_expense_cents;
        assert!(state.refill_water(habitat_id).ok);
        assert_eq!(
            state.finance_today.habitat_care_expense_cents,
            care_before
        );

        state.habitats[0].water = 40;
        assert!(state.refill_water(habitat_id).ok);
        state.try_spawn_guest();
        assert_eq!(state.guests.len(), 1);
        state.charge_upkeep();

        let ledger = state.finance_today;
        assert_eq!(ledger.admissions_income_cents, ADMISSION_PRICE);
        assert_eq!(
            ledger.construction_expense_cents,
            habitat_cost(LEGACY_HABITAT_WIDTH, LEGACY_HABITAT_HEIGHT)
        );
        assert_eq!(
            ledger.animal_purchase_expense_cents,
            Species::parse("capybara").unwrap().purchase_cost()
        );
        assert_eq!(ledger.habitat_care_expense_cents, WATER_REFILL_COST);
        assert_eq!(ledger.animal_feed_expense_cents, FEED_BATCH_COST);
        assert_eq!(ledger.keeper_hiring_expense_cents, KEEPER_HIRE_COST);
        assert!(ledger.park_upkeep_expense_cents > 0);
        assert_eq!(ledger.keeper_wages_expense_cents, KEEPER_HOURLY_WAGE);
        assert_eq!(
            ledger.expense_total_cents(),
            ledger.construction_expense_cents
                + ledger.animal_purchase_expense_cents
                + ledger.habitat_care_expense_cents
                + ledger.animal_feed_expense_cents
                + ledger.keeper_hiring_expense_cents
                + ledger.park_upkeep_expense_cents
                + ledger.keeper_wages_expense_cents
        );
        assert_eq!(
            ledger.profit_cents(),
            ledger.income_total_cents() - ledger.expense_total_cents()
        );
    }

    #[test]
    fn finance_day_rollover_preserves_previous_day_and_resets_current_day() {
        let mut state = GameState::default();
        state
            .finance_today
            .record_income(IncomeCategory::Admissions, 1_200);
        state
            .finance_today
            .record_expense(ExpenseCategory::Construction, 1_000);
        state.minute_of_day = 24 * 60 - 1;

        state.tick(1);

        assert_eq!(state.day, 2);
        assert_eq!(state.finance_today, FinanceLedger::default());
        let previous = state.finance_previous.expect("day one ledger retained");
        assert_eq!(previous.admissions_income_cents, 1_200);
        assert_eq!(previous.construction_expense_cents, 1_000);
        assert_eq!(previous.profit_cents(), 200);

        let view = FinanceView::new(state.day, state.finance_today, state.finance_previous);
        assert_eq!(view.current_day.profit_cents, 0);
        assert_eq!(view.previous_day.expect("previous day view").day, 1);
        assert_eq!(view.profit_change_cents, Some(-200));
        assert_eq!(view.profit_trend, "down");
    }

    #[test]
    fn simulation_remains_deterministic() {
""",
    "finance tests",
)

rust_path.write_text(rust)

app_path = Path("apps/web/src/App.tsx")
app = app_path.read_text()

app = replace_once(
    app,
    """type Snapshot = {
""",
    """type FinanceBreakdown = {
  admissions_income_cents: number
  concession_income_cents: number
  construction_expense_cents: number
  animal_purchase_expense_cents: number
  habitat_care_expense_cents: number
  animal_feed_expense_cents: number
  keeper_hiring_expense_cents: number
  park_upkeep_expense_cents: number
  keeper_wages_expense_cents: number
}

type FinanceDay = {
  day: number
  income_cents: number
  expenses_cents: number
  profit_cents: number
  breakdown: FinanceBreakdown
}

type Snapshot = {
""",
    "finance typescript types",
)

app = replace_once(
    app,
    """  finance: {
    income_today_cents: number
    expenses_today_cents: number
    profit_today_cents: number
    admission_price_cents: number
    concession_revenue_today_cents: number
  }
""",
    """  finance: {
    admission_price_cents: number
    current_day: FinanceDay
    previous_day: FinanceDay | null
    profit_change_cents: number | null
    profit_trend: "up" | "down" | "flat" | "no_previous_day"
  }
""",
    "snapshot finance type",
)

app = replace_once(
    app,
    """                <div className="finance-grid">
                  <span>Income today</span>
                  <strong>{money(snapshot.finance.income_today_cents)}</strong>
                  <span>Expenses today</span>
                  <strong>{money(snapshot.finance.expenses_today_cents)}</strong>
                  <span>Profit today</span>
                  <strong>{money(snapshot.finance.profit_today_cents)}</strong>
                  <span>Admission</span>
                  <strong>{money(snapshot.finance.admission_price_cents)}</strong>
                  <span>Stand sales</span>
                  <strong>{money(snapshot.finance.concession_revenue_today_cents)}</strong>
                </div>
""",
    """                <div className="finance-grid">
                  <span>Income today</span>
                  <strong>{money(snapshot.finance.current_day.income_cents)}</strong>
                  <span>Expenses today</span>
                  <strong>{money(snapshot.finance.current_day.expenses_cents)}</strong>
                  <span>Profit today</span>
                  <strong>{money(snapshot.finance.current_day.profit_cents)}</strong>
                  <span>Admission price</span>
                  <strong>{money(snapshot.finance.admission_price_cents)}</strong>
                  <span>Trend</span>
                  <strong>
                    {snapshot.finance.profit_change_cents === null
                      ? "First day"
                      : `${snapshot.finance.profit_trend} · ${money(
                          snapshot.finance.profit_change_cents,
                        )}`}
                  </strong>
                </div>
                <h3>Income breakdown</h3>
                <div className="finance-grid">
                  <span>Admissions</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.admissions_income_cents)}
                  </strong>
                  <span>Guest concessions</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.concession_income_cents)}
                  </strong>
                </div>
                <h3>Expense breakdown</h3>
                <div className="finance-grid">
                  <span>Construction</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.construction_expense_cents)}
                  </strong>
                  <span>Animal purchases</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.animal_purchase_expense_cents)}
                  </strong>
                  <span>Habitat care</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.habitat_care_expense_cents)}
                  </strong>
                  <span>Animal feed</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.animal_feed_expense_cents)}
                  </strong>
                  <span>Keeper hiring</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.keeper_hiring_expense_cents)}
                  </strong>
                  <span>Park upkeep</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.park_upkeep_expense_cents)}
                  </strong>
                  <span>Keeper wages</span>
                  <strong>
                    {money(snapshot.finance.current_day.breakdown.keeper_wages_expense_cents)}
                  </strong>
                </div>
                {snapshot.finance.previous_day !== null && (
                  <div className="guest-thought">
                    Day {snapshot.finance.previous_day.day} profit:{" "}
                    {money(snapshot.finance.previous_day.profit_cents)}
                  </div>
                )}
""",
    "manager finance panel",
)

app_path.write_text(app)
print("Finance ledger slice materialized")
