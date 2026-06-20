# Zoo

Zoo is a free-build management game context for operating and expanding a conservation park. The language focuses on player-facing tycoon systems rather than implementation structure.

## Language

**Sandbox Zoo**:
A free-build zoo run where the player expands from a starter operation and responds to economic and operational feedback without a fixed scenario ending.
_Avoid_: Scenario, mission, campaign level

**Starter Plot**:
The initial playable zoo state containing the minimum infrastructure needed to start building immediately.
_Avoid_: Empty lot, tutorial zoo

**Buildable Plot**:
The currently available subset of the zoo map where the player may construct buildings. The starter implementation uses the visible starter plot.
_Avoid_: Land if referring to construction permission rather than terrain

**Building Footprint**:
The set of grid tiles occupied by a building relative to its anchor tile and orientation. Usually rectangular, but may be an arbitrary tile mask such as an L-shape.
_Avoid_: Mesh size, visual bounds

**Placement Preview**:
The transparent building ghost shown before committing construction. It is valid only when the same placement would be accepted by the Rust rules.
_Avoid_: Client-only placement, cosmetic ghost

**Soft Milestone**:
A visible progress target that guides play without ending or failing the run.
_Avoid_: Win condition, quest

**Cashflow**:
The zoo's short-term money trajectory from guest revenue minus visible operating expenses.
_Avoid_: Profit if the value is not net of expenses

**Guest Demand**:
The current market response to appeal, price, services, and capacity.
_Avoid_: Visitors when referring to the demand calculation rather than actual visitor count
