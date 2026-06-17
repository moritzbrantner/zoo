# Zoo

Zoo is a free-build management game context for operating and expanding a conservation park. The language focuses on player-facing tycoon systems rather than implementation structure.

## Language

**Sandbox Zoo**:
A free-build zoo run where the player expands from a starter operation and responds to economic and operational feedback without a fixed scenario ending.
_Avoid_: Scenario, mission, campaign level

**Starter Plot**:
The initial playable zoo state containing the minimum infrastructure needed to start building immediately.
_Avoid_: Empty lot, tutorial zoo

**Soft Milestone**:
A visible progress target that guides play without ending or failing the run.
_Avoid_: Win condition, quest

**Cashflow**:
The zoo's short-term money trajectory from guest revenue minus visible operating expenses.
_Avoid_: Profit if the value is not net of expenses

**Guest Demand**:
The current market response to appeal, price, services, and capacity.
_Avoid_: Visitors when referring to the demand calculation rather than actual visitor count
