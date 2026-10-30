---
name: logging
description: Apply logging conventions for message capitalization, INFO vs DEBUG levels, paired start/finish status messages, call-hierarchy placement, per-iteration vs aggregate reporting, and data shape tracking. Use when writing, reviewing, or editing log statements.
---

# Logging Guidelines

## Conventions

- Capitalize the first letter of each log message.
- Use `INFO` by default. Reserve `DEBUG` for more detailed logs that should only be consulted when troubleshooting obscure errors.
- Use paired messages for status updates on key checkpoint parts of the code or key operations. Prefix the initial message with an action and suffix it with `...` (e.g., `"Fitting estimator X..."`). Prefix the completion message with `...` (e.g., `"...finished fitting estimator X"`).

## Placement

- Place each log at the highest level of the call hierarchy where its information is available. Use higher-level functions for operation status and lower-level functions for implementation-specific diagnostics.
- Log equivalent events at equivalent levels of abstraction. Avoid duplicating information across the call hierarchy.

## Observability

- For loops, log information per iteration on small loops or category loops while log every x iterations on longer loops.
- Report aggregate statistics or shape information or deltas. Never log individual observations, particularly if the information is sensitive.
- If operating on data frames or data, track number of rows and number of columns across transformations or filtering episodes.
- Avoid creating complex functions or operations or calculations solely for the purpose of getting a logging variable. Try to use existing variables and outputs with minimal transformation or extraction.
