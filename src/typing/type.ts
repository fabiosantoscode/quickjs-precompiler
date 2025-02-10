import { invariant, todo, unreachable } from "../utils";

/** Expressions will have a TypeVariable, and when some type is known, it will be placed inside. */
export class TypeVariable {
  constructor(public type?: Type, public comment?: string) {}

  [Symbol.for("nodejs.util.inspect.custom")]() {
    let ret = `TypeVariable(`;
    if (this.comment) ret += `'${this.comment}' = `;
    if (this.type) ret += `${this.type.toString()}`;
    else ret += `unknown`;
    ret += ")";
    return ret;
  }
}

/** Types can be simple types (IE Just the number 3) or complex types (IE this type is Number or String).
 * One can think of a Type as the set of all things that would fit it.
 */
export interface Type {
  toString(): string;
  _isEqual(other: Type): boolean;
  /** used to implement typeUnion */
  _union(other: Type): Type | undefined;
}

const _ptrIsUnique = new WeakSet();
export class PtrType implements Type {
  constructor(public target?: Type) {
    invariant(target);
    invariant(!_ptrIsUnique.has(target));
    _ptrIsUnique.add(target);
  }
  get asFunction(): FunctionType | undefined {
    return this.target instanceof FunctionType ? this.target : undefined;
  }
  toString() {
    if (this.target == null) return `Ptr Invalid`;
    return this.target.toString();
  }
  static deref(t: Type | PtrType | undefined): Type | undefined {
    return t instanceof PtrType ? t.target : t;
  }
  _isEqual(other: Type): boolean {
    return other instanceof PtrType && other === this;
  }
  _union(other: Type): Type | undefined {
    if (other == null) {
      this.target = undefined;
      return this;
    }

    // Mutate the ptr
    if (other instanceof PtrType) {
      const union = typeUnionRequired(this.target, other.target);
      this.target = other.target = union;
    } else {
      this.target = typeUnionRequired(this.target, other);
    }

    if (this.target && !(this.target instanceof FunctionType)) {
      console.log(this.target);
      invariant(false);
    }

    return this;
  }
}

export class UnknownType implements Type {
  toString() {
    return "Unknown";
  }
  _isEqual(other: Type): boolean {
    return other instanceof UnknownType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof UnknownType) return this;
    else return other;
  }
}

export class NumberType implements Type {
  toString() {
    return "Number";
  }
  _isEqual(other: Type): boolean {
    return other instanceof NumberType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NumericType) return other;
    if (other instanceof NumberType) return this;
  }
}

export class NumericType implements Type {
  toString() {
    return "Numeric";
  }
  _isEqual(other: Type) {
    return other instanceof NumericType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NumericType) return this;
    if (other instanceof NumberType) return this;
  }
}

export class StringType implements Type {
  toString() {
    return "String";
  }
  _isEqual(other: Type): boolean {
    return other instanceof StringType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof StringType) return this;
  }
}

export class BooleanType implements Type {
  toString() {
    return "Boolean";
  }
  _isEqual(other: Type): boolean {
    return other instanceof BooleanType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof BooleanType) return this;
  }
}

export class UndefinedType implements Type {
  toString() {
    return "Undefined";
  }
  _isEqual(other: Type) {
    return other instanceof UndefinedType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof UndefinedType) return this;
  }
}

export class NullType implements Type {
  toString() {
    return "Null";
  }
  _isEqual(other: Type) {
    return other instanceof NullType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NullType) return this;
  }
}

export class OptionalType implements Type {
  toString() {
    return `Optional ${this.innerType.toString()}`;
  }
  constructor(public innerType: Type) {
    invariant(innerType);
    if (innerType instanceof OptionalType) {
      return innerType;
    }
  }
  _isEqual(o: Type): boolean {
    return o instanceof OptionalType && this.innerType._isEqual(o.innerType);
  }
  _union(other: Type): Type | undefined {
    if (other instanceof OptionalType) {
      const innerUnion = typeUnionRequired(this.innerType, other.innerType);
      if (innerUnion?._isEqual(this.innerType)) return this;
      if (innerUnion != null) return new OptionalType(innerUnion);
      else return undefined;
    } else {
      const innerUnion = typeUnionRequired(this.innerType, other);
      if (innerUnion?._isEqual(this.innerType)) return this;
      if (innerUnion != null) return new OptionalType(innerUnion);
      else return undefined;
    }
  }
}

export class PartialFunctionType implements Type {
  constructor(public params?: TupleType | ArrayType, public returns?: Type) {}
  toString() {
    const contents = [];
    if (this.params) contents.push(`params=${this.params.toString()}`);
    if (this.returns) contents.push(`returns=${this.returns.toString()}`);
    return `PartialFunction(${contents.join(", ")})`;
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof PartialFunctionType &&
      isEqual((other as PartialFunctionType).params, this.params) &&
      isEqual((other as PartialFunctionType).returns, this.returns)
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof PartialFunctionType) {
      const [paramsError, params] = typeUnionOptional(
        this.params,
        (other as PartialFunctionType).params
      );
      const [returnsError, returns] = typeUnionOptional(
        this.returns,
        (other as PartialFunctionType).returns
      );

      if (!paramsError && !returnsError) {
        return new PartialFunctionType(params as ArrayType, returns);
      } else {
        return undefined;
      }
    }

    if (other instanceof PtrType || other instanceof FunctionType) {
      return typeUnion(other, this);
    }
  }
}

export class FunctionType implements Type {
  constructor(
    public displayName = "?",
    public params: TupleType | ArrayType,
    public returns: Type
  ) {}
  toString() {
    let ret = !(this.returns instanceof UnknownType)
      ? ": " + this.returns.toString()
      : "";
    return `Function(${this.displayName})${ret}`;
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof FunctionType &&
      other.params._isEqual(this.params) &&
      other.returns._isEqual(this.returns)
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof FunctionType) {
      return other === this ? this : undefined;
    }
    if (other instanceof PartialFunctionType) {
      const [, params] = typeUnionOptional(
        this.params,
        (other as PartialFunctionType).params
      );
      const [, returns] = typeUnionOptional(
        this.returns,
        (other as PartialFunctionType).returns
      );

      if (!params || !returns) {
        return undefined;
      } else if (
        params._isEqual(this.params) &&
        returns._isEqual(this.returns)
      ) {
        return this;
      } else {
        invariant(params instanceof ArrayType || params instanceof TupleType);
        return new FunctionType(this.displayName, params, returns);
      }
    }
    return undefined;
  }
}

export class ObjectType implements Type {
  toString() {
    return `Object`;
  }
  _isEqual(other: Type): boolean {
    todo();
  }
  _union(_other: Type): Type | undefined {
    return undefined; // messy repercussions
  }
}

export class ArrayType implements Type {
  constructor(public arrayItem: Type) {}
  toString() {
    if (this.arrayItem instanceof UnknownType) {
      return `Array`;
    } else {
      return `Array ${this.arrayItem.toString()}`;
    }
  }
  readProperty(key: Type): Type | null {
    if (key instanceof NumberType) {
      return new OptionalType(this.arrayItem);
    } else {
      return null;
    }
  }
  nthFunctionParameter(_n: number): Type | null {
    return this.arrayItem;
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof ArrayType && other.arrayItem._isEqual(this.arrayItem)
    );
  }
  _union(other: Type): ArrayType | TupleType | undefined {
    if (other instanceof TupleType) return other._union(this);
    if (other instanceof ArrayType) {
      const inside = typeUnionRequired(this.arrayItem, other.arrayItem);
      if (inside?._isEqual(this.arrayItem)) return this;
      if (inside == null) return undefined;
      else return new ArrayType(inside);
    }
  }
}

/** Array type used for fixed-length array returns as well as function args */
export class TupleType implements Type {
  constructor(public items: Type[]) {}
  toString() {
    if (this.items == null) return `Tuple [?...]`;
    return `Tuple [${this.items.map((c) => c.toString()).join(", ")}]`;
  }
  readProperty(key: Type): Type | null {
    if (key instanceof NumberType) {
      if (this.items == null) return new UnknownType();
      return typeAnyOf(this.items) || null;
    } else {
      return null;
    }
  }
  nthFunctionParameter(n: number): Type | null {
    if (n > 0 && n < this.items.length) {
      return this.items[n] ?? null;
    } else {
      return null;
    }
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof TupleType && typeArrayEqual(this.items, other.items)
    );
  }
  _union(other: Type): TupleType | ArrayType | undefined {
    if (other instanceof TupleType) {
      if (!this.items) return other;
      const unionized = typeArrayUnion(this.items, other.items);
      if (unionized == null) return undefined;
      if (unionized === other.items) return other;
      return new TupleType(unionized);
    }
    if (other instanceof ArrayType) {
      if (!this.items) return other;
      const content = typeUnion(typeAnyOf(this.items), other.arrayItem);
      if (content == null) return undefined;
      if (content === other.arrayItem) return other;
      return new ArrayType(content);
    }
  }
}

const typeArrayUnion = (
  me: Type[] | undefined,
  they: Type[] | undefined
): Type[] | undefined => {
  if (me == null || they == null) return undefined;
  if (me.length !== they.length) return undefined;
  let reuse = true;
  const out: Type[] = [];
  for (let i = 0; i < me.length; i++) {
    const u = typeUnion(me[i], they[i]);
    if (u == null) return undefined;
    if (reuse) reuse = u._isEqual(they[i]);
    out.push(u);
  }
  return reuse ? me : out;
};

export function typeUnionOptional(
  t1: Type | undefined,
  t2: Type | undefined
): [boolean, Type | undefined] | [false, undefined] {
  if (t1 == null && t2 == null) return [false, undefined];
  if (t1 == null || t2 == null) return [false, t1 || t2];
  const u = typeUnion(t1, t2);
  return [u == null, u];
}

export function typeUnionRequired(
  t1: Type | undefined,
  t2: Type | undefined
): Type | undefined {
  if (t1 == null || t2 == null) return undefined;
  return typeUnion(t1, t2);
}

export function typeUnion(
  t1: Type | undefined,
  t2: Type | undefined
): Type | undefined {
  if (t1 == null || t2 == null) return t1 || t2;
  if (Object.getPrototypeOf(t1) !== Object.getPrototypeOf(t2)) {
    if (t1 instanceof UndefinedType) return new OptionalType(t2);
    if (t2 instanceof UndefinedType) return new OptionalType(t1);
    if (t1 instanceof OptionalType) return t1._union(new OptionalType(t2));
    if (t2 instanceof OptionalType) return t2._union(new OptionalType(t1));
    if (t1 instanceof PtrType) return t1._union(t2);
    if (t2 instanceof PtrType) return t2._union(t1);
    if (t1 instanceof UnknownType) return t2;
    if (t2 instanceof UnknownType) return t1;
  }
  return t1._union(t2);
}

export function typeAnyOf(types: (Type | undefined)[] | undefined) {
  if (types?.length) {
    return types.reduce((a, b) => a && b && typeUnion(a, b));
  } else {
    return undefined;
  }
}

export function typeEqual(t1: Type | undefined, t2: Type | undefined) {
  if (t1 == null || t2 == null) return t1 == t2;
  return t1._isEqual(t2);
}

function typeArrayEqual(t1: Type[] | undefined, t2: Type[] | undefined) {
  if (t1 == null || t2 == null) return t1 == t2;
  return t1.length === t2.length && t1.every((t1, i) => t1._isEqual(t2[i]));
}

function isEqual(a: Type | undefined, b: Type | undefined): boolean {
  if (a && b) return a._isEqual(b);
  if (!a && !b) return true;
  return false;
}
