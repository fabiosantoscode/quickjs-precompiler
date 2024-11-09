import { AnyNode } from "./precompiler/augmented-ast";

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
    const e = new Error("Expected defined value, got " + maybeUndef);
    Error.captureStackTrace(e, defined);
    throw e;
  }
  return maybeUndef;
}

export function ofType<T extends { type: TypeStr }, TypeStr extends string>(
  maybeUndef: T | { [x: string]: any } | undefined | null,
  type: TypeStr
): T {
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
  return maybeUndef as T;
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

export function* zip<T1, T2>(t1: T1[], t2: T2[]): Iterable<[T1, T2]> {
  for (let i = 0; i < t1.length; i++) {
    for (let j = 0; j < t2.length; j++) {
      yield [t1[i], t2[j]];
    }
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
        inp[i] = reassignable.value = newValue;
      },
    };

    yield reassignable;
  }
}

type ObjectWithKey<ObjKey extends number | string | symbol, Val> = {
  [k in ObjKey]: Val;
};

export function createReassignable<
  Val,
  ObjKey extends number | string | symbol,
  Obj extends ObjectWithKey<ObjKey, Val>
>(obj: Obj, key: ObjKey) {
  const reassignable = {
    value: obj[key],
    replace: (newValue: Obj[ObjKey]) => {
      obj[key] = reassignable.value = newValue;
    },
  };

  return reassignable;
}
