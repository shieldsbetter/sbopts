// Compile-time assertions about the public types. Not run: `tsc --noEmit`
// checking this file IS the test.
//
// In test-d/, NOT test/: Node's runner treats everything under test/ as a test
// file and strips TypeScript natively, so the deliberately-invalid calls below
// would be executed.

import {
    Command,
    DefinitionError,
    Flag,
    UsageError,
    command,
    renderHelp,
    type ParseResult,
    type RunContext,
} from '../src/index.js';

type Expect<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true
    :   false;

// --- command() returns a Command; parse/help/run have the right shapes ---
const cli = command('app', {
    summary: 'Does things.',
    flags: { verbose: { short: 'v', type: 'boolean', summary: 'Chatty.' } },
    args: [{ name: 'target', required: false }],
    commands: { build: { summary: 'Build.', run: () => {} } },
    run: (ctx) => ctx.flags.verbose,
});
type _cmd = Expect<Equal<typeof cli, Command>>;
type _parse = Expect<Equal<ReturnType<typeof cli.parse>, ParseResult>>;
type _help = Expect<Equal<ReturnType<typeof cli.help>, string>>;
type _run = Expect<Equal<ReturnType<typeof cli.run>, Promise<unknown>>>;

// --- the run context is typed -------------------------------------------
command('x', {
    run: (ctx: RunContext) => {
        const path: string[] = ctx.path;
        const rest: string[] = ctx.rest;
        const self: Command = ctx.command;
        void path;
        void rest;
        void self;
    },
});

// --- optional everywhere it is optional ----------------------------------
command('bare');
command('y', { commands: { sub: null }, flags: { f: null } });

// --- closed spec shapes ---------------------------------------------------
// @ts-expect-error 'kind' is not a flag spec field
command('z', { flags: { a: { kind: 'boolean' } } });
// @ts-expect-error a flag type is one of three strings
command('z', { flags: { a: { type: 'integer' } } });
// @ts-expect-error commands take a spec, not a Command
command('z', { commands: { sub: command('sub') } });

// --- Flag ------------------------------------------------------------------
const f = new Flag('verbose', { short: 'v', type: 'boolean' });
type _inv = Expect<Equal<ReturnType<typeof f.invocation>, string>>;
const takes: boolean = f.takesValue;
void takes;

// --- help width accepts a number or "auto", nothing else ------------------
cli.help({ width: 72 });
cli.help({ width: 'auto' });
// @ts-expect-error a width is columns or "auto"
cli.help({ width: '72' });

// --- run IO hooks ----------------------------------------------------------
cli.run([], { stdout: (s: string) => void s, exit: (c: number) => void c });
// @ts-expect-error stdout takes the string to write
cli.run([], { stdout: (n: number) => void n });

// --- errors are Errors, and carry what they promise ----------------------
const u = new UsageError('bad');
const d = new DefinitionError('worse');
const m: string = u.message + d.message;
void m;
declare const thrown: unknown;
if (thrown instanceof UsageError) {
    const where: Command | undefined = thrown.command;
    void where;
}

// --- renderHelp is the free function behind Command#help() ----------------
type _rh = Expect<Equal<ReturnType<typeof renderHelp>, string>>;
