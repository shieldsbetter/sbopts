import assert from 'node:assert/strict';

import { command } from '../src/command.js';
import { UsageError } from '../src/errors.js';
import { test } from 'node:test';

/** Drive run() with captured IO instead of touching the real process. */
function harness(cli, argv) {
    const out = [];
    const err = [];
    let code = null;
    return cli
        .run(argv, {
            stdout: (s) => out.push(s),
            stderr: (s) => err.push(s),
            exit: (c) => {
                code = c;
            },
            width: 72,
        })
        .then((value) => ({
            value,
            out: out.join(''),
            err: err.join(''),
            code,
        }));
}

test('run() awaits an async handler and resolves to its return value', async () => {
    const cli = command('app', {
        commands: {
            go: {
                run: async ({ positionals }) => {
                    await Promise.resolve();
                    return `done:${positionals.join(',')}`;
                },
            },
        },
    });
    const r = await harness(cli, ['go', 'a', 'b']);
    assert.equal(r.value, 'done:a,b');
    assert.equal(r.code, null); // no exit on success
});

test('run() dispatches to the resolved command handler with context', async () => {
    let seen;
    const cli = command('app', {
        flags: { dir: { short: 'C', type: 'string' } },
        commands: {
            build: {
                flags: { force: { short: 'f', type: 'boolean' } },
                run: (ctx) => {
                    seen = ctx;
                    return 'built';
                },
            },
        },
    });
    const r = await harness(cli, [
        'build',
        '-f',
        '-C',
        'x',
        'web',
        '--',
        'raw',
    ]);
    assert.equal(r.value, 'built');
    assert.equal(r.code, null); // no exit on success
    assert.equal(seen.flags.force, true);
    assert.equal(seen.flags.dir, 'x');
    assert.deepEqual(seen.positionals, ['web']);
    assert.deepEqual(seen.rest, ['raw']);
    assert.deepEqual(seen.path, ['app', 'build']);
});

test('run() prints help and exits 0 on --help', async () => {
    const cli = command('app', { run: () => {} });
    const r = await harness(cli, ['--help']);
    assert.equal(r.code, 0);
    assert.match(r.out, /Usage: app/);
});

test('run() reports a usage error on stderr and exits 1', async () => {
    const cli = command('app', { commands: { build: { run: () => {} } } });
    const r = await harness(cli, ['frobnicate']);
    assert.equal(r.code, 1);
    assert.match(r.err, /Unknown command 'frobnicate'/);
    assert.match(r.err, /--help/);
});

test('run() on a group with no handler shows help and exits 1', async () => {
    const cli = command('app', { commands: { build: { run: () => {} } } });
    const r = await harness(cli, []);
    assert.equal(r.code, 1);
    assert.match(r.err, /no command given/);
    assert.match(r.err, /Commands:/);
});

test('run() rethrows anything that is not a usage error', () => {
    // A UsageError is the end user's mistake, so run() prints a hint and exits
    // non-zero. Anything else escaping parse() is a bug in the program, and
    // swallowing it would turn a stack trace into a silent exit code.
    const cli = command('app', { run: () => {} });
    return assert.rejects(
        () =>
            cli.run(null, {
                stdout() {},
                stderr() {},
                exit() {},
            }),
        (e) => e instanceof TypeError && !(e instanceof UsageError),
    );
});

test('the IO hooks default to the real process streams', () => {
    // Covering the defaults without letting them fire: a successful run touches
    // neither stdout nor exit, so passing only the hooks a test must intercept
    // exercises the `?? process.…` fallbacks for the rest.
    let ran = false;
    const cli = command('app', {
        run() {
            ran = true;
        },
    });
    return cli.run([]).then(() => assert.ok(ran));
});

test('a usage error with no command attached falls back to the root', () => {
    // e.command is set when the error is raised inside a subcommand's parse;
    // a bare UsageError has none, and the message still needs a name in it.
    const err = [];
    const cli = command('app', { run: () => {} });
    const bare = new UsageError('something went wrong');
    delete bare.command;
    cli.parse = () => {
        throw bare;
    };
    return cli
        .run([], { stdout() {}, stderr: (s) => err.push(s), exit() {} })
        .then(() => {
            assert.match(err.join(''), /^app: something went wrong/);
        });
});

test('the default hooks really do write to stdout/stderr and exit', () => {
    // The hooks are one-line adapters onto the real process, so the only way to
    // execute them is to stand in for the process itself. Worth doing: a typo
    // in one of the three would surface as a CLI printing its help to the wrong
    // stream, which nothing else here would catch.
    //
    // The stubs are installed and removed SYNCHRONOUSLY around the calls, not
    // held across an await. node:test reports through process.stdout.write, so
    // leaving the stub in place for even one turn of the loop swallows the
    // runner's own output and the file fails with no visible reason. Both
    // short-circuit paths below (help, usage error) write and exit before
    // run() reaches its first await, so this is enough.
    const cli = command('app', {
        flags: { n: { type: 'number', summary: 'A number.' } },
        run: () => {},
    });

    const realOut = process.stdout.write;
    const realErr = process.stderr.write;
    const realExit = process.exit;
    const out = [];
    const err = [];
    const codes = [];
    let pending;
    try {
        process.stdout.write = (s) => out.push(s);
        process.stderr.write = (s) => err.push(s);
        process.exit = (c) => codes.push(c);
        pending = Promise.all([
            cli.run(['--help']),
            cli.run(['--n', 'not-a-number']),
        ]);
    } finally {
        process.stdout.write = realOut;
        process.stderr.write = realErr;
        process.exit = realExit;
    }

    return pending.then(() => {
        assert.match(out.join(''), /Usage: app/);
        assert.match(err.join(''), /^app: /);
        assert.deepEqual(codes.sort(), [0, 1]);
    });
});
