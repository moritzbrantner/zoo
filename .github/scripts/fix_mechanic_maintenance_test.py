from pathlib import Path

path = Path("crates/zoo-core/src/lib.rs")
text = path.read_text()

start = text.index("    fn mechanic_hiring_wages_and_repairs_are_categorized()")
end = text.index("    #[test]", start + 1)
block = text[start:end]

cash = block.index("state.cash_cents")
assert_start = block.rfind("assert_eq!(", 0, cash)
if assert_start < 0:
    raise SystemExit("mechanic cash assertion start not found")

open_paren = block.index("(", assert_start)
depth = 0
assert_end = None
for index in range(open_paren, len(block)):
    char = block[index]
    if char == "(":
        depth += 1
    elif char == ")":
        depth -= 1
        if depth == 0:
            semicolon = block.find(";", index)
            if semicolon < 0:
                raise SystemExit("mechanic cash assertion terminator not found")
            assert_end = semicolon + 1
            break
if assert_end is None:
    raise SystemExit("mechanic cash assertion end not found")

replacement = """assert_eq!(
            state.cash_cents,
            before
                - MECHANIC_HIRE_COST
                - MECHANIC_HOURLY_WAGE
                - state.finance_today.park_upkeep_expense_cents
        );"""
updated = block[:assert_start] + replacement + block[assert_end:]
path.write_text(text[:start] + updated + text[end:])
