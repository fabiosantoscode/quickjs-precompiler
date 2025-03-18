import { invariant, todo, unreachable } from "../utils";
import { TypeMutation } from "./mutation";

/** Expressions will have a TypeVariable, and when some type is known, it will be placed inside. */
export class TypeVariable {
  constructor(public type: Type, public comment?: string) {}

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
  /** Used to implement typeUnion.
   * May call `TypeMutation.recordMutation` to yield a secondary return value. */
  _union(other: Type): Type;
  readProperty?(key: Type): Type;
}

const _ptrIsUnique = new WeakSet();
/** PtrType represents a mutable pointer, but it's immutable. This is the mutable bit. */
export class MutableCell {
  constructor(public type: Type) {
    invariant(!_ptrIsUnique.has(type));
    _ptrIsUnique.add(type);
  }
}

export class PtrType implements Type {
  constructor(public _target: MutableCell) {}
  static fromMutableType(type: Type) {
    return new PtrType(new MutableCell(type));
  }
  get target(): Type {
    return this._target.type;
  }
  asFunction(): FunctionType | undefined {
    return this.target instanceof FunctionType ? this.target : undefined;
  }
  toString() {
    return this._target.type instanceof InvalidType
      ? `Ptr Invalid`
      : this._target.type.toString();
  }
  static deref(t: Type | PtrType): Type {
    return t instanceof PtrType ? t.target : t;
  }
  _isEqual(other: Type): boolean {
    return other instanceof PtrType && other._target === this._target;
  }
  _union(other: Type) {
    let union = typeUnion(this.target, PtrType.deref(other));

    if (typeEqual(union, this.target)) {
      return this;
    } else {
      if (other instanceof PtrType) {
        TypeMutation.recordMutation(other._target, union);
      }
      TypeMutation.recordMutation(this._target, union);
      return this; // will mutate later
    }
  }
  readProperty(prop: Type) {
    return this._target.type.readProperty?.(prop) ?? new InvalidType();
  }
}

export class UnknownType implements Type {
  toString() {
    return "Unknown";
  }
  _isEqual(other: Type): boolean {
    return other instanceof UnknownType;
  }
  _union(other: Type) {
    return other;
  }
}

export class InvalidType implements Type {
  toString() {
    return "Invalid";
  }
  _isEqual(other: Type) {
    return other instanceof InvalidType;
  }
  _union(other: Type) {
    return this;
  }
}

export class NumberType implements Type {
  toString() {
    return "Number";
  }
  _isEqual(other: Type): boolean {
    return other instanceof NumberType;
  }
  _union(other: Type): Type {
    if (other instanceof NumericType) return other;
    if (other instanceof NumberType) return this;
    return new InvalidType();
  }
}

export class NumericType implements Type {
  toString() {
    return "Numeric";
  }
  _isEqual(other: Type) {
    return other instanceof NumericType;
  }
  _union(other: Type) {
    if (other instanceof NumericType) return this;
    if (other instanceof NumberType) return this;
    return new InvalidType();
  }
}

export class StringType implements Type {
  toString() {
    return "String";
  }
  _isEqual(other: Type): boolean {
    return other instanceof StringType;
  }
  _union(other: Type): Type {
    if (other instanceof StringType) return this;
    return new InvalidType();
  }
}

export class BooleanType implements Type {
  toString() {
    return "Boolean";
  }
  _isEqual(other: Type): boolean {
    return other instanceof BooleanType;
  }
  _union(other: Type): Type {
    if (other instanceof BooleanType) return this;
    return new InvalidType();
  }
}

export class UndefinedType implements Type {
  toString() {
    return "Undefined";
  }
  _isEqual(other: Type) {
    return other instanceof UndefinedType;
  }
  _union(other: Type): Type {
    if (other instanceof UndefinedType) return this;
    return new InvalidType();
  }
}

export class NullType implements Type {
  toString() {
    return "Null";
  }
  _isEqual(other: Type) {
    return other instanceof NullType;
  }
  _union(other: Type): Type {
    if (other instanceof NullType) return this;
    return new InvalidType();
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
    if (innerType instanceof InvalidType) {
      unreachable();
    }
  }
  _isEqual(o: Type): boolean {
    return o instanceof OptionalType && this.innerType._isEqual(o.innerType);
  }
  _union(other: Type): Type {
    const innerUnion =
      other instanceof OptionalType
        ? typeUnion(this.innerType, other.innerType)
        : typeUnion(this.innerType, other);
    if (innerUnion instanceof InvalidType) return innerUnion;
    if (innerUnion._isEqual(this.innerType)) return this;
    return new OptionalType(innerUnion);
  }
}

export class FunctionType implements Type {
  private constructor(
    public displayName = "?",
    public params: TupleType | ArrayType = new ArrayType(new UnknownType()),
    public returns: Type = new UnknownType(),
    public identity?: Symbol
  ) {}
  static forASTNode(displayName: string | undefined) {
    return new FunctionType(displayName, undefined, undefined, Symbol());
  }
  static makeArgTypesSetter(types: Type[]) {
    return new FunctionType("?", new TupleType(types), undefined);
  }
  static makeRetTypeSetter(ret: Type) {
    return new FunctionType("?", undefined, ret);
  }
  toString() {
    let ret = !(this.returns instanceof UnknownType)
      ? ": " + this.returns.toString()
      : "";
    return `Function(${this.displayName})${ret}`;
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof FunctionType &&
      typeEqual(this.params, other.params) &&
      typeEqual(this.returns, other.returns)
    );
  }
  _union(other: Type): Type {
    if (other instanceof FunctionType) {
      const params = typeUnion(this.params, other.params);
      const returns = typeUnion(this.returns, other.returns);

      // functions are completely unique
      if (this.identity && other.identity && this.identity !== other.identity) {
        return new InvalidType();
      }

      if (params instanceof InvalidType) {
        return params;
      } else if (returns instanceof InvalidType) {
        return returns;
      } else if (
        typeEqual(params, this.params) &&
        typeEqual(returns, this.returns)
      ) {
        return this;
      } else {
        invariant(params instanceof ArrayType || params instanceof TupleType);
        return new FunctionType(
          this.displayName,
          params,
          returns,
          this.identity || other.identity
        );
      }
    }
    return new InvalidType();
  }
}

export class ObjectType implements Type {
  toString() {
    return `Object`;
  }
  _isEqual(other: Type): boolean {
    todo();
  }
  _union(_other: Type): Type {
    todo();
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
  readProperty(key: Type) {
    if (key instanceof NumberType) {
      return new OptionalType(this.arrayItem);
    } else {
      return new InvalidType();
    }
  }
  nthFunctionParameter(_n: number): Type | null {
    return this.arrayItem;
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof ArrayType && typeEqual(other.arrayItem, this.arrayItem)
    );
  }
  _union(other: Type): ArrayType | TupleType | InvalidType {
    if (other instanceof TupleType) {
      return other._union(this);
    }
    if (other instanceof ArrayType) {
      const inside = typeUnion(this.arrayItem, other.arrayItem);
      if (inside instanceof InvalidType) return inside;
      else if (inside._isEqual(this.arrayItem)) return this;
      else return new ArrayType(inside);
    }
    return new InvalidType();
  }
}

/** Array type used for fixed-length array returns as well as function args */
export class TupleType implements Type {
  constructor(public items: Type[]) {}
  toString() {
    return `Tuple [${this.items.map((c) => c.toString()).join(", ")}]`;
  }
  readProperty(key: Type) {
    if (key instanceof NumberType) {
      const union = typeUnionAll(this.items);
      return union instanceof InvalidType ? union : new OptionalType(union);
    } else {
      return new InvalidType();
    }
  }
  nthFunctionParameter(n: number): Type | undefined {
    invariant(n >= 0);
    return this.items.at(n);
  }
  _isEqual(other: Type): boolean {
    return (
      other instanceof TupleType && typeArrayEqual(this.items, other.items)
    );
  }
  _union(other: Type): TupleType | ArrayType | InvalidType {
    if (other instanceof TupleType) {
      const unionized = typeArrayUnion(this.items, other.items);
      if (unionized instanceof InvalidType) return unionized;
      if (unionized === this.items) return this;
      if (unionized === other.items) return other;
      return new TupleType(unionized);
    }
    if (other instanceof ArrayType) {
      if (other.arrayItem instanceof UnknownType) {
        // an array of unknown length is a placeholder-array. It can become a tuple.
        return this;
      }
      const content = typeUnionAll([...this.items, other.arrayItem]);
      if (content instanceof InvalidType) return content;
      if (content === other.arrayItem) return other;
      return new ArrayType(content);
    }
    return new InvalidType();
  }
}

const typeArrayUnion = (me: Type[], they: Type[]): Type[] | InvalidType => {
  if (me.length !== they.length) return new InvalidType();
  let reuse = true;
  const out: Type[] = [];
  for (let i = 0; i < me.length; i++) {
    const u = typeUnion(me[i], they[i]);
    if (u instanceof InvalidType) return u;
    if (reuse) reuse = u._isEqual(they[i]);
    out.push(u);
  }
  return reuse ? me : out;
};

export function typeUnion(t1: Type, t2: Type): Type {
  if (Object.getPrototypeOf(t1) !== Object.getPrototypeOf(t2)) {
    if (t1 instanceof UnknownType) return t2;
    if (t2 instanceof UnknownType) return t1;
    if (t1 instanceof PtrType) return t1._union(t2);
    if (t2 instanceof PtrType) return t2._union(t1);
    if (t1 instanceof InvalidType) return t2._union(t1);
    if (t2 instanceof InvalidType) return t1._union(t2);
    if (t1 instanceof UndefinedType) return new OptionalType(t2);
    if (t2 instanceof UndefinedType) return new OptionalType(t1);
    if (t1 instanceof OptionalType) return t1._union(new OptionalType(t2));
    if (t2 instanceof OptionalType) return t2._union(new OptionalType(t1));
  }
  return t1._union(t2);
}

export function typeUnionAll(types: Type[]) {
  if (types.length) {
    return types.reduce((a, b) => typeUnion(a, b));
  } else {
    return new InvalidType();
  }
}

export function typeEqual(t1: Type, t2: Type) {
  return t1._isEqual(t2);
}

function typeArrayEqual(t1: Type[], t2: Type[]) {
  return t1.length === t2.length && t1.every((t1, i) => typeEqual(t1, t2[i]));
}
