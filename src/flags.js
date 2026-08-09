// Flag declarations: normalization, defaults, and value coercion.
//
// A flag is declared as an entry in a command's `flags` map, keyed by its long
// name:
//
//   flags: {
//       verbose: { short: 'v', type: 'boolean', summary: 'Print more' },
//       output:  { short: 'o', type: 'string', summary: 'Where to write' },
//       include: { short: 'I', type: 'string', array: true },
//   }
//
// The key is the `--long` name; `short` (optional) is the single-letter `-x`
// form. Everything else is optional and described in the typedef below.

import { DefinitionError } from './errors.js';
import { isNil, isShortName, isLongName } from './util.js';

const TYPES = new Set(['boolean', 'string', 'number']);

/**
 * @typedef {object} FlagSpec
 * @property {string} [short]   Single-letter short alias (the `-x` form).
 * @property {"boolean"|"string"|"number"} [type="boolean"]  Value type. Boolean flags take no value (presence = true).
 * @property {boolean} [array=false]  Collect repeats into an array (always an array, even with one occurrence).
 * @property {*} [default]      Value when the flag is absent. Defaults to false (boolean), [] (array), or undefined.
 * @property {boolean} [required=false]  Error if the flag is never supplied.
 * @property {string[]} [choices]  Restrict values to this set (after coercion, compared as strings).
 * @property {boolean} [negatable=true]  For booleans, allow `--no-<long>` to force false.
 * @property {string} [summary]  One-line help text shown in the options table.
 */

/** A normalized flag: the declaration plus its resolved long name and type. */
export class Flag {
    constructor(long, spec) {
        if (!isLongName(long)) {
            throw new DefinitionError(
                `Invalid flag name '${long}': long names start with a letter ` +
                    `and contain only letters, digits, and dashes.`,
            );
        }
        const type = spec.type ?? 'boolean';
        if (!TYPES.has(type)) {
            throw new DefinitionError(
                `Flag '--${long}' has unknown type '${type}'. ` +
                    `Use 'boolean', 'string', or 'number'.`,
            );
        }
        if (!isNil(spec.short) && !isShortName(spec.short)) {
            throw new DefinitionError(
                `Flag '--${long}' has invalid short '${spec.short}': ` +
                    `a short name is a single letter or digit.`,
            );
        }
        if (type !== 'boolean' && spec.negatable === true) {
            throw new DefinitionError(
                `Flag '--${long}' is not boolean, so it cannot be negatable.`,
            );
        }

        this.long = long;
        this.short = spec.short;
        this.type = type;
        this.array = spec.array === true;
        this.required = spec.required === true;
        this.choices = spec.choices;
        // Only booleans negate, and only when not explicitly disabled.
        this.negatable = type === 'boolean' && spec.negatable !== false;
        this.summary = spec.summary ?? '';
        this.hasDefault = 'default' in spec;
        this.default = spec.default;
    }

    /** Does this flag consume a value (true), or is it presence-only (false)? */
    get takesValue() {
        return this.type !== 'boolean';
    }

    /** The value used when the flag never appears on the command line. */
    defaultValue() {
        if (this.hasDefault) return this.default;
        if (this.array) return [];
        if (this.type === 'boolean') return false;
        return undefined;
    }

    /**
     * Coerce a single raw string token to this flag's type and validate it
     * against `choices`. Throws a plain Error whose message the parser wraps in
     * a UsageError with positional context.
     */
    coerce(raw) {
        let value;
        if (this.type === 'number') {
            value = Number(raw);
            if (Number.isNaN(value)) {
                throw new Error(
                    `--${this.long} expects a number, got '${raw}'.`,
                );
            }
        } else if (this.type === 'boolean') {
            // Reached only via the `--flag=value` form on a boolean.
            if (raw === 'true') value = true;
            else if (raw === 'false') value = false;
            else {
                throw new Error(
                    `--${this.long} is a boolean; use 'true' or 'false', ` +
                        `not '${raw}'.`,
                );
            }
        } else {
            value = raw;
        }

        if (this.choices && !this.choices.includes(String(value))) {
            throw new Error(
                `--${this.long} must be one of ${this.choices
                    .map((c) => `'${c}'`)
                    .join(', ')}; got '${raw}'.`,
            );
        }
        return value;
    }

    /** `-v, --verbose` / `    --verbose` / `-o, --output <string>` for help. */
    invocation() {
        const head =
            this.short ?
                `-${this.short}, --${this.long}`
            :   `    --${this.long}`;
        return this.takesValue ? `${head} <${this.type}>` : head;
    }
}

/**
 * Normalize a `flags` declaration map into Flag instances, checking for
 * duplicate long and short names within this one command's own declarations.
 * Cross-level (inherited) collisions are checked separately in command.js,
 * which knows the parent chain.
 *
 * @param {Record<string, FlagSpec>} [decls]
 * @returns {Flag[]}
 */
export function normalizeFlags(decls = {}) {
    const flags = [];
    const shorts = new Map();
    for (const [long, spec] of Object.entries(decls)) {
        const flag = new Flag(long, spec ?? {});
        if (!isNil(flag.short)) {
            if (shorts.has(flag.short)) {
                throw new DefinitionError(
                    `Short flag '-${flag.short}' is claimed by both ` +
                        `'--${shorts.get(flag.short)}' and '--${flag.long}'.`,
                );
            }
            shorts.set(flag.short, flag.long);
        }
        flags.push(flag);
    }
    return flags;
}
