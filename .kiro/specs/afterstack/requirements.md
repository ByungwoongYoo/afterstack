# AfterStack requirements prepared for a real Kiro development session

Status: prepared by Codex. Kiro has not yet implemented or tested these requirements.

1. A creator can edit a small, non-scriptable card stack and play it locally.
2. The runtime follows links and explicit boolean flag transitions; no imported text executes as code.
3. Every choice is keyboard operable. Optional auto-scan plus Space activation supports a one-switch interaction pattern.
4. Undo restores both the card and flag state. Save/load refuses a different stack or unknown flags.
5. A validator rejects broken links, duplicate ids and undeclared flags. A state explorer must find a reachable ending for built-in examples.
6. Original lighthouse and boolean-circuit examples demonstrate the same runtime with different state graphs.
7. Keep content and runtime offline-capable; do not add accounts, analytics, cloud storage or paid services.
8. Actual Kiro changes, tests, commands and observed outcomes must be recorded only after they occur. Do not invent tool usage or hook executions.
