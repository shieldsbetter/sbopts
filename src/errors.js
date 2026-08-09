// Error types.
//
// Two failure modes are distinguished on purpose:
//
//   - DefinitionError  — the *developer* described the CLI wrong (a duplicate
//     short flag, an unknown type, a bad name). Thrown while building the
//     command tree; it is a programming bug, never something an end user can
//     trigger.
//
//   - UsageError       — the *end user* typed something the CLI doesn't accept
//     (unknown flag, missing value, failed coercion, unknown subcommand).
//     run() catches these, prints the message plus a usage hint, and exits
//     non-zero; parse() rethrows them for callers that drive their own flow.
//
// Keeping them separate means a try/catch around parse() can react to bad user
// input without swallowing genuine bugs in the command definition.

/** A mistake in how the CLI itself was declared (a developer bug). */
export class DefinitionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DefinitionError';
    }
}

/**
 * Invalid input from the person running the CLI. Carries the command that was
 * in scope when parsing failed, so callers (and run()) can print the right
 * usage hint.
 */
export class UsageError extends Error {
    constructor(message, { command } = {}) {
        super(message);
        this.name = 'UsageError';
        /** @type {import('./command.js').Command|undefined} */
        this.command = command;
    }
}
