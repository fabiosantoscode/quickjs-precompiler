// Some assumptions we can make to avoid tricky situations that are hard to compile
// TODO: expose a way to change this through configuration system?


/** Assume that array[x], string[x], string.charCodeAt(x) are always in-bounds **/
export const arrayAccessIsNeverUndefined = true
