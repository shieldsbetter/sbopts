import assert from 'node:assert/strict';

import { command } from '../src/command.js';
import { test } from 'node:test';

function cli() {
    return command('app', {
        description: 'Does useful things.',
        flags: { dir: { short: 'C', type: 'string', summary: 'Working dir.' } },
        commands: {
            build: {
                summary: 'Build it.',
                flags: {
                    force: { short: 'f', type: 'boolean', summary: 'Force.' },
                },
                args: [{ name: 'target', summary: 'What to build.' }],
                run: () => {},
            },
        },
    });
}

test('--help and -h short-circuit parsing and report the command in scope', () => {
    const a = cli().parse(['build', '--help']);
    assert.equal(a.help, true);
    assert.deepEqual(a.command.path(), ['app', 'build']);

    const b = cli().parse(['build', '-h']);
    assert.equal(b.help, true);

    // Help before descending reports the parent.
    const c = cli().parse(['--help', 'build']);
    assert.equal(c.help, true);
    assert.deepEqual(c.command.path(), ['app']);
});

test('-h inside a boolean cluster still triggers help', () => {
    const r = cli().parse(['build', '-fh']);
    assert.equal(r.help, true);
});

test('help requested never enforces required flags', () => {
    const c = command('c', {
        flags: { name: { type: 'string', required: true } },
        run: () => {},
    });
    assert.doesNotThrow(() => c.parse(['--help']));
    assert.equal(c.parse(['--help']).help, true);
});

test('rendered help carries usage, sections, and inherited flags', () => {
    const text = cli().subcommands.get('build').help({ width: 72 });
    assert.match(text, /Usage: app build \[options\] <target>/);
    assert.match(text, /Build it\./);
    assert.match(text, /Arguments:/);
    assert.match(text, /What to build\./);
    assert.match(text, /Options:/);
    assert.match(text, /-f, --force\s+Force\./);
    assert.match(text, /-h, --help/);
    // The inherited parent flag shows up as a global option.
    assert.match(text, /Global options:/);
    assert.match(text, /-C, --dir <string>\s+Working dir\./);
});

test('root help lists subcommands and marks <command>', () => {
    const text = cli().help({ width: 72 });
    assert.match(text, /Usage: app \[options\] <command>/);
    assert.match(text, /Commands:/);
    assert.match(text, /build\s+Build it\./);
});

test('a developer-declared --help/-h suppresses the implicit one', () => {
    const c = command('c', {
        flags: { help: { short: 'h', type: 'string', summary: 'mine' } },
        run: () => {},
    });
    // The user's --help takes a value rather than short-circuiting.
    const r = c.parse(['--help', 'x']);
    assert.equal(r.help, false);
    assert.equal(r.flags.help, 'x');
});

test('the default width is the display, capped at 80', () => {
    // No width given: the help asks for 80 and termiflo clamps that to the
    // display. Nothing here reads process.stdout, so the two cases are just
    // "what the block asked for" and "what it was given".
    const wide = cli().help();
    for (const line of wide.split('\n')) {
        assert.ok(
            line.length <= 80,
            `line of ${line.length} columns: ${JSON.stringify(line)}`,
        );
    }
    // An explicit width is honored as the display width, wider than 80 too.
    const narrow = cli().help({ width: 40 });
    assert.ok(Math.max(...narrow.split('\n').map((l) => l.length)) <= 40);
    assert.equal(cli().help({ width: 'auto' }), wide);
});

test('a row with no description renders as an empty second column', () => {
    // `summary` is optional on a flag, and the two-column table still has to
    // be handed a string for the cell.
    const c = command('app', {
        flags: { quiet: { short: 'q', type: 'boolean' } },
        run: () => {},
    });
    const text = c.help({ width: 60 });
    assert.match(text, /-q, --quiet/);
});
