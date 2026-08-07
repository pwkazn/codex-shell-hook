import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';

const scriptPath = fileURLToPath(import.meta.url);
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

function quotePowerShell(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function quoteBash(value) {
  return "'" + value.replaceAll("'", "'\\\"'\\\"'") + "'";
}

function pathForOuterShell(value, outerShell) {
  if (outerShell !== 'bash' || !/^[A-Za-z]:[\\/]/.test(value)) return value;
  return '/' + value[0].toLowerCase() + value.slice(2).replaceAll('\\', '/');
}

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
  return validateConfig(JSON.parse(raw.replace(/^\\uFEFF/, '')));
}

function formatExecutionCommand(encodedCommand, outerShell) {
  const executable = outerShell === 'bash' ? 'node' : process.execPath;
  const script = pathForOuterShell(scriptPath, outerShell);
  const values = [executable, script, '--execute', encodedCommand];
  if (outerShell === 'powershell') return '& ' + values.map(quotePowerShell).join(' ');
  if (outerShell === 'bash') return values.map(quoteBash).join(' ');
  throw new Error('Unsupported outer shell: ' + outerShell);
}

async function executeCommand(encodedCommand) {
  const command = Buffer.from(encodedCommand, 'base64').toString('utf8');
  const config = await loadConfig();
  const child = spawn(config.executable, [...config.args, command], {
    cwd: config.cwd ?? process.cwd(),
    env: { ...process.env, ...config.env },
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, config.timeoutMs);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  }).then((code) => {
    clearTimeout(timer);
    if (timedOut) process.exitCode = 124;
    else process.exitCode = typeof code === 'number' ? code : 1;
  }).catch((error) => {
    clearTimeout(timer);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 127;
  });
}

if (process.argv[2] === '--execute') {
  await executeCommand(process.argv[3] || '');
} else {
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

  if (event.tool_input.command.includes('rewrite-bash.mjs') && event.tool_input.command.includes('--execute')) {
    stdout.write('{}');
    process.exit(0);
  }

  try {
    const config = await loadConfig();
    void config;
    const outerShell = process.env.CHSH_OUTER_SHELL || (process.platform === 'win32' ? 'powershell' : 'bash');
    const encodedCommand = Buffer.from(event.tool_input.command, 'utf8').toString('base64');
    const updatedInput = { ...event.tool_input, command: formatExecutionCommand(encodedCommand, outerShell) };
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
}
