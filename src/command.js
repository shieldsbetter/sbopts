// The command tree: a node owns a name, some flags, an optional handler, and
// any number of child commands. Flags declared on a parent are visible to every
// descendant (inheritance), which is what lets the parser accept them before or
// after a subcommand name.

import { DefinitionError, UsageError } from './errors.js';
import { Flag, normalizeFlags } from './flags.js';
import { renderHelp } from './help.js';
import { parse } from './parse.js';
import { isNil } from './util.js';

/** The implicit `--help` / `-h` flag every command carries. */
function makeHelpFlag() {
    const flag = new Flag('help', {
        short: 'h',
        type: 'boolean',
        summary: 'Show this help and exit.',
    });
    flag.isHelp = true;
    return flag;
}

/**
 * @typedef {object} ArgSpec
 * @property {string} name        Display name for the usage line (e.g. 'file').
 * @property {boolean} [required] Shown as <name> when true, [name] when false.
 * @property {boolean} [variadic] Shown as <name...>; collects the rest.
 * @property {string} [summary]   One-line description for the help body.
 */

/**
 * @typedef {object} CommandSpec
 * @property {string} [summary]   One-line description (parent's command list + help header).
 * @property {string} [description]  Longer help body text. Falls back to `summary`.
 * @property {Record<string, import('./flags.js').FlagSpec>} [flags]
 * @property {Record<string, CommandSpec>} [commands]  Subcommands, keyed by name.
 * @property {ArgSpec[]} [args]   Positional arguments, for the usage line only.
 * @property {(ctx: RunContext) => *} [run]  Handler invoked by Command#run().
 */

/**
 * @typedef {object} RunContext
 * @property {Record<string, *>} flags
 * @property {string[]} positionals
 * @property {string[]} rest
 * @property {string[]} path
 * @property {Command} command
 */

export class Command {
    /**
     * @param {string} name
     * @param {CommandSpec} spec
     * @param {Command|null} parent
     */
    constructor(name, spec = {}, parent = null) {
        if (typeof name !== 'string' || name.length === 0) {
            throw new DefinitionError('A command needs a non-empty name.');
        }
        this.name = name;
        this.parent = parent;
        this.summary = spec.summary ?? '';
        this.description = spec.description ?? spec.summary ?? '';
        this.args = spec.args ?? [];
        this.handler = spec.run;

        this.ownFlags = normalizeFlags(spec.flags);
        this._checkInheritedFlagCollisions();

        this.subcommands = new Map();
        for (const [subName, subSpec] of Object.entries(spec.commands ?? {})) {
            this.subcommands.set(
                subName,
                new Command(subName, subSpec ?? {}, this),
            );
        }

        // Memoization for the effective-flag views, computed on first use.
        this._effective = null;
        this._longMap = null;
        this._shortMap = null;
    }

    /** Reject a child flag whose name/short collides with an inherited one. */
    _checkInheritedFlagCollisions() {
        if (!this.parent) return;
        const longs = new Map();
        const shorts = new Map();
        for (const f of this.parent.effectiveFlags()) {
            // The implicit help is synthesized, not declared, so taking its
            // spelling is an override rather than a collision -- and it has to
            // be available at every level, not just the root. effectiveFlags()
            // then sees the caller's `help`/`-h` in the chain and stops adding
            // the implicit one for this command and its descendants.
            //
            // A help flag the DEVELOPER declared is an ordinary flag with no
            // isHelp, so redeclaring that one still collides, as it should.
            if (f.isHelp) continue;
            longs.set(f.long, f);
            if (!isNil(f.short)) shorts.set(f.short, f);
        }
        for (const f of this.ownFlags) {
            if (longs.has(f.long)) {
                throw new DefinitionError(
                    `Command '${this.name}' redefines inherited flag ` +
                        `'--${f.long}'.`,
                );
            }
            if (!isNil(f.short) && shorts.has(f.short)) {
                throw new DefinitionError(
                    `Command '${this.name}' reuses short '-${f.short}', ` +
                        `already taken by inherited '--${shorts.get(f.short).long}'.`,
                );
            }
        }
    }

    /**
     * This command's flags plus every inherited one, with the implicit
     * `--help` appended unless the developer has taken `help` or `-h`
     * somewhere in the chain.
     *
     * The Map keyed by long name deduplicates rather than shadows: a child
     * redeclaring an inherited flag is rejected outright by
     * `_checkInheritedFlagCollisions()`, so there is never a second entry to
     * overwrite the first.
     *
     * Memoized. Flags pushed onto `ownFlags` after the first call are not seen.
     * @returns {Flag[]}
     */
    effectiveFlags() {
        if (this._effective) return this._effective;
        const byLong = new Map();
        const chain = [];
        for (let c = this; c; c = c.parent) chain.unshift(c);
        for (const c of chain) {
            for (const f of c.ownFlags) byLong.set(f.long, f);
        }
        const flags = [...byLong.values()];
        const usesHelp =
            byLong.has('help') || flags.some((f) => f.short === 'h');
        if (!usesHelp) flags.push(makeHelpFlag());
        this._effective = flags;
        return flags;
    }

    /** Own flags excluding any implicit help (for the "Options" help section). */
    ownVisibleFlags() {
        return this.ownFlags;
    }

    /** Inherited flags only (for the "Global options" help section). */
    inheritedFlags() {
        const own = new Set(this.ownFlags.map((f) => f.long));
        return this.effectiveFlags().filter(
            (f) => !own.has(f.long) && !f.isHelp,
        );
    }

    /** The implicit help flag in this command's scope (if any). */
    helpFlag() {
        return this.effectiveFlags().find((f) => f.isHelp) ?? null;
    }

    _longLookup() {
        if (!this._longMap) {
            this._longMap = new Map(
                this.effectiveFlags().map((f) => [f.long, f]),
            );
        }
        return this._longMap;
    }

    _shortLookup() {
        if (!this._shortMap) {
            this._shortMap = new Map();
            for (const f of this.effectiveFlags()) {
                if (!isNil(f.short)) this._shortMap.set(f.short, f);
            }
        }
        return this._shortMap;
    }

    /** Resolve a `--long` name to a Flag in scope, or undefined. */
    lookupLong(name) {
        return this._longLookup().get(name);
    }

    /** Resolve a `-s` letter to a Flag in scope, or undefined. */
    lookupShort(ch) {
        return this._shortLookup().get(ch);
    }

    /** Names from the root down to this command, e.g. ['app', 'remote', 'add']. */
    path() {
        const out = [];
        for (let c = this; c; c = c.parent) out.unshift(c.name);
        return out;
    }

    /**
     * Parse argv against this command (usually the root). Pure: returns a
     * {@link ParseResult} and throws {@link UsageError} on bad input.
     * @param {string[]} [argv=process.argv.slice(2)]
     * @returns {import('./parse.js').ParseResult}
     */
    parse(argv = process.argv.slice(2)) {
        return parse(this, argv);
    }

    /** The typeset help text for this command. @returns {string} */
    help(options = {}) {
        return renderHelp(this, options);
    }

    /**
     * Parse argv and dispatch to the resolved command's handler. Prints help on
     * `--help`, prints usage errors to stderr, and exits the process via the
     * injectable `io` hooks (overridable in tests).
     *
     * Returns whatever the handler returns (awaited), or undefined when help or
     * an error short-circuited the run.
     *
     * @param {string[]} [argv=process.argv.slice(2)]
     * @param {object} [io]
     * @param {(s: string) => void} [io.stdout=process.stdout.write]
     * @param {(s: string) => void} [io.stderr=process.stderr.write]
     * @param {(code: number) => void} [io.exit=process.exit]
     * @param {number|"auto"} [io.width]  Help width (defaults to terminal width).
     */
    async run(argv = process.argv.slice(2), io = {}) {
        const out = io.stdout ?? ((s) => process.stdout.write(s));
        const err = io.stderr ?? ((s) => process.stderr.write(s));
        const exit = io.exit ?? ((code) => process.exit(code));

        let result;
        try {
            result = this.parse(argv);
        } catch (e) {
            if (e instanceof UsageError) {
                const cmd = e.command ?? this;
                err(`${cmd.path().join(' ')}: ${e.message}\n`);
                err(`Try '${cmd.path().join(' ')} --help' for more.\n`);
                exit(1);
                return undefined;
            }
            throw e;
        }

        if (result.help) {
            out(renderHelp(result.command, { width: io.width }) + '\n');
            exit(0);
            return undefined;
        }

        const cmd = result.command;
        if (typeof cmd.handler !== 'function') {
            // A group command with no handler: show its help and signal misuse.
            err(`${cmd.path().join(' ')}: no command given.\n\n`);
            err(renderHelp(cmd, { width: io.width }) + '\n');
            exit(1);
            return undefined;
        }

        return cmd.handler({
            flags: result.flags,
            positionals: result.positionals,
            rest: result.rest,
            path: result.path,
            command: cmd,
        });
    }
}

/**
 * Define a command (typically the root of a CLI).
 *
 * @param {string} name
 * @param {CommandSpec} [spec]
 * @returns {Command}
 */
export function command(name, spec = {}) {
    return new Command(name, spec, null);
}
