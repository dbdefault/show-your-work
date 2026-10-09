# Installing show-your-work

show-your-work has two parts:

- **The rules**, a skill (`skills/show-your-work/SKILL.md`). Every agent below
  gets these.
- **The check**, a Stop hook that holds the agent's final message up against
  the session log and stops it once when a claim has nothing behind it. It
  runs in **Claude Code**. Codex, Cursor and Copilot CLI have the hook points
  it needs, and support for them is being built: until then they get the
  rules.

Everything runs on your machine. Nothing is sent anywhere.

## Claude Code: the rules and the check

In Claude Code, as two prompts:

```
/plugin marketplace add dheerajjha/show-your-work
/plugin install show-your-work@show-your-work
```

Or from a terminal:

```bash
claude plugin marketplace add dheerajjha/show-your-work
claude plugin install show-your-work@show-your-work
```

Start a new session. You should see a `SessionStart` hook run, and
`/show-your-work:audit` in the slash-command menu.

The check needs Node.js 18 or newer on your `PATH`.

## Codex CLI: the rules

```bash
codex plugin marketplace add dheerajjha/show-your-work
codex plugin add show-your-work@show-your-work
```

Then start a new thread. The skill is `$show-your-work:show-your-work`.

## Cursor: the rules

In Cursor, open **Customize**, choose **From GitHub Repository**, and enter
`dheerajjha/show-your-work`. With the Cursor CLI:

```bash
agent plugin marketplace add https://github.com/dheerajjha/show-your-work
```

then `/plugin` to install it.

## GitHub Copilot CLI: the rules

```bash
copilot plugin marketplace add dheerajjha/show-your-work
copilot plugin install show-your-work@show-your-work
```

## Everything else: OpenCode, Gemini CLI, Antigravity, Pi, and more

The [skills CLI](https://github.com/vercel-labs/skills) installs the skill
into whichever agents you have:

```bash
npx skills add dheerajjha/show-your-work
```

## Any agent that reads AGENTS.md

Copy the contents of [AGENTS.md](AGENTS.md) into your project's own AGENTS.md
(or CLAUDE.md, GEMINI.md, `.cursor/rules`). It is the short form of the skill:
six rules and the block to end on.

## Settings

| Environment variable | Effect |
|---|---|
| `SHOW_YOUR_WORK=warn` | Tell you about an unbacked claim, without stopping the agent |
| `SHOW_YOUR_WORK=off` | Turn it off: no check, no rules at session start |
| `SHOW_YOUR_WORK_CONTEXT=off` | Keep the check, but do not add the rules at session start |

## Uninstall

```bash
claude plugin uninstall show-your-work@show-your-work
claude plugin marketplace remove show-your-work
```

## For an agent doing the install

If a user asked you to install show-your-work:

1. Work out which agent you are running in.
2. Run that agent's terminal commands from the matching section above. Do not
   type slash commands; use the terminal form.
3. Confirm the install by listing plugins or skills (`claude plugin list`,
   `codex plugin list`, or the skills folder the CLI reports). Quote what the
   listing prints.
4. Tell the user to start a new session, which is when plugins load.
