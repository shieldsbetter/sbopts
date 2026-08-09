# sbopts

[![CI](https://github.com/shieldsbetter/sbopts/actions/workflows/ci.yml/badge.svg)](https://github.com/shieldsbetter/sbopts/actions/workflows/ci.yml)
[![Coverage](https://raw.githubusercontent.com/shieldsbetter/sbopts/badges/coverage.svg)](https://github.com/shieldsbetter/sbopts/actions/workflows/ci.yml)

An **opinionated** command-line parser for Node ESM. It doesn't try to support
every CLI convention ever invented — it picks one good answer for each question
and enforces it, so your CLI is consistent and your parsing code is tiny.

The opinions:

- **Long flags are `--foo`, short flags are `-f`.** Always. No `-foo`, no
  `/foo`.
- **Booleans stack: `-abc` means `-a -b -c`.** A multi-character short token is
  only boolean flags; a value-taking short must stand on its own (`-o bar`).
- **Repeated flags become arrays.** `--tag a --tag b` → `['a', 'b']`.
- **Subcommands are the norm**, and **a parent's flags are inherited by its
  children** — so they can be _deferred_ past the subcommand name: `app -C dir
build` and `app build -C dir` mean the same thing.
- **`--` ends parsing.** Everything after it is handed to your command verbatim.
- **`--help` is generated for you**, with a short summary and long description of
  the command and every flag in scope, typeset with
  [termiflo](https://www.npmjs.com/package/@shieldsbetter/termiflo).

Pure ESM, Node ≥ 18. The only runtime dependency is termiflo (for help layout).

## Install

```sh
npm install @shieldsbetter/sbopts
```

```js
import { command } from '@shieldsbetter/sbopts';
```

## A complete CLI

```js
import { command } from '@shieldsbetter/sbopts';

const cli = command('demo', {
    summary: 'A toy version-control-shaped CLI.',
    description: 'Demonstrates the whole surface of sbopts.',
    flags: {
        dir: {
            short: 'C',
            type: 'string',
            summary: 'Run as if started in <dir>.',
        },
        verbose: { short: 'v', type: 'boolean', summary: 'Print more.' },
    },
    commands: {
        commit: {
            summary: 'Record changes to the repository.',
            flags: {
                message: {
                    short: 'm',
                    type: 'string',
                    summary: 'Commit message.',
                },
                all: { short: 'a', type: 'boolean', summary: 'Stage all.' },
            },
            run: ({ flags, positionals, rest }) => {
                // your handler
            },
        },
    },
});

cli.run(); // parses process.argv, dispatches, prints help / errors, exits
```

```text
$ demo commit -a -m 'first'        # -m takes a value, so it stands on its own
$ demo commit -av                  # -a and -v are booleans: a stack (-a -v)
$ demo -C /tmp commit -m hi        # -C is demo's flag, deferred past `commit`
$ demo commit --help              # auto-generated, typeset help
```

## Defining commands

`command(name, spec)` builds a command (usually the root). A command may carry
flags, positional-argument metadata, a `run` handler, and nested `commands`.

```js
command('app', {
    summary: 'One-liner shown in the parent command list and atop --help.',
    description: 'Longer prose for the help body. Falls back to `summary`.',
    flags: {
        /* … */
    },
    args: [{ name: 'file', required: true, summary: 'Input to read.' }],
    commands: {
        /* name: spec, … */
    },
    run: (ctx) => {
        /* … */
    },
});
```

`args` is metadata for the **usage line and help only** — positionals are always
collected and handed to your handler as `positionals`; sbopts doesn't bind them
to names. A leaf command (no subcommands) collects bare words as positionals; a
command _with_ subcommands requires the next bare word to name one of them.

## Defining flags

Flags are a map keyed by the **`--long` name**. Everything but the key is
optional:

```js
flags: {
    output:  { short: 'o', type: 'string', summary: 'Where to write.' },
    jobs:    { short: 'j', type: 'number', default: 1 },
    verbose: { short: 'v', type: 'boolean' },
    include: { short: 'I', type: 'string', array: true },
    level:   { type: 'string', choices: ['low', 'high'], required: true },
}
```

| field       | meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `short`     | single-letter `-x` alias                                |
| `type`      | `'boolean'` (default), `'string'`, or `'number'`        |
| `array`     | always collect into an array (even a single occurrence) |
| `default`   | value when the flag is absent                           |
| `required`  | error if never supplied                                 |
| `choices`   | restrict the (coerced) value to a set                   |
| `negatable` | for booleans, allow `--no-<long>` (default `true`)      |
| `summary`   | one-line help text                                      |

Booleans are presence-only (`-v` ⇒ `true`); the rest take a value. Defaults
when absent: `false` for booleans, `[]` for arrays, `undefined` otherwise (or
your `default`).

## The grammar, precisely

| input                     | meaning                                         |
| ------------------------- | ----------------------------------------------- |
| `--foo`                   | boolean `foo` → `true`                          |
| `--foo bar` / `--foo=bar` | value flag `foo` → `'bar'`                      |
| `--no-foo`                | negatable boolean `foo` → `false`               |
| `-f`                      | boolean `f` → `true`                            |
| `-o bar` / `-o=bar`       | value flag `o` → `'bar'`                        |
| `-abc`                    | booleans `a`, `b`, `c` → `true` (== `-a -b -c`) |
| `-abo` (o takes a value)  | error — a value flag can't be stacked           |
| `--tag a --tag b`         | repeated → `['a', 'b']`                         |
| `--`                      | stop parsing; the remainder is `rest`           |
| `-`                       | an ordinary positional (the stdin idiom)        |

There is **no attached-value shorthand** for shorts: `-obar` is the four-flag
stack `-o -b -a -r`, not `-o=bar`. A multi-character short token is therefore
always a pure boolean stack, and a value-taking short flag must stand on its own
(`-o bar` or `-o=bar`) — which is exactly "stack only booleans".

A flag declared `array: true` is always an array. A scalar flag supplied more
than once is also promoted to an array (the "repeats become arrays" opinion); a
scalar supplied once stays scalar.

## Inheritance & deferral

A parent's flags are in scope for every descendant. The parser learns a child's
own flags only once it has descended into that child, but the parent's flags
stay available throughout — so they can appear before _or_ after the subcommand
name:

```js
cli.parse(['-C', 'dir', 'commit']); // flags.dir === 'dir'
cli.parse(['commit', '-C', 'dir']); // flags.dir === 'dir'  (deferred)
```

Redefining an inherited long name or reusing an inherited short letter is a
`DefinitionError` (a bug in your CLI, thrown when the tree is built).

## Parsing vs. running

`command(...).parse(argv)` is **pure**: it returns a result and throws on bad
input. Use it when you want to drive control flow yourself.

```js
const { command, path, flags, positionals, rest, terminated, help } = cli.parse(
    process.argv.slice(2),
);
```

- `command` — the resolved (deepest) command
- `path` — its names from the root, e.g. `['app', 'remote', 'add']`
- `flags` — resolved values, defaults filled in
- `positionals` — bare arguments
- `rest` — everything after `--`
- `terminated` — whether a `--` was seen
- `help` — whether `--help` / `-h` was requested

`command(...).run(argv?, io?)` is the batteries-included path: it parses,
prints help on `--help` (exit 0), prints usage errors to stderr (exit 1),
dispatches to the resolved command's `run` handler, and returns the handler's
(awaited) result. The handler receives `{ flags, positionals, rest, path,
command }`.

The `io` hooks are injectable, which is what makes `run()` testable:

```js
await cli.run(argv, {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    exit: (code) => {
        capturedCode = code;
    },
    width: 72, // help width; defaults to the terminal's, capped at 80
});
```

## Errors

- **`DefinitionError`** — the CLI was declared wrong (duplicate short, unknown
  type, inherited-flag collision). A programming bug; thrown while building.
- **`UsageError`** — the end user typed something invalid (unknown flag, missing
  value, failed coercion, unknown subcommand). `parse()` throws it; `run()`
  catches it, prints a hint, and exits non-zero. It carries the `command` that
  was in scope when parsing failed.

## Help

`--help` / `-h` short-circuits parsing and reports help for whichever command was
in scope. `command.help({ width })` returns the same text as a string. The
layout — usage line, description, `Arguments`, `Commands`, `Options`, and
`Global options` (inherited flags) — is typeset with termiflo, so it wraps to the
terminal width and stays aligned.

```text
Usage: app build [options] [target]

Build the project.

Arguments:
  target   What to build.

Options:
  -f, --force             Overwrite outputs.
  -D, --define <string>   Set a key=value definition; may be repeated.
  -j, --jobs <number>     Parallel jobs.
  -h, --help              Show this help and exit.

Global options:
  -C, --dir <string>   Run as if started in <dir>.
  -v, --verbose        Be chatty.
```

## License

MIT © 2026 Hampton Smith
