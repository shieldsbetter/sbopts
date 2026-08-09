import assert from 'node:assert/strict';

import { DefinitionError } from '../src/errors.js';
import { Flag, normalizeFlags } from '../src/flags.js';
import { test } from 'node:test';

test('defaults: type is boolean, presence-only', () => {
    const f = new Flag('verbose', {});
    assert.equal(f.type, 'boolean');
    assert.equal(f.takesValue, false);
    assert.equal(f.defaultValue(), false);
});

test('array flags default to an empty array', () => {
    const f = new Flag('include', { type: 'string', array: true });
    assert.deepEqual(f.defaultValue(), []);
});

test('an explicit default wins over the type default', () => {
    const f = new Flag('jobs', { type: 'number', default: 4 });
    assert.equal(f.defaultValue(), 4);
});

test('number coercion rejects non-numbers', () => {
    const f = new Flag('jobs', { type: 'number' });
    assert.equal(f.coerce('8'), 8);
    assert.throws(() => f.coerce('lots'), /expects a number/);
});

test('boolean coercion only accepts true/false (the --flag=value form)', () => {
    const f = new Flag('color', { type: 'boolean' });
    assert.equal(f.coerce('true'), true);
    assert.equal(f.coerce('false'), false);
    assert.throws(() => f.coerce('yes'), /boolean/);
});

test('choices are enforced after coercion', () => {
    const f = new Flag('level', { type: 'string', choices: ['low', 'high'] });
    assert.equal(f.coerce('low'), 'low');
    assert.throws(() => f.coerce('mid'), /must be one of/);
});

test('invocation strings render the alias and value placeholder', () => {
    assert.equal(
        new Flag('verbose', { short: 'v' }).invocation(),
        '-v, --verbose',
    );
    assert.equal(
        new Flag('output', { short: 'o', type: 'string' }).invocation(),
        '-o, --output <string>',
    );
    // No short alias: the long name lines up under where the short would be.
    assert.equal(new Flag('quiet', {}).invocation(), '    --quiet');
});

test('definition errors: bad type, bad short, dup short, bad negatable', () => {
    assert.throws(() => new Flag('x', { type: 'json' }), DefinitionError);
    assert.throws(() => new Flag('x', { short: 'xy' }), DefinitionError);
    assert.throws(
        () => new Flag('count', { type: 'number', negatable: true }),
        DefinitionError,
    );
    assert.throws(
        () =>
            normalizeFlags({
                foo: { short: 'f' },
                far: { short: 'f' },
            }),
        /claimed by both/,
    );
});

test('a flag name that is not a long name is a definition error', () => {
    // Caught while building the CLI, not while parsing a user's argv.
    for (const bad of ['1st', '-leading', 'has space', '']) {
        assert.throws(
            () => new Flag(bad, {}),
            { name: 'DefinitionError', message: /Invalid flag name/ },
            `expected ${JSON.stringify(bad)} to be rejected`,
        );
    }
});

test('required and default together are a definition error', () => {
    // Contradictory by construction: the parser checks `required` first, so the
    // default was unreachable and one of the two options quietly did nothing.
    assert.throws(
        () => new Flag('out', { type: 'string', required: true, default: 'x' }),
        {
            name: 'DefinitionError',
            message: /required and also has a default/,
        },
    );
    // `default: undefined` still counts as declaring one -- `'default' in spec`
    // is the test, so writing the key at all is a statement of intent.
    assert.throws(
        () =>
            new Flag('out', {
                type: 'string',
                required: true,
                default: undefined,
            }),
        { name: 'DefinitionError' },
    );
    // Either alone is fine.
    assert.ok(new Flag('out', { type: 'string', required: true }));
    assert.ok(new Flag('out', { type: 'string', default: 'x' }));
});
