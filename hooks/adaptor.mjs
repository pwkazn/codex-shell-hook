import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';

const defaultConfigPath = fileURLToPath(new URL('../config/shell.json', import.meta.url));

function deny(reason) {
  stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function quoteBash(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function quotePowerShell(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function quotePowerShellNativeArg(value) {
  const escaped = value
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1');

  const nativeArg = '"' + escaped + '"';
  return "'" + nativeArg.replaceAll("'", "''") + "'";
}

function pathForOuterShell(value, outerShell) {
  if (outerShell !== 'bash' || !/^[A-Za-z]:[\\/]/.test(value)) return value;
  return '/' + value[0].toLowerCase() + value.slice(2).replaceAll('\\', '/');
}

function validateConfig(value) {

  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shell config must be an object');
  if (typeof value.name !== 'string' || value.name.length === 0) throw new Error('The name of shell must be a string');
  if (typeof value.executable !== 'string' || value.executable.length === 0) throw new Error('Shell executable must be a non-empty string');
  if (!Array.isArray(value.args) || value.args.some((argument) => typeof argument !== 'string')) throw new Error('Shell args must be an array of strings');
  if (value.appendCommandArgument !== true) throw new Error('appendCommandArgument must be true');
  if (value.missingExecutable !== 'error') throw new Error('missingExecutable must be "error"');
  
  return value;
}

async function loadConfig() {
  const path = process.env.CHSH_CONFIG || defaultConfigPath;
  const raw = await readFile(path, 'utf8');
  return validateConfig(JSON.parse(raw.replace(/^\uFEFF/, '')));
}

function formatExecutionCommand(config, command, outerShell) {
  const shell = pathForOuterShell(config.executable, outerShell);
  const args = config.args;
  if (outerShell === 'powershell') return '& ' + quotePowerShell(shell) + ' ' + [...args, command].map(quotePowerShellNativeArg).join(' ');
  if (outerShell === 'bash') return [shell, ...args, command].map(quoteBash).join(' ');
  throw new Error('Unsupported outer shell: ' + outerShell);
}

let input = '';
for await (const chunk of stdin) input += chunk;

let event;
try {
  event = JSON.parse(input);
} catch {
  deny('Hook input is not valid JSON.');
  process.exit(0);
}
if (event?.tool_name !== 'Bash') {
  stdout.write('{}');
  process.exit(0);
}

if (!event.tool_input || typeof event.tool_input !== 'object' || typeof event.tool_input.command !== 'string' || event.tool_input.command.length === 0) {
  deny('Bash tool input must contain a non-empty command string.');
  process.exit(0);
}

if (event.permissionDecision === 'deny') {
  stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: event.permissionDecisionReason || 'No reason provided.',
    },
  }));
  process.exit(0);
}

try {
  const config = await loadConfig();
  const outerShell = process.env.CHSH_OUTER_SHELL || (process.platform === 'win32' ? 'powershell' : 'bash');
  const updatedInput = { ...event.tool_input, command: formatExecutionCommand(config, event.tool_input.command, outerShell) };
  stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput,
    },
  }));

} catch (error) {
  deny('Shell config error: ' + (error instanceof Error ? error.message : String(error)));
}

