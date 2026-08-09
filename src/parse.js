// The parser: turn an argv array into a resolved command plus its flags,
// positionals, and pass-through `rest`.
//
// House rules (the opinions this library exists to enforce):
//
//   --long              long flags are always introduced with two dashes
//   -s                  short flags are always a single dash + one letter
//   --foo bar  -o bar   a value flag takes the following token...
//   --foo=bar  -o=bar   ...or an inline value via '='
//   -abc                booleans stack into one cluster (== -a -b -c)
//   --no-foo            negate a (negatable) boolean
//   --foo a --foo b     repeats accumulate into an array
//   --                  ends parsing; everything after is raw `rest`
//   -                   a lone dash is an ordinary positional (stdin idiom)
//
// Subcommands are the norm: when the command in scope has children, the next
// bare word must name one of them, and we descend. A parent's flags stay in
// scope for its children, so `app -C dir build` and `app build -C dir` are the
// same — parent flags are simply "deferred" until after the subcommand.

import { UsageError } from './errors.js';

/**
 * @typedef {object} ParseResult
 * @property {import('./command.js').Command} command  Deepest command reached — the one to run, or to show help for.
 * @property {string[]} path  Command names from the root down to `command`.
 * @property {Record<string, *>} flags  Resolved flag values (defaults filled in; repeats as arrays).
 * @property {string[]} positionals  Bare arguments for a leaf command.
 * @property {string[]} rest  Everything after `--`, passed through verbatim.
 * @property {boolean} terminated  Whether a `--` was seen.
 * @property {boolean} help  Whether help was requested (`--help`/`-h`).
 */

/**
 * Parse `argv` against `root`.
 * @param {import('./command.js').Command} root
 * @param {string[]} argv
 * @returns {ParseResult}
 */
export function parse(root, argv) {
    let cmd = root;
    const positionals = [];
    // seen: long name -> { flag, values: [...] }, preserving repeat order.
    const seen = new Map();
    let rest = [];
    let terminated = false;
    let help = false;
    let helpCommand = root;

    const fail = (message) => {
        throw new UsageError(message, { command: cmd });
    };

    // Record one occurrence of a flag. The help flag short-circuits parsing:
    // we stop the moment it appears and report help for the command in scope.
    let stop = false;
    const assign = (flag, value) => {
        if (flag.isHelp) {
            help = true;
            helpCommand = cmd;
            stop = true;
            return;
        }
        let entry = seen.get(flag.long);
        if (!entry) {
            entry = { flag, values: [] };
            seen.set(flag.long, entry);
        }
        entry.values.push(value);
    };

    // Coerce + assign a value token to a value-taking flag, wrapping any
    // coercion error with positional context.
    const assignValue = (flag, raw) => {
        try {
            assign(flag, flag.coerce(raw));
        } catch (e) {
            fail(e.message);
        }
    };

    for (let i = 0; i < argv.length; i++) {
        const tok = argv[i];

        // End of options: hand the remainder to the command verbatim.
        if (tok === '--') {
            rest = argv.slice(i + 1);
            terminated = true;
            break;
        }

        // A lone '-' is a positional, not a flag (the stdin convention).
        if (tok.startsWith('--')) {
            i += handleLong(tok, i);
        } else if (tok.startsWith('-') && tok.length > 1) {
            i += handleShort(tok, i);
        } else {
            // A bare word: a subcommand to descend into, or a positional.
            if (cmd.subcommands.size > 0) {
                const sub = cmd.subcommands.get(tok);
                if (!sub) {
                    fail(
                        `Unknown command '${tok}'. ` +
                            `Run with --help to see the available commands.`,
                    );
                }
                cmd = sub;
            } else {
                positionals.push(tok);
            }
        }

        if (stop) break;
    }

    // Help was requested: don't enforce required flags or fill defaults — the
    // user just wants the usage text for whatever command was in scope.
    if (help) {
        return {
            command: helpCommand,
            path: helpCommand.path(),
            flags: {},
            positionals,
            rest,
            terminated,
            help: true,
        };
    }

    return {
        command: cmd,
        path: cmd.path(),
        flags: finalize(cmd, seen, fail),
        positionals,
        rest,
        terminated,
        help: false,
    };

    // --- handlers (closures over cmd/argv/state) -------------------------

    /**
     * Handle a `--long` token. Returns the number of EXTRA argv entries
     * consumed (1 when a value was read from the following token, else 0).
     */
    function handleLong(tok, i) {
        const body = tok.slice(2);
        const eq = body.indexOf('=');
        const name = eq === -1 ? body : body.slice(0, eq);
        const inline = eq === -1 ? null : body.slice(eq + 1);

        const flag = cmd.lookupLong(name);
        if (flag) {
            if (flag.takesValue) {
                if (inline !== null) {
                    assignValue(flag, inline);
                    return 0;
                }
                const next = argv[i + 1];
                if (next === undefined) {
                    fail(`--${name} expects a value.`);
                }
                assignValue(flag, next);
                return 1;
            }
            // Boolean.
            if (inline !== null && !flag.isHelp) {
                assignValue(flag, inline);
            } else {
                assign(flag, true);
            }
            return 0;
        }

        // No literal flag by that name: maybe it's `--no-<boolean>`.
        if (name.startsWith('no-')) {
            const base = cmd.lookupLong(name.slice(3));
            if (base && base.type === 'boolean' && base.negatable) {
                if (inline !== null) {
                    fail(`--${name} takes no value.`);
                }
                assign(base, false);
                return 0;
            }
        }

        fail(`Unknown option '--${name}'.`);
    }

    /**
     * Handle a `-s` / `-abc` / `-s=VALUE` token. Returns the number of EXTRA
     * argv entries consumed.
     *
     * There is no attached-value shorthand: a value-taking short flag always
     * stands on its own (`-o bar` or `-o=bar`). A multi-character token is
     * therefore a pure boolean stack — `-abc` is exactly `-a -b -c` — and a
     * value flag may never appear inside one.
     */
    function handleShort(tok, i) {
        const body = tok.slice(1);

        // The explicit `=` form is a single short flag whose '=' sits right
        // after the letter: `-o=val`, `-v=true`.
        if (body[1] === '=') {
            const flag = lookupShortOrFail(body[0]);
            const value = body.slice(2);
            if (flag.isHelp) {
                assign(flag, true);
            } else {
                assignValue(flag, value);
            }
            return 0;
        }

        // A lone short flag: `-v` (boolean) or `-o value` (value from the next
        // argv entry).
        if (body.length === 1) {
            const flag = lookupShortOrFail(body[0]);
            if (flag.takesValue) {
                const next = argv[i + 1];
                if (next === undefined) {
                    fail(`-${flag.short} expects a value.`);
                }
                assignValue(flag, next);
                return 1;
            }
            assign(flag, true);
            return 0;
        }

        // A cluster: every flag must be boolean. A value-taking flag can't be
        // stacked, so it's an error to find one here.
        for (let k = 0; k < body.length; k++) {
            const flag = lookupShortOrFail(body[k]);
            if (flag.takesValue) {
                fail(
                    `-${flag.short} takes a value, so it can't be stacked in ` +
                        `'${tok}'. Pass it on its own: -${flag.short} <value>.`,
                );
            }
            assign(flag, true);
            if (stop) return 0; // help flag inside the cluster
        }
        return 0;
    }

    function lookupShortOrFail(ch) {
        const flag = cmd.lookupShort(ch);
        if (!flag) {
            fail(`Unknown option '-${ch}'.`);
        }
        return flag;
    }
}

/**
 * Resolve collected occurrences into final flag values: fill defaults, enforce
 * `required`, turn array flags (and repeated scalars) into arrays.
 */
function finalize(cmd, seen, fail) {
    const flags = {};
    for (const flag of cmd.effectiveFlags()) {
        if (flag.isHelp) continue;
        const entry = seen.get(flag.long);
        if (!entry) {
            if (flag.required) {
                fail(`Missing required option '--${flag.long}'.`);
            }
            flags[flag.long] = flag.defaultValue();
            continue;
        }
        if (flag.array) {
            flags[flag.long] = entry.values;
        } else if (flag.type !== 'boolean' && entry.values.length > 1) {
            // A scalar supplied more than once is parsed as an array — the
            // "repeated parameters become array values" opinion.
            flags[flag.long] = entry.values;
        } else {
            flags[flag.long] = entry.values[entry.values.length - 1];
        }
    }
    return flags;
}
