# Codex Shell Hook

[![State-of-the-art Shitcode](https://img.shields.io/static/v1?label=State-of-the-art&message=Shitcode&color=7B5804)](https://github.com/trekhleb/state-of-the-art-shitcode)

`Codex Shell Hook` is a Codex plugin that routes `Bash` tool calls (shell command execution tool calls) through a configured shell. It changes the command submitted to the existing Bash tool without adding a separate executor layer or virtual machine, requires only Node.js support.

The readablity of the commands will be terrible.

The default config is Git Bash on Windows (you don't really need this in macOS/Linux do you?):

```powershell
& 'C:\Program Files\Git\bin\bash' -lc <command>
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
  "name": "Git Bash",
  "executable": "C:\\Program Files\\Git\\bin\\bash",
  "args": ["-lc"],
  "appendCommandArgument": true,
  "missingExecutable": "error"
}
```

Configuration rules:

- `name` must be a non-empty string.
- `executable` must be a non-empty string.
- `args` must be an array of strings. The original Bash command is appended
  after these arguments.
- `appendCommandArgument` must be `true`.
- `missingExecutable` must be `"error"`.

The adaptor currently uses `executable` and `args` to construct the rewritten
command. The remaining fields are validated for configuration compatibility;
they are not independently applied because execution remains in the Bash
tool.

The reminder will construct a notification for your agent to use the new shell using `name` and `executable` params.

## Installation

A: Just tell Codex to install.

B: 
1. Run following commands at repo's directory to add a local marketplace.

```shell
codex plugin marketplace add https://github.com/pwkazn/codex-shell-hook
```

2. Install this plugin from Codex CLI or APP.

After installation:

1. Confirm that `config/shell.json` points to the shell you want to use.
2. Ensure `node` and the configured executable are available to Codex.

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
