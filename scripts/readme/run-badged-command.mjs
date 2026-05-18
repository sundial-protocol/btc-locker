#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import process from 'node:process';
import { updateReadmeBadge } from './refresh-badges.mjs';

const IS_WINDOWS = process.platform === 'win32';

function parseArgs(argv) {
  const [badgeName, ...commandParts] = argv;
  const command = commandParts.join(' ').trim();

  if (!badgeName || command.length === 0) {
    throw new Error(
      'Usage: node scripts/readme/run-badged-command.mjs <badge-name> <command>',
    );
  }

  return { badgeName, command };
}

function exitCodeFromSignal(signal) {
  const signalCode = osConstants.signals[signal];
  return typeof signalCode === 'number' ? 128 + signalCode : 1;
}

function runShellCommand(command) {
  return new Promise((resolve) => {
    const [shell, shellFlag] = IS_WINDOWS
      ? ['cmd.exe', '/c']
      : [process.env.SHELL ?? 'bash', '-c'];
    const child = spawn(shell, [shellFlag, command], {
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      resolve(1);
    });

    child.once('exit', (code, signal) => {
      if (signal) {
        resolve(exitCodeFromSignal(signal));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

async function main() {
  const { badgeName, command } = parseArgs(process.argv.slice(2));
  const commandStatus = await runShellCommand(command);

  let badgeStatus = 0;
  try {
    updateReadmeBadge(badgeName, commandStatus);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    badgeStatus = 1;
  }

  process.exit(commandStatus !== 0 ? commandStatus : badgeStatus);
}

await main();
