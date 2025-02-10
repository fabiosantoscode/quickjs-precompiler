import { AnyNode } from "./ast/augmented-ast";

export function mapGetOrDefault<K, V>(
  map: Map<K, V> | WeakMap<any, V>,
  key: K,
  orDefault: () => V
) {
  if (map.has(key)) return map.get(key) as V;
  else {
    const newItem = orDefault();
    map.set(key, newItem);
    return newItem;
  }
}

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
  const arr = maparray.get(key);
  if (!arr) return;

  let i = arr.length;
  while (i--) {
    if (arr[i] === value) {
      arr.splice(i, 1);
    }
  }
}

export function defined<T>(maybeUndef: T | void | undefined | null): T {
  if (maybeUndef === null || maybeUndef === undefined) {
    const e = new Error("Expected defined value, got " + maybeUndef);
    Error.captureStackTrace(e, defined);
    throw e;
  }
  return maybeUndef;
}

/** Deep freeze an object to make sure it's not accidentally mutated later */
export function deepFreezeIfTesting<T extends object>(
  object: T,
  _seen = new Set<any>()
): T {
  if (!process.env.JEST_WORKER_ID) return object;

  if ((object as any).type === "Identifier") {
    // Tests do mutate Identifier name
    return object;
  }

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (object as any)[name];

    if (
      ((value && typeof value === "object") || typeof value === "function") &&
      !_seen.has(value)
    ) {
      _seen.add(value);
      deepFreezeIfTesting(value, _seen);
    }
  }

  return Object.freeze(object);
}

export function ofType<T extends { type: string }, TypeStr extends string>(
  maybeUndef: T | { [k: string]: any } | undefined | null,
  type: TypeStr
): Extract<T, { type: TypeStr }> {
  if (maybeUndef === null || maybeUndef === undefined) {
    const e = new Error("Expected defined value, got " + maybeUndef);
    Error.captureStackTrace(e, ofType);
    throw e;
  }
  if (maybeUndef.type !== type) {
    const e = new Error("Expected type " + type + ", got " + maybeUndef.type);
    Error.captureStackTrace(e, ofType);
    throw e;
  }
  return maybeUndef as Extract<T, { type: TypeStr }>;
}

export function asInstance<T>(
  thing: any,
  klass: { new (...args: any[]): T }
): T {
  if (!(thing instanceof klass)) {
    const e = new Error("Expected instance of " + thing.name);
    Error.captureStackTrace(e, asInstance);
    throw e;
  }

  return thing as any as T;
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

export function todo(
  msg: (() => string) | string = "Not implemented",
  atFunction: Function = todo
): never {
  const e = new Error(typeof msg === "function" ? msg() : msg);
  Error.captureStackTrace(e, atFunction);
  throw e;
}

export function unreachable(msg = "Unreachable"): never {
  const e = new Error(msg);
  Error.captureStackTrace(e, unreachable);
  throw e;
}

export function* zip<T1, T2>(t1: T1[], t2: T2[]): Iterable<[T1, T2]> {
  for (let i = 0; i < t1.length; i++) {
    for (let j = 0; j < t2.length; j++) {
      yield [t1[i], t2[j]];
    }
  }
}

export function* withLast<T>(arr: Array<T>): Iterable<[boolean, T]> {
  for (let i = 0; i < arr.length; i++) {
    if (i === arr.length - 1) {
      yield [true, arr[i]];
    } else {
      yield [false, arr[i]];
    }
  }
}

export function* enumerate<T>(arr: Iterable<T>): Iterable<[number, T]> {
  let i = 0;
  for (const it of arr) {
    yield [i, it];
    i += 1;
  }
}

export function getLoc(inp: AnyNode): {
  start: AnyNode["start"];
  end: AnyNode["end"];
  loc: AnyNode["loc"];
  range: AnyNode["range"];
} {
  const { start, end, loc, range } = inp;
  return { start, end, loc, range };
}

export function* iterateReassignable<T>(inp: Array<T>) {
  for (let i = 0; i < inp.length; i++) {
    const reassignable = {
      value: inp[i],
      replace: (newValue: T) => {
        return (inp[i] = reassignable.value = newValue);
      },
      prepend: (...valueBefore: T[]) => {
        inp.splice(i, 0, ...valueBefore);
        i += valueBefore.length;
      },
    };

    yield reassignable;
  }
}

export type SimpleReassignable<V> = {
  value: V;
  replace: (newValue: V) => V;
};
export function createReassignable<
  ObjKey extends keyof Obj,
  Obj extends object
>(obj: Obj, key: ObjKey): SimpleReassignable<Obj[ObjKey]> {
  const reassignable = {
    value: obj[key],
    replace: (newValue: Obj[ObjKey]) => {
      return (obj[key] = reassignable.value = newValue);
    },
  };

  return reassignable;
}
