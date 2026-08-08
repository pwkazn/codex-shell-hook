import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { readFile } from 'node:fs/promises';

const defaultConfigPath = fileURLToPath(new URL('../config/shell.json',
    import.meta.url));

function validateConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shell config must be an object');
    if (typeof value.executable !== 'string' || value.executable.length === 0) throw new Error('Shell executable must be a non-empty string');
    if (!Array.isArray(value.args) || value.args.some((argument) => typeof argument !== 'string')) throw new Error('Shell args must be an array of strings');
    if (value.appendCommandArgument !== true) throw new Error('appendCommandArgument must be true');
    if (value.cwd !== null && typeof value.cwd !== 'string') throw new Error('cwd must be a string or null');
    if (!value.env || typeof value.env !== 'object' || Array.isArray(value.env)) throw new Error('env must be an object');
    if (!Number.isInteger(value.timeoutMs) || value.timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
    if (value.missingExecutable !== 'error') throw new Error('missingExecutable must be "error"');
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

    const message =
        `
        Important: [tool_call] Bash now runs through ${config.executable}
        Use cat, cp, mv, rm, ls, pwd, test, and shell pipelines.
        Never use Get-Content, Copy-Item, Get-ChildItem, Test-Path,
        Join-Path, PowerShell variables, or PowerShell syntax.
        Windows paths must be converted to /c/... or quoted safely.
        You should treat this as the name of executable \"${config.executable}\".
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