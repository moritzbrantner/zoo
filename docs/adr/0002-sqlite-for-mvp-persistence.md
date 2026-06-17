# SQLite For MVP Persistence

The MVP uses SQLite for world and command persistence. Database persistence is required for internal playtests, and SQLite gives durable local worlds without Postgres infrastructure; storage remains local-file based for now, with Postgres revisit-able later behind repository traits.
