// A small but complete CLI built with sbopts.
//
//   node examples/demo.js commit -a -m 'first'      # -m takes a value (own token)
//   node examples/demo.js commit -av                 # -a -v boolean stack
//   node examples/demo.js -C /tmp commit -m hi      # deferred parent flag
//   node examples/demo.js remote add origin url      # nested subcommands
//   node examples/demo.js build -D a=1 -D b=2         # repeated -> array
//   node examples/demo.js commit --help              # auto help
//   node examples/demo.js run -- --raw -x             # -- passes the rest

import { command } from '../src/index.js';

const cli = command('demo', {
    summary: 'A toy version-control-shaped CLI.',
    description:
        'Demonstrates sbopts: long/short flags, boolean stacking, repeated ' +
        'values as arrays, parent flags inherited by subcommands, -- ' +
        'pass-through, and termiflo-typeset help.',
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
            run: ({ flags, path }) => {
                console.log(`${path.join(' ')}:`, flags);
            },
        },
        build: {
            summary: 'Build targets with key=value definitions.',
            flags: {
                define: {
                    short: 'D',
                    type: 'string',
                    array: true,
                    summary: 'Add a key=value definition (repeatable).',
                },
                jobs: {
                    short: 'j',
                    type: 'number',
                    default: 1,
                    summary: 'Parallel jobs.',
                },
            },
            args: [
                { name: 'target', required: false, summary: 'What to build.' },
            ],
            run: ({ flags, positionals }) => {
                console.log('build', { ...flags, targets: positionals });
            },
        },
        remote: {
            summary: 'Manage the set of tracked repositories.',
            commands: {
                add: {
                    summary: 'Add a remote.',
                    args: [
                        { name: 'name', summary: 'Short name.' },
                        { name: 'url', summary: 'Fetch URL.' },
                    ],
                    run: ({ positionals }) => {
                        console.log('remote add', positionals);
                    },
                },
            },
        },
        run: {
            summary: 'Run a program, forwarding everything after --.',
            run: ({ rest }) => {
                console.log('exec:', rest);
            },
        },
    },
});

cli.run();
