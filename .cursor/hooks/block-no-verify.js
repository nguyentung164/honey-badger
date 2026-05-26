#!/usr/bin/env node
/**
 * Block git --no-verify (and commit -n) so agents cannot skip hooks.
 * Replaces npx block-no-verify@1.1.2 to avoid npm noise on every shell command.
 */
const { readStdin } = require('./adapter');

const MONITORED = /\bgit\s+(commit|push|merge|cherry-pick|rebase|am)\b/;

/** commit/am/rebase/cherry-pick: -n means --no-verify */
const NO_VERIFY_SHORTHAND = /\bgit\s+(commit|am|rebase|cherry-pick)\b/;

function hasNoVerifyFlag(command) {
  // Word boundaries do not work before "--" (hyphen is non-word).
  if (/(?:^|\s)--no-verify(?:\s|$)/.test(command) || /(?:^|\s)-noverify(?:\s|$)/.test(command)) {
    return true;
  }

  if (NO_VERIFY_SHORTHAND.test(command) && /(?:^|\s)-n(?:\s|$)/.test(command)) {
    return true;
  }

  return false;
}

readStdin()
  .then(raw => {
    let cmd = '';
    try {
      const input = JSON.parse(raw || '{}');
      cmd = String(input.command || input.args?.command || '');
    } catch {
      process.exit(0);
    }

    if (!MONITORED.test(cmd) || !hasNoVerifyFlag(cmd)) {
      process.stdout.write(raw || '');
      process.exit(0);
    }

    const message =
      '[hooks] Blocked: git --no-verify bypasses pre-commit/pre-push hooks. Run the command without --no-verify.';
    console.error(message);
    process.stdout.write(
      JSON.stringify({
        permission: 'deny',
        user_message: message,
        agent_message: message,
      })
    );
    process.exit(2);
  })
  .catch(() => process.exit(0));
