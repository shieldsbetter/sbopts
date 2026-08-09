import assert from 'node:assert/strict';

import { command } from '../src/command.js';
import { DefinitionError, UsageError } from '../src/errors.js';
import { test } from 'node:test';

function git() {
    return command('git', {
        flags: {
            dir: { short: 'C', type: 'string' },
            verbose: { short: 'v', type: 'boolean' },
        },
        commands: {
            commit: {
                flags: {
                    message: { short: 'm', type: 'string' },
                    all: { short: 'a', type: 'boolean' },
                },
                run: () => {},
            },
            remote: {
                commands: {
                    add: { run: () => {} },
                },
            },
        },
    });
}

test('a bare word descends into the named subcommand', () => {
    const r = git().parse(['commit', '-m', 'hi']);
    assert.deepEqual(r.path, ['git', 'commit']);
    assert.equal(r.flags.message, 'hi');
});

test('nested subcommands descend multiple levels', () => {
    assert.deepEqual(git().parse(['remote', 'add']).path, [
        'git',
        'remote',
        'add',
    ]);
});

test('parent flags are inherited and may be deferred past the subcommand', () => {
    const before = git().parse(['-C', 'x', 'commit']).flags;
    const after = git().parse(['commit', '-C', 'x']).flags;
    assert.equal(before.dir, 'x');
    assert.equal(after.dir, 'x');
    // The child still resolves its own flags too.
    const f = git().parse(['commit', '-C', 'x', '-a', '-m', 'go']).flags;
    assert.equal(f.all, true);
    assert.equal(f.message, 'go');
});

test('child flags are not in scope before the subcommand is entered', () => {
    // -m belongs to commit, not git: using it before `commit` is an error.
    assert.throws(() => git().parse(['-m', 'hi', 'commit']), UsageError);
});

test('an unknown subcommand is a usage error', () => {
    assert.throws(() => git().parse(['frobnicate']), /Unknown command/);
});

test('redefining an inherited flag is a definition error', () => {
    assert.throws(
        () =>
            command('app', {
                flags: { dir: { short: 'C', type: 'string' } },
                commands: {
                    sub: {
                        flags: { dir: { type: 'string' } },
                        run: () => {},
                    },
                },
            }),
        DefinitionError,
    );
});

test('reusing an inherited short letter is a definition error', () => {
    assert.throws(
        () =>
            command('app', {
                flags: { dir: { short: 'C', type: 'string' } },
                commands: {
                    sub: {
                        flags: { count: { short: 'C', type: 'number' } },
                        run: () => {},
                    },
                },
            }),
        /reuses short/,
    );
});

test('a command needs a non-empty name', () => {
    for (const bad of ['', 42, null, undefined]) {
        assert.throws(() => command(bad, { run: () => {} }), {
            name: 'DefinitionError',
            message: /non-empty name/,
        });
    }
});

test('every optional part of a declaration is genuinely optional', () => {
    // A spec may be omitted entirely, at any level. These are the `?? {}` and
    // `?? ''` defaults that a fully-populated fixture never exercises.
    const cli = command('app', {
        commands: { bare: null, alsoBare: undefined },
        flags: { plain: null },
        args: [{ name: 'thing' }, { name: 'rest', required: false }],
        run: () => {},
    });

    assert.deepEqual([...cli.subcommands.keys()], ['bare', 'alsoBare']);
    assert.equal(cli.subcommands.get('bare').summary, '');
    assert.equal(cli.lookupLong('plain').type, 'boolean');

    // An arg with no summary, one required and one not, and no variadic.
    const help = cli.help({ width: 60 });
    assert.match(help, /<thing>/);
    assert.match(help, /\[rest\]/);
});

test('a variadic arg is spelled with an ellipsis in the usage line', () => {
    const cli = command('app', {
        args: [{ name: 'files', variadic: true, summary: 'Inputs.' }],
        run: () => {},
    });
    assert.match(cli.help({ width: 60 }), /<files\.\.\.>/);
});

test('helpFlag() is null when the developer declared their own', () => {
    const mine = command('c', {
        flags: { help: { short: 'h', type: 'string', summary: 'mine' } },
        run: () => {},
    });
    assert.equal(mine.helpFlag(), null);
    assert.ok(command('d', { run: () => {} }).helpFlag());
});

test('a developer may take the help spelling at any depth', () => {
    // The implicit --help is synthesized, not declared, so claiming its name is
    // an override rather than a collision. It used to be a DefinitionError
    // anywhere but the root, because the check compared against the parent's
    // effective flags, which already contained the implicit one.
    const cli = command('p', {
        commands: {
            k: {
                flags: {
                    help: { short: 'h', type: 'string', summary: 'mine' },
                },
                commands: { deep: { run: () => {} } },
                run: () => {},
            },
            m: { run: () => {} },
        },
        run: () => {},
    });

    // The subcommand's own --help is an ordinary value flag: no short-circuit.
    const r = cli.parse(['k', '--help', 'x']);
    assert.equal(r.help, false);
    assert.equal(r.flags.help, 'x');
    assert.equal(cli.subcommands.get('k').helpFlag(), null);

    // It reaches descendants, and leaves siblings and ancestors alone.
    assert.equal(cli.parse(['k', 'deep', '--help', 'v']).help, false);
    assert.equal(cli.parse(['m', '--help']).help, true);
    assert.equal(cli.parse(['--help']).help, true);

    // Taking only the short letter for something else works the same way.
    const short = command('q', {
        commands: {
            k: {
                flags: { host: { short: 'h', type: 'string' } },
                run: () => {},
            },
        },
        run: () => {},
    });
    assert.equal(
        short.parse(['k', '-h', 'example.com']).flags.host,
        'example.com',
    );
});

test('redeclaring a flag the developer actually declared is still an error', () => {
    // Only the implicit help is overridable. A real inherited flag -- including
    // an inherited `help` someone declared -- collides as it always did.
    assert.throws(
        () =>
            command('p', {
                flags: { help: { type: 'string' } },
                commands: {
                    k: { flags: { help: { type: 'string' } }, run: () => {} },
                },
            }),
        {
            name: 'DefinitionError',
            message: /redefines inherited flag '--help'/,
        },
    );
    assert.throws(
        () =>
            command('p', {
                flags: { verbose: { short: 'v' } },
                commands: {
                    k: { flags: { verify: { short: 'v' } }, run: () => {} },
                },
            }),
        { name: 'DefinitionError', message: /reuses short '-v'/ },
    );
});
