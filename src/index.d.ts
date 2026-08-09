// Hand-written declarations for the public surface of @shieldsbetter/sbopts.
//
// `.d.ts`, not `.d.mts`: the package is `"type": "module"` with an `index.js`
// entry, so node16 resolution pairs them by name. Reachable as a sibling of
// index.js and through the `types` condition in `exports`.
//
// Checked three ways, and all three have to stay: `npm run typecheck` compiles
// this with `skipLibCheck` OFF, `test-d/index.test-d.ts` asserts the shapes a
// caller sees, and a runtime test compares the declared names against the real
// exports. Type-level testing alone cannot catch declarations drifting from the
// implementation.

/** The value a flag holds once parsed. */
export type FlagValue = string | number | boolean | string[] | number[];

export type FlagType = 'boolean' | 'string' | 'number';

export interface FlagSpec {
    /** Single-letter short alias (the `-x` form). */
    short?: string;
    /** Boolean flags take no value; presence alone means true. */
    type?: FlagType;
    /** Collect repeats into an array, even when supplied once. */
    array?: boolean;
    /** Value when the flag is absent. Defaults to false, [], or undefined. */
    default?: FlagValue;
    /** Error if the flag is never supplied. */
    required?: boolean;
    /** Restrict values to this set, compared as strings after coercion. */
    choices?: readonly string[];
    /** For booleans, allow `--no-<long>` to force false. */
    negatable?: boolean;
    /** One-line help text for the options table. */
    summary?: string;
}

/** A positional argument. Documented in the usage line; not parsed into. */
export interface ArgSpec {
    name: string;
    /** `<name>` when true (the default), `[name]` when false. */
    required?: boolean;
    /** Shown as `<name...>`; collects the rest. */
    variadic?: boolean;
    summary?: string;
}

export interface CommandSpec {
    /** One-line description: the parent's command list, and the help header. */
    summary?: string;
    /** Longer help body. Falls back to `summary`. */
    description?: string;
    flags?: Record<string, FlagSpec | null | undefined>;
    commands?: Record<string, CommandSpec | null | undefined>;
    args?: readonly ArgSpec[];
    run?: (ctx: RunContext) => unknown;
}

/** What a command's `run` handler is called with. */
export interface RunContext {
    flags: Record<string, FlagValue | undefined>;
    positionals: string[];
    rest: string[];
    path: string[];
    command: Command;
}

/**
 * The outcome of `Command#parse()`.
 *
 * When `help` is true the user asked for usage text: `flags` is empty and no
 * required-flag or default handling has run, because they only wanted the help
 * for whatever command was in scope.
 */
export interface ParseResult {
    command: Command;
    path: string[];
    flags: Record<string, FlagValue | undefined>;
    positionals: string[];
    /** Everything after a bare `--`. */
    rest: string[];
    /** Whether a `--` was seen. */
    terminated: boolean;
    help: boolean;
}

/** A normalized flag: the declaration plus its resolved long name and type. */
export declare class Flag {
    constructor(long: string, spec?: FlagSpec);
    readonly long: string;
    readonly short?: string;
    readonly type: FlagType;
    readonly array: boolean;
    readonly required: boolean;
    readonly choices?: readonly string[];
    readonly negatable: boolean;
    readonly summary: string;
    readonly hasDefault: boolean;
    readonly default?: FlagValue;
    /** True for everything but a boolean: `--flag VALUE` is expected. */
    readonly takesValue: boolean;
    /** Coerce a raw argv string to this flag's type. */
    coerce(raw: string): FlagValue;
    /** How the flag is spelled in the help table, e.g. `-v, --verbose`. */
    invocation(): string;
}

/** Where output goes and how the process ends. Injectable for tests. */
export interface RunIO {
    stdout?: (s: string) => void;
    stderr?: (s: string) => void;
    exit?: (code: number) => void;
    /** Help width. Defaults to the display width, capped at 80. */
    width?: number | 'auto';
}

export declare class Command {
    constructor(name: string, spec?: CommandSpec, parent?: Command | null);
    readonly name: string;
    readonly parent: Command | null;
    readonly summary: string;
    readonly description: string;
    readonly args: readonly ArgSpec[];
    readonly subcommands: Map<string, Command>;
    readonly handler?: (ctx: RunContext) => unknown;

    /** This command's own flags plus every inherited one. */
    effectiveFlags(): Flag[];
    /** Declared here, minus the implicit help flag. */
    ownVisibleFlags(): Flag[];
    /** Inherited from ancestors: the ones deferrable past the subcommand. */
    inheritedFlags(): Flag[];
    /** The implicit help flag in scope, or null if the caller declared one. */
    helpFlag(): Flag | null;
    lookupLong(name: string): Flag | undefined;
    lookupShort(ch: string): Flag | undefined;
    /** Command names from the root down to this one. */
    path(): string[];

    /** Parse argv without dispatching. Throws {@link UsageError}. */
    parse(argv?: readonly string[]): ParseResult;
    /** The help text for this command, as a string. */
    help(options?: { width?: number | 'auto' }): string;
    /**
     * Parse and dispatch. Prints help or a usage hint and exits through the
     * `io` hooks; anything else thrown is a bug and is rethrown untouched.
     * Resolves to the handler's return value, or undefined if it short-circuited.
     */
    run(argv?: readonly string[], io?: RunIO): Promise<unknown>;
}

/** Define a command, typically the root of a CLI. */
export declare function command(name: string, spec?: CommandSpec): Command;

/** Render a command's help text. `Command#help()` is the usual way in. */
export declare function renderHelp(
    command: Command,
    options?: { width?: number | 'auto' },
): string;

/** The CLI was declared wrong: a programming bug, thrown while building. */
export declare class DefinitionError extends Error {
    readonly name: 'DefinitionError';
}

/** The end user typed something invalid. Carries the command in scope. */
export declare class UsageError extends Error {
    readonly name: 'UsageError';
    readonly command?: Command;
}
