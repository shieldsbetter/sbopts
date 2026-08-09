// Flat ESLint config for sbopts — a Node ESM library whose only runtime
// dependency is @shieldsbetter/termiflo, used to typeset --help.
//
// Kept in sync with the sibling projects (termiflo, cardcatalog): ESLint checks
// correctness and import order, Prettier owns formatting, and the two never
// overlap. Running Prettier as a lint rule (eslint-plugin-prettier) was dropped
// because eslint-config-prettier rode along with it and silently switched off
// `curly`, so that rule sat in this config without ever being enforced.
//
// `curly` is deliberately absent rather than re-enabled: the codebase leans on
// brace-less single-line guards (`if (!indent) return '';`) throughout, and
// turning the rule on would rewrite the library against its own style.

import js from '@eslint/js';
import perfectionist from 'eslint-plugin-perfectionist';
import globals from 'globals';

// Local rule: no imports below the first non-import statement. The obvious
// off-the-shelf option (eslint-plugin-import-x) drags in a native resolver
// with per-platform binaries whose optional dependencies npm records
// differently depending on where `npm install` ran, which breaks `npm ci` on
// other platforms. Not worth it for fifteen lines.
const localPlugin = {
    rules: {
        'imports-first': {
            meta: {
                type: 'layout',
                docs: { description: 'Require imports before other code' },
                schema: [],
                messages: {
                    importAfterCode:
                        'Import must appear before any other statement.',
                },
            },
            create(context) {
                return {
                    Program(program) {
                        let sawStatement = false;

                        for (const statement of program.body) {
                            if (statement.type === 'ImportDeclaration') {
                                if (sawStatement) {
                                    context.report({
                                        node: statement,
                                        messageId: 'importAfterCode',
                                    });
                                }
                            } else {
                                sawStatement = true;
                            }
                        }
                    },
                };
            },
        },
    },
};

export default [
    {
        ignores: ['node_modules/', 'coverage/'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
        plugins: {
            local: localPlugin,
            perfectionist,
        },
        rules: {
            // Strict equality everywhere. Null-or-undefined checks go through
            // isNil() (src/util.js) instead of a loose `== null`.
            eqeqeq: ['error', 'always'],

            'local/imports-first': 'error',

            // Whole-module imports first, then destructuring ones, each
            // block alphabetized by module name.
            'perfectionist/sort-imports': [
                'error',
                {
                    type: 'alphabetical',
                    order: 'asc',
                    ignoreCase: true,
                    newlinesBetween: 1,
                    groups: ['default-import', 'named-import', 'unknown'],
                },
            ],
        },
    },
];
