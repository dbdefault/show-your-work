# Changelog

## [Unreleased]

## [0.1.0] - 2026-10-09

First release.

- **A skill, `show-your-work`.** It tells the agent to back every "tests pass",
  "it builds" and "it works" with the command it ran after its last edit and
  the line of output that proves it, and to say what it did not check.
- **A Stop hook for Claude Code** that holds the final message up against the
  session log. It stops the agent once when a claim has nothing behind it:
  - no matching check after the last edit;
  - the last check failed, including a failure that a pipe, `|| true` or the
    project's own test script hid;
  - zero tests ran;
  - "all tests pass" came from a run of one file;
  - a cited command never ran.
- **`show-your-work audit`**, the same check over your past sessions, run
  locally.
- **Rules for agents that read AGENTS.md**, and plugin manifests for Codex,
  Cursor and Copilot CLI.

[Unreleased]: https://github.com/dheerajjha/show-your-work/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dheerajjha/show-your-work/releases/tag/v0.1.0
