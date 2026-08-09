import assert from 'node:assert/strict';

import { command } from '../src/command.js';
import { UsageError } from '../src/errors.js';
import { test } from 'node:test';

/** A flat (no-subcommand) command exercising every flag type. */
function leaf() {
    return command('tool', {
        flags: {
            verbose: { short: 'v', type: 'boolean' },
            force: { short: 'f', type: 'boolean' },
            white: { short: 'w', type: 'boolean' },
            output: { short: 'o', type: 'string' },
            jobs: { short: 'j', type: 'number' },
            include: { short: 'I', type: 'string', array: true },
        },
        run: () => {},
    });
}

test('long flags: boolean presence and value via space or =', () => {
    assert.equal(leaf().parse(['--verbose']).flags.verbose, true);
    assert.equal(leaf().parse(['--output', 'f.txt']).flags.output, 'f.txt');
    assert.equal(leaf().parse(['--output=f.txt']).flags.output, 'f.txt');
    assert.equal(leaf().parse(['--jobs=8']).flags.jobs, 8);
});

test('a value short takes the next token or an =value; no attached form', () => {
    assert.equal(leaf().parse(['-v']).flags.verbose, true);
    assert.equal(leaf().parse(['-o', 'f']).flags.output, 'f');
    assert.equal(leaf().parse(['-o=f']).flags.output, 'f');
    assert.equal(leaf().parse(['-j', '4']).flags.jobs, 4);
});

test('booleans stack into a single cluster (-abc == -a -b -c)', () => {
    const f = leaf().parse(['-fvw']).flags;
    assert.equal(f.force, true);
    assert.equal(f.verbose, true);
    assert.equal(f.white, true);
    // A cluster is exactly its expansion into separate boolean flags.
    assert.deepEqual(
        leaf().parse(['-fvw']).flags,
        leaf().parse(['-f', '-v', '-w']).flags,
    );
});

test('a value flag cannot be stacked into a cluster', () => {
    // -o takes a value, so it can never appear in a cluster — regardless of
    // what follows it (the next token is unrelated to the error).
    assert.throws(() => leaf().parse(['-vfo', 'bar']), /can't be stacked/);
    assert.throws(() => leaf().parse(['-of']), /can't be stacked/);
    assert.throws(() => leaf().parse(['-vo']), /can't be stacked/);
});

test('a bare word after a boolean cluster is a positional, not a value', () => {
    // -fvw are all booleans, so the cluster is fine and `msg` is a positional
    // belonging to the command — it is not consumed by any flag in the cluster.
    const r = leaf().parse(['-fvw', 'msg']);
    assert.equal(r.flags.force, true);
    assert.equal(r.flags.verbose, true);
    assert.equal(r.flags.white, true);
    assert.deepEqual(r.positionals, ['msg']);
});

test('an =value on a short may itself contain = (e.g. -D=key=val)', () => {
    const cli = command('c', {
        flags: { def: { short: 'D', type: 'string', array: true } },
        run: () => {},
    });
    assert.deepEqual(cli.parse(['-D=key=val']).flags.def, ['key=val']);
    assert.deepEqual(cli.parse(['-D', 'key=val']).flags.def, ['key=val']);
});

test('repeated scalar flags collect into an array', () => {
    assert.deepEqual(leaf().parse(['-o', 'a', '-o', 'b']).flags.output, [
        'a',
        'b',
    ]);
    // A single occurrence of a scalar stays scalar.
    assert.equal(leaf().parse(['-o', 'a']).flags.output, 'a');
});

test('declared array flags are always arrays, even with one value', () => {
    assert.deepEqual(leaf().parse(['-I', 'x']).flags.include, ['x']);
    assert.deepEqual(leaf().parse([]).flags.include, []);
    assert.deepEqual(leaf().parse(['-I', 'x', '-I', 'y']).flags.include, [
        'x',
        'y',
    ]);
});

test('flags may appear after positionals; only -- stops flag parsing', () => {
    // Positionals and flags interleave freely — order doesn't matter.
    const r = leaf().parse(['msg', '-v', 'more', '-o', 'x']);
    assert.equal(r.flags.verbose, true);
    assert.equal(r.flags.output, 'x');
    assert.deepEqual(r.positionals, ['msg', 'more']);

    // Once `--` is seen, later flag-looking tokens are passed through as rest.
    const r2 = leaf().parse(['a', '-v', '--', '-o', '--foo']);
    assert.equal(r2.flags.verbose, true);
    assert.deepEqual(r2.positionals, ['a']);
    assert.deepEqual(r2.rest, ['-o', '--foo']);
});

test('-- ends parsing; the remainder is passed through verbatim', () => {
    const r = leaf().parse(['-v', '--', '-o', '--not-a-flag', 'x']);
    assert.equal(r.flags.verbose, true);
    assert.deepEqual(r.rest, ['-o', '--not-a-flag', 'x']);
    assert.equal(r.terminated, true);
});

test('a lone dash is a positional, not a flag', () => {
    const r = leaf().parse(['-v', '-']);
    assert.equal(r.flags.verbose, true);
    assert.deepEqual(r.positionals, ['-']);
});

test('--no-<flag> negates a boolean; last occurrence wins', () => {
    assert.equal(leaf().parse(['--no-verbose']).flags.verbose, false);
    assert.equal(leaf().parse(['-v', '--no-verbose']).flags.verbose, false);
    assert.equal(leaf().parse(['--no-verbose', '-v']).flags.verbose, true);
});

test('usage errors: unknown flags and missing values', () => {
    assert.throws(() => leaf().parse(['--nope']), UsageError);
    assert.throws(() => leaf().parse(['-z']), UsageError);
    assert.throws(() => leaf().parse(['--output']), /expects a value/);
    assert.throws(() => leaf().parse(['-o']), /expects a value/);
    assert.throws(() => leaf().parse(['--jobs=lots']), /expects a number/);
});

test('absent flags receive their defaults', () => {
    const f = leaf().parse([]).flags;
    assert.equal(f.verbose, false);
    assert.equal(f.output, undefined);
    assert.deepEqual(f.include, []);
});

test('required flags must be supplied', () => {
    const cli = command('c', {
        flags: { name: { type: 'string', required: true } },
        run: () => {},
    });
    assert.throws(() => cli.parse([]), /Missing required option/);
    assert.equal(cli.parse(['--name', 'x']).flags.name, 'x');
});

test('an inline value on a boolean is coerced, not taken literally', () => {
    const cli = () =>
        command('app', {
            flags: {
                verbose: {
                    short: 'v',
                    type: 'boolean',
                    negatable: true,
                    summary: 'v',
                },
            },
            run: () => {},
        });

    // `--flag=value` on a boolean goes through the same coercion as any other
    // value, so it can turn the flag OFF -- unlike the bare `--flag`, which is
    // always true.
    assert.equal(cli().parse(['--verbose=false']).flags.verbose, false);
    assert.equal(cli().parse(['--verbose=true']).flags.verbose, true);
    assert.equal(cli().parse(['-v=true']).flags.verbose, true);

    // The negated form is a switch, not a value flag.
    assert.equal(cli().parse(['--no-verbose']).flags.verbose, false);
    assert.throws(() => cli().parse(['--no-verbose=1']), {
        name: 'UsageError',
        message: /--no-verbose takes no value\./,
    });
});

test('--help and -h ignore an attached value rather than coercing it', () => {
    // The implicit help flag is a boolean that short-circuits; there is nothing
    // for a value to mean, and coercing one would fail on a string.
    const cli = () => command('app', { run: () => {} });
    assert.equal(cli().parse(['--help=anything']).help, true);
    assert.equal(cli().parse(['-h=anything']).help, true);
});
