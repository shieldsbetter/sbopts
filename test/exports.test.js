import assert from 'node:assert/strict';
import fs from 'node:fs';

import { test } from 'node:test';

import * as sbopts from '../src/index.js';

// The entry point re-exports from the internal modules. Nothing else imports
// it, so without this the public surface could drift -- a rename in a module, a
// missing re-export -- while every other test stayed green.
test('the package entry point exports the documented surface', () => {
    assert.deepEqual(Object.keys(sbopts).sort(), [
        'Command',
        'DefinitionError',
        'Flag',
        'UsageError',
        'command',
        'renderHelp',
    ]);
});

test('the declarations declare exactly what the module exports', () => {
    // The third of the three checks on index.d.ts. `npm run typecheck` proves
    // the file is internally consistent and that the shapes are what a caller
    // sees; nothing there notices a value that exists at runtime and not in the
    // declarations, or the reverse. Only comparing the two lists does.
    const dts = fs.readFileSync(
        new URL('../src/index.d.ts', import.meta.url),
        'utf8',
    );
    const declared = [
        ...dts.matchAll(/^export declare (?:function|const|class) (\w+)/gm),
    ].map((m) => m[1]);

    assert.deepEqual(declared.sort(), Object.keys(sbopts).sort());
});
