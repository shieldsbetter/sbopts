// sbopts — an opinionated command-line parser.
//
// Define a command tree with command(); parse with .parse() or dispatch with
// .run(). The opinions are fixed on purpose: --long / -s flags, boolean
// stacking (-abc), repeated values collected as arrays, parent flags inherited
// (and so deferrable) by subcommands, `--` ending parsing, and an auto-built
// --help typeset by termiflo.

export { command, Command } from './command.js';
export { renderHelp } from './help.js';
export { Flag } from './flags.js';
export { DefinitionError, UsageError } from './errors.js';
