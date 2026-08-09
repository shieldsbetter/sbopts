# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

`@shieldsbetter/sbopts` is an opinionated ESM command-line parser. The whole
point is that the opinions are fixed: there is one spelling for each question,
and the library enforces it rather than supporting every CLI convention ever
invented. A proposal that adds a second way to write something needs to justify
itself against that, and "some other parser allows it" is not a justification.

The house rules, in full (the header of `parse.js` is the canonical list):

```
--long              long flags always take two dashes
-s                  short flags are a single dash and one letter
--foo bar  -o bar   a value flag takes the next token...
--foo=bar  -o=bar   ...or an inline value after '='
-abc                booleans stack (== -a -b -c)
--no-foo            negate a negatable boolean
--foo a --foo b     repeats accumulate into an array
--                  ends parsing; the rest is passed through verbatim
-                   a lone dash is an ordinary positional (the stdin idiom)
```

The only runtime dependency is `@shieldsbetter/termiflo`, which typesets
`--help`. Keeping the dependency count at one is deliberate.

## The two error types

This is the distinction the codebase is built around, and the reason
`errors.js` exists at all:

- **`DefinitionError`** — the _developer_ described the CLI wrong: a duplicate
  short flag, an unknown type, a bad name. Thrown while building the command
  tree. An end user can never trigger one.
- **`UsageError`** — the _end user_ typed something invalid. It carries the
  `command` that was in scope, so the hint can name the right thing.

`run()` catches `UsageError`, prints the message and a `Try 'x --help'` hint,
and exits non-zero. **Everything else is rethrown untouched** — swallowing it
would turn a stack trace into a silent exit code. Do not widen that catch.

## Commands

- Test: `npm test` (node:test over `test/`); one file: `node --test test/parse.test.js`; one test: add `--test-name-pattern="<name>"`
- Coverage: `npm run coverage` (c8, `--100` on every metric)
- Typecheck: `npm run typecheck` (tsc over `src/index.d.ts` + `test-d/`)
- Lint: `npm run lint` (eslint, zero warnings); `npm run lint:fix` autofixes import order
- Format: `npm run format` / `npm run format:check`
- Demo: `node examples/demo.js --help`, and any subcommand thereof

Import style is enforced: whole-module (default) imports first, then
destructuring ones, each block alphabetized **by module name** (so `node:test`
sorts under `n`, not under its binding), with a blank line between, plus a local
`imports-first` rule. `eslint-plugin-prettier` is deliberately absent: it drags
`eslint-config-prettier` along with it, which silently switches off rules that
then sit in the config looking enforced. Prettier owns formatting; ESLint owns
correctness; they do not overlap.

## CI

ubuntu/windows/macos × Node 20/22/24, running lint, typecheck, format:check and
coverage. Plus a `floor` job that verifies the declared `engines: >=18`.

The floor job runs **`npm ci --omit=dev`** before `node --test`, which is the
one place this differs from termiflo's otherwise-identical workflow: termiflo
has no runtime dependencies and can test on the floor with no install at all,
whereas sbopts needs termiflo present. The dev toolchain (ESLint 10, c8 12,
TypeScript) needs Node 20+, so it cannot be installed there.

## Parsing

`parse(root, argv)` walks argv once, holding `cmd` (the command currently in
scope), a `seen` map of `long -> { flag, values[] }` preserving repeat order,
and the positional/rest arrays. It returns the deepest command reached along
with the resolved flags.

**Subcommands are the norm.** When the command in scope has children, the next
bare word must name one of them. When it has none, bare words are positionals.

**A parent's flags stay in scope for its children**, which is what lets a flag
be _deferred_ past the subcommand name: `app -C dir build` and `app build -C dir`
mean the same thing. `effectiveFlags()` memoizes into `this._effective`, so
flags pushed onto `ownFlags` after the first call are not seen.

**A child cannot shadow an inherited flag at all.** Redeclaring an inherited
long name, or reusing an inherited short letter, is a `DefinitionError` from
`_checkInheritedFlagCollisions()` in the constructor. The alternative is a CLI
that silently resolves `-v` to whichever ancestor happened to be closest.

One consequence worth knowing: the `byLong.set()` overwrite in
`effectiveFlags()` can never actually overwrite anything. It deduplicates a case
the constructor has already rejected.

**The implicit help is the one exception.** It is synthesized rather than
declared, so `_checkInheritedFlagCollisions()` skips inherited flags with
`isHelp` and a developer may take `help` or `-h` at any depth, not only at the
root. `effectiveFlags()` then finds that spelling in the chain and stops adding
the implicit flag for that command and its descendants, while siblings and
ancestors keep theirs. A help flag someone actually declared is an ordinary flag
with no `isHelp`, so redeclaring **that** in a child still collides.

**There is no attached-value shorthand for short flags.** `-o bar` and `-o=bar`,
never `-obar`. That single restriction is what makes a multi-character token
unambiguously a boolean stack, so `-abc` needs no lookahead to interpret.

**A repeated scalar becomes an array even without `array: true`** (`finalize()`
in `parse.js`). This is the "repeated parameters become array values" opinion,
not an accident; `array: true` differs in that it is _always_ an array, even for
a single occurrence.

**Boolean subtleties**, all three of which have tests because none is obvious:

- bare `--flag` is always true;
- `--flag=false` goes through the same coercion as any other value, so an inline
  value can turn a boolean **off**;
- `--no-flag` is a switch, not a value flag, and `--no-flag=1` is an error.

`Flag.coerce()` throws a **plain `Error`**, which `assignValue()` catches and
rewraps as a `UsageError`. That keeps `Flag` ignorant of parse position while
still producing an error the user can act on.

## Help

**`--help` short-circuits.** The moment the help flag is seen, parsing stops
(`stop = true`) and `parse()` returns early with `help: true`, empty `flags`,
and no required-flag enforcement or default-filling. Someone asking for usage
text should not first be told they are missing a required option. It also means
`-h=anything` ignores its attached value rather than trying to coerce it.

The implicit `--help`/`-h` is appended only if the developer has not taken
either spelling anywhere in the chain; `helpFlag()` returns null when they have.
A declared help flag is ordinary: it takes a value, does not short-circuit, and
`parse()` reports `help: false`.

**`required` and `default` are mutually exclusive**, rejected in `Flag`'s
constructor. `finalize()` checks `required` first and returns from that branch,
so a default alongside it was unreachable and one of the two options quietly did
nothing. The test is `'default' in spec`, not `spec.default !== undefined`:
writing the key at all is a statement of intent, and `default: undefined` is
meaningful on a boolean, where it overrides the implicit `false`.

**The options table announces both.** `flagSummary()` in `help.js` appends
`Required.` or `Default: <value>`, because neither is visible in the invocation
— `-o, --out <string>` reads identically whether the flag is mandatory,
optional, or defaulted. Defaults are JSON-quoted so an empty string shows as
`""` instead of vanishing into the line, and only a _declared_ default is
announced, never the implicit `false`/`[]`. At most one note can appear, since
the combination is rejected above.

**`args` are documentation.** `ArgSpec` shapes the usage line (`<required>`,
`[optional]`, `<variadic...>`) and the Arguments section. Positionals are handed
to the handler as a plain `string[]`; nothing binds them to those names.

### Layout (`help.js`)

The two-space indent on every help row is the **border's** left separator
(`body: { left: '  ', … }`), not leading spaces in the cell text. Indenting via
cell text would not survive word wrapping, which drops a space at the start of a
wrapped line.

The label column uses **`minWidth: labelWidth`**, not a fixed `width`. Both keep
labels unwrapped when there is room, but a fixed width holds its full size in a
narrow terminal and starves the description column — at 40 columns it collapsed
to two columns wide, one letter per line. `minWidth` is soft in termiflo 0.1.0,
so both columns give way together.

Width resolution answers two different questions, and conflating them was the
old bug:

```js
auto ?
    stack(blocks, { width: 80 }).toString() // ask for 80, clamped to the display
:   stack(blocks).toString(options.width); // an explicit width IS the display
```

A `width` option is what the block asks for _within_ what it has; the argument
to `toString()` is how wide the display is. This is why nothing here reads
`process.stdout` — the old code called termiflo's `terminalWidth()` and took a
`Math.min`, which is the same answer computed by hand.

## Types (`src/index.d.ts`)

Hand-written, and `.d.ts` rather than `.d.mts`: the package is
`"type": "module"` with an `index.js` entry, so node16 resolution pairs them by
name.

Checked three ways, and all three have to stay, because each catches what the
others cannot:

1. `npm run typecheck`, with **`skipLibCheck` off** — with it on, an error inside
   the declarations is only reported where a test happens to touch it.
2. `test-d/index.test-d.ts`, using `Expect<Equal<>>` and `@ts-expect-error` for
   negatives. An unused `@ts-expect-error` is itself an error, so a negative
   case cannot quietly stop testing. It lives in `test-d/`, **not** `test/`:
   Node's runner treats everything under `test/` as a test file and strips
   TypeScript natively, so the deliberately-invalid calls would be executed.
3. `the declarations declare exactly what the module exports` in
   `test/exports.test.js`, which compares the declared names to the real ones.
   Type-level testing cannot see a value that exists in one and not the other.

## Testing approach

100% coverage on all four metrics, enforced. Two notes on getting there:

**Stubbing the process is synchronous.** The IO hooks in `run()` default to
`process.stdout.write`, `process.stderr.write` and `process.exit`, and the only
way to execute those one-line adapters is to stand in for the process. The stubs
must go in and come out **synchronously around the calls** — `node:test` reports
through `process.stdout.write`, so holding a stub across an `await` swallows the
runner's own output and the file fails with no visible reason. Both
short-circuit paths (help, usage error) write and exit before `run()` reaches
its first await, which is what makes that possible.

**Prefer deleting a dead default to covering it.** `twoColumn()` carried a
`right ?? ''` that could not fire, because `Flag` and `Command` both default
`summary` to `''` and the args path already coerces. It went, rather than
acquiring a test that existed only to keep it alive.

## Public surface

`exports` is `.` and `./package.json`, nothing else. Six names:
`command`, `Command`, `renderHelp`, `Flag`, `DefinitionError`, `UsageError`.
Adding a subpath later is not a breaking change; removing one is.
