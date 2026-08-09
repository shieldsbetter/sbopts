// Auto-generated --help, typeset with termiflo.
//
// The layout is a vertical stack of sections, each only present when it has
// content:
//
//   Usage: app remote add [options] <name> [url]
//
//   <description>
//
//   Arguments:
//     name   The remote's short name
//     url    Its fetch URL
//
//   Commands:
//     add      Add a remote
//     remove   Remove a remote
//
//   Options:
//     -f, --force        Overwrite an existing remote
//     -h, --help         Show this help and exit.
//
//   Global options:
//     -C, --dir <string>   Run as if started in <dir>
//
// "Global options" are the flags inherited from ancestor commands — the ones
// the parser lets you defer past the subcommand name.

import { stack, text, table, stringWidth } from '@shieldsbetter/termiflo';

// A borderless two-column layout with a two-space left gutter. The gutter is
// part of the border (the outer-left separator), not the cell text: indenting
// via leading spaces in a cell wouldn't survive word-wrapping, which drops a
// space at the start of a line.
const COLUMNS = {
    top: null,
    header: null,
    row: null,
    bottom: null,
    body: { left: '  ', mid: '   ', right: '' },
    pad: 0,
};

/** Render one positional arg for the usage line: <required>, [optional], …list. */
function usageArg(arg) {
    const dots = arg.variadic ? '...' : '';
    const required = arg.required !== false;
    const inner = `${arg.name}${dots}`;
    return required ? `<${inner}>` : `[${inner}]`;
}

/** Build the `Usage: …` line for a command from its path, flags, and shape. */
function usageLine(command) {
    const parts = [command.path().join(' ')];
    if (command.effectiveFlags().length > 0) parts.push('[options]');
    if (command.subcommands.size > 0) parts.push('<command>');
    for (const arg of command.args) parts.push(usageArg(arg));
    return parts.join(' ');
}

/**
 * A two-column table: indented left labels, wrapping right descriptions. The
 * label column is pinned to the width of its widest entry so labels never wrap;
 * the description column takes whatever remains and wraps within it.
 */
function twoColumn(rows) {
    const labelWidth = rows.reduce(
        (w, [left]) => Math.max(w, stringWidth(left)),
        0,
    );
    // `rows` is passed through as-is: every caller already hands over strings
    // (Flag and Command both default `summary` to '', and the args path
    // coerces), so the `right ?? ''` that used to sit here could not fire.
    return table(rows, {
        border: COLUMNS,
        // The label column is pinned to its widest entry, so nothing in it
        // has to wrap. (termiflo's `wrap` option is gone; a column that is
        // wide enough for its content never needed it. `align: 'left'` is
        // gone too, as the default, and per-cell options now live in
        // `cellDefaults` rather than on the spec.)
        columns: [{ minWidth: labelWidth }, {}],
    });
}

/** A labelled section: a heading immediately followed by its rows. */
function section(label, rows) {
    return stack([text(label, { marginTop: 1 }), twoColumn(rows)]);
}

/**
 * Render the help text for a command.
 * @param {import('./command.js').Command} command
 * @param {object} [options]
 * @param {number|"auto"} [options.width]  Defaults to min(terminal, 80).
 * @returns {string}
 */
export function renderHelp(command, options = {}) {
    const auto = options.width === undefined || options.width === 'auto';

    const blocks = [text(`Usage: ${usageLine(command)}`, { hangingIndent: 7 })];

    // Long description (falls back to the summary in the Command constructor).
    if (command.description) {
        blocks.push(text(command.description, { marginTop: 1 }));
    }

    if (command.args.length > 0) {
        blocks.push(
            section(
                'Arguments:',
                command.args.map((a) => [a.name, a.summary ?? '']),
            ),
        );
    }

    if (command.subcommands.size > 0) {
        const rows = [...command.subcommands.values()].map((c) => [
            c.name,
            c.summary,
        ]);
        blocks.push(section('Commands:', rows));
    }

    // Options: this command's own flags, plus the implicit --help.
    const optionRows = command
        .ownVisibleFlags()
        .map((f) => [f.invocation(), f.summary]);
    const helpFlag = command.helpFlag();
    if (helpFlag) optionRows.push([helpFlag.invocation(), helpFlag.summary]);
    if (optionRows.length > 0) blocks.push(section('Options:', optionRows));

    // Global options: everything inherited from ancestors.
    const inherited = command.inheritedFlags();
    if (inherited.length > 0) {
        blocks.push(
            section(
                'Global options:',
                inherited.map((f) => [f.invocation(), f.summary]),
            ),
        );
    }

    // Two different questions, and termiflo now has a separate answer for
    // each. `toString(displayWidth)` says how wide the display is; a `width`
    // option says how wide this block wants to be *within* that. So "no wider
    // than 80, but narrower if the terminal is" is a stack that asks for 80 and
    // gets clamped, with no need to read the terminal ourselves. An explicit
    // width is a display width: honored whatever the terminal happens to be.
    return auto ?
            stack(blocks, { width: 80 }).toString()
        :   stack(blocks).toString(options.width);
}
