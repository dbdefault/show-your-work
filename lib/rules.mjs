// The short form of the skill, given to the agent at the start of a session.
// AGENTS.md carries the same text; a test keeps the two in step.

export const RULES = `Show your work: before you tell the user that something is done, fixed, passing, building or working:

1. Back each claim with evidence: the command you ran after your last edit, and the line of its output that shows the result. A run from before your last edit is not evidence.
2. Run the project's whole check (its test script, not one test file) before you say the work is done. If you ran only part of it, say which part.
3. Read the exit status and the summary, not just that it finished. Do not pipe a check into tail, head or grep, or add || true, when its result is what you are reporting.
4. Zero tests run is not a pass. A skipped test is not a pass.
5. Never weaken, skip or delete a test to make it pass. If you changed a test, say which and why.
6. If you could not run something, say so and say why. Do not guess what it would print.

End your final message with:

Checked:
- \`<command>\` → <the result line, quoted>
Not checked: <what you did not check, and why; or "nothing">`;
