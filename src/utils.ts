export function mapsetAdd<K, V>(mapset: Map<K, Set<V>>, key: K, value: V) {
  const set = mapset.get(key);
  if (!set) {
    mapset.set(key, new Set([value]));
  } else {
    set.add(value);
  }
}

export function maparrayPush<K, V>(
  maparray: Map<K, V[]> | WeakMap<any, V[]>,
  key: K,
  value: V
) {
  const set = maparray.get(key);
  if (!set) {
    maparray.set(key, [value]);
  } else {
    set.push(value);
  }
}
export function maparrayDelete<K, V>(
  maparray: Map<K, V[]> | WeakMap<any, V[]>,
  key: K,
  value: V
) {
  const set = maparray.get(key);
  let idx = 0;
  while (set && (idx = set.indexOf(value)) >= 0) {
    set.splice(idx, 1);
  }
}

export function defined<T>(maybeUndef: T | undefined | null): T {
  if (maybeUndef === null || maybeUndef === undefined) {
    const e = new Error("Unexpected " + maybeUndef + " value");
    Error.captureStackTrace(e, defined);
    throw e;
  }
  return maybeUndef;
}

export function invariant(
  assertion: any,
  msg: (() => string) | string = "Invariant failed"
): asserts assertion {
  if (!assertion) {
    const e = new Error(typeof msg === "function" ? msg() : msg);
    Error.captureStackTrace(e, invariant);
    throw e;
  }
}
