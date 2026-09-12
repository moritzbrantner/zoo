from pathlib import Path
import re

path = Path("crates/zoo-core/src/lib.rs")
text = path.read_text()

start = text.index("    fn mechanic_hiring_wages_and_repairs_are_categorized()")
end = text.index("    #[test]", start + 1)
block = text[start:end]
pattern = re.compile(
    r"before\s*-\s*MECHANIC_HIRE_COST\s*-\s*MECHANIC_HOURLY_WAGE(?=\s*[,\n])"
)
updated, count = pattern.subn(
    "before - MECHANIC_HIRE_COST - MECHANIC_HOURLY_WAGE\n                - state.finance_today.park_upkeep_expense_cents",
    block,
    count=1,
)
if count != 1:
    raise SystemExit(f"expected one mechanic cash assertion anchor, found {count}")

path.write_text(text[:start] + updated + text[end:])
