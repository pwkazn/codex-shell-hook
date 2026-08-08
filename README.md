# Codex Shell Hook

`Codex Shell Hook` is a Codex plugin that routes `Bash` tool calls (shell command execution tool calls) through a configured shell. It changes the command submitted to the existing Bash tool without adding a separate executor layer or virtual machine, requires only Node.js support.

The disadvantage is that `PreToolUse` hooks would actually break Codex approving sequences and approve any command if they were rewritten. 

Therefore, this plugin currently does not support command approval check. **It is not recommended to use this plugin if you have any safety concern.**

The default config is Git Bash on Windows (you don't really need this in macOS/Linux do you?):

```text
C:\Program Files\Git\bin\bash -lc <command>
```

## How it works

The plugin registers two hooks in [`hooks/hooks.json`](hooks/hooks.json):

- `SessionStart` runs [`hooks/reminder.mjs`](hooks/reminder.mjs) on startup and
  after compaction. It adds the configured executable to the agent context and
  reminds the agent what shell they are using.
- `PreToolUse` matches the `Bash` tool and runs
  [`hooks/adaptor.mjs`](hooks/adaptor.mjs). The adaptor validates the hook
  input, loads the shell configuration, quotes the target command for the
  outer shell, and returns an `updatedInput` response.

## Requirements

- Codex with plugin and hook support
- Node.js available as `node` on the host running the hooks
- The configured shell executable installed and callable by the host

There are no npm dependencies or build steps.

## Configuration

The default configuration is [`config/shell.json`](config/shell.json):

```json
{
  "executable": "C:\\Program Files\\Git\\bin\\bash",
  "args": ["-lc"],
  "appendCommandArgument": true,
  "missingExecutable": "error"
}
```

Configuration rules:

- `executable` must be a non-empty string.
- `args` must be an array of strings. The original Bash command is appended
  after these arguments.
- `appendCommandArgument` must be `true`.
- `missingExecutable` must be `"error"`.

The adaptor currently uses `executable` and `args` to construct the rewritten
command. The remaining fields are validated for configuration compatibility;
they are not independently applied because execution remains in the Bash
tool.


## Installation

Install or enable this directory as a Codex plugin using your Codex plugin
workflow. The plugin manifest is at
[`.codex-plugin/plugin.json`](.codex-plugin/plugin.json), and the hook
registration is at [`hooks/hooks.json`](hooks/hooks.json).

After installation:

1. Confirm that `config/shell.json` points to the shell you want to use.
2. Ensure `node` and the configured executable are available to Codex.
3. Start a new Codex session. The session-start reminder should display the
   configured executable.

## Repository layout

```text
.
├── .codex-plugin/plugin.json  # Plugin metadata
├── config/shell.json          # Default shell configuration
└── hooks/
    ├── hooks.json             # Codex hook registration
    ├── adaptor.mjs            # Bash command rewrite hook
    └── reminder.mjs           # Session-start context hook
```
