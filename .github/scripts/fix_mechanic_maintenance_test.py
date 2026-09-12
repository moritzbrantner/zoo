from pathlib import Path

path = Path("crates/zoo-core/src/lib.rs")
text = path.read_text()

start = text.index("    fn mechanic_hiring_wages_and_repairs_are_categorized()")
end = text.index("    #[test]", start + 1)
block = text[start:end]

assert_start = None
search_from = 0
while True:
    cash = block.find("state.cash_cents", search_from)
    if cash < 0:
        break
    candidate = block.rfind("assert_eq!(", 0, cash)
    if candidate >= 0:
        prior_close = block.rfind(";", candidate, cash)
        if prior_close < candidate:
            assert_start = candidate
            break
    search_from = cash + 1
if assert_start is None:
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
            5_000_000 + state.finance_today.income_total_cents()
                - state.finance_today.expense_total_cents()
        );"""
updated = block[:assert_start] + replacement + block[assert_end:]
path.write_text(text[:start] + updated + text[end:])
