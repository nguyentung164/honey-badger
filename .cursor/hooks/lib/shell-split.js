/**
 * Split a shell command string into segments on ; && ||
 * (quote-aware enough for hook policy checks).
 */
function splitShellSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < command.length; i++) {
    const c = command[i];

    if (quote) {
      current += c;
      if (c === quote && command[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }

    if (c === ';') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }

    if (c === '&' && command[i + 1] === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      i++;
      continue;
    }

    if (c === '|' && command[i + 1] === '|') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += c;
  }

  if (current.trim()) segments.push(current.trim());
  return segments.length > 0 ? segments : [command];
}

module.exports = { splitShellSegments };
