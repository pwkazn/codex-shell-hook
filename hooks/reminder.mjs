import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { readFile } from 'node:fs/promises';

const defaultConfigPath = fileURLToPath(new URL('../config/shell.json',
    import.meta.url));

function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shell config must be an object');
  if (typeof value.name !== 'string') throw new Error('The name of shell must be a string');
  if (typeof value.executable !== 'string' || value.executable.length === 0) throw new Error('Shell executable must be a non-empty string');
  if (!Array.isArray(value.args) || value.args.some((argument) => typeof argument !== 'string')) throw new Error('Shell args must be an array of strings');
  if (value.appendCommandArgument !== true) throw new Error('appendCommandArgument must be true');
  if (value.missingExecutable !== 'error') throw new Error('missingExecutable must be "error"');
  
  if(value.name.length === 0) value.name = value.executable.split(/[\\/]/).pop();

  return value;
}

async function loadConfig() {
  const path = process.env.CHSH_CONFIG || defaultConfigPath;
  const raw = await readFile(path, 'utf8');
  return validateConfig(JSON.parse(raw.replace(/^\uFEFF/, '')));
}



let raw = "";

process.stdin.setEncoding("utf8");

for await (const chunk of process.stdin) {
    raw += chunk;
}

try {
    const config = await loadConfig();
    const input = JSON.parse(raw);
    const event = input.hook_event_name ?? 'SessionStart';
    const outerShell = process.env.CHSH_OUTER_SHELL || (process.platform === 'win32' ? 'powershell' : 'bash');

    const message =
        `
        Important: [tool_call] Bash now runs through executable ${config.executable}.
        All commands that use this tool will be passed to ${config.name} as-is.
        Do not use syntax or commands from the outershell ${outerShell}.
        Any command provided by documants, skills or other sources must be converted to ${config.name} syntax before being passed to this tool.
        Directories must be converted to ${config.name} syntax before being passed to this tool.
        `;

    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: event,
            additionalContext: message
        }
    }));
} catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
}