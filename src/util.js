// Small shared helpers. Mirrors termiflo's isNil() convention so that
// null-or-undefined checks read the same across both libraries and the
// `eqeqeq` lint rule never needs a loose `== null`.

/** True for `null` and `undefined`, false for everything else (incl. 0, ''). */
export function isNil(value) {
    return value === null || value === undefined;
}

/** A short flag name is a single ASCII letter or digit: the char after `-`. */
export function isShortName(name) {
    return typeof name === 'string' && /^[A-Za-z0-9]$/.test(name);
}

/** A long flag name is two-or-more chars, kebab-friendly, no leading dash. */
export function isLongName(name) {
    return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9-]*$/.test(name);
}
