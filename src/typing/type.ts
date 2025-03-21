import { arrayAccessIsNeverUndefined } from "../assumptions";
import { invariant, todo, unreachable } from "../utils";
import { TypeMutation } from "./mutation";

/** Expressions will have a TypeVariable, and when some type is known, it will be placed inside. */
export class TypeVariable {
  constructor(public type: Type, public comment?: string) {}

  get validType() {
    if (this.type instanceof InvalidType || this.type instanceof UnknownType) {
      return null
    } else {
      return this.type
    }
  }

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
  readProperty?(key: Type | string): Type;
  _writeProperty?(key: Type | string, value: Type): Type;
  /** Inject args info into the function (returns the function) */
  _withArgs?(args: Type[]): Type
  /** Inject args info into a method (returns the object) */
  _withMethodArgs?(methodName: string, args: Type[]): Type
  /** Get return value from function. Invalid arguments can return InvalidType */
  getRet?(args: Type[]): Type
  /** Get return value from method. Invalid arguments can return InvalidType */
  getMethodRet?(methodName: string, args: Type[]): Type
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
  get validTarget() {
    if (this._target.type instanceof InvalidType || this._target.type instanceof UnknownType) {
      return null
    } else {
      return this._target.type
    }
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
  readProperty(prop: Type | string) {
    return this._target.type.readProperty?.(prop) ?? new InvalidType();
  }
  writeProperty(prop: Type | string, value: Type) {
    const withProp = (this._target.type._writeProperty?.(prop, value))
      ?? new InvalidType()

    TypeMutation.recordMutation(this._target, withProp)
    return this
  }

  // Function return types (custom and native functions and methods)
  getFunctionRet(withArgs: Type[]): Type {
    return this._target.type.getRet?.(withArgs) ?? new UnknownType()
  }
  getMethodRet(methodName: string, withArgs: Type[]): Type {
    return this._target.type.getMethodRet?.(methodName, withArgs) ?? new UnknownType()
  }
  setFunctionRet(ret: Type): Type {
    // Only called by a TypeDependency that gets the funcret from the ret statements
    if (this._target.type instanceof FunctionType) {
      TypeMutation.recordMutation(this._target, this._target.type._withRet(ret))
    }
    return this
  }

  // Function arg types (copied into custom, and validated against native)
  setFunctionArgs(newArgs: Type[]): Type {
    if (this._target.type._withArgs) {
      TypeMutation.recordMutation(this._target, this._target.type._withArgs(newArgs))
    }
    return this
  }
  setMethodArgs(methodName: string, newArgs: Type[]): Type {
    if (this._target.type._withMethodArgs) {
      TypeMutation.recordMutation(this._target, this._target.type._withMethodArgs(methodName, newArgs))
    }
    return this
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
  constructor(public comment?: string) {}
  toString() {
    return "Invalid";
  }
  _isEqual(other: Type) {
    return other instanceof InvalidType;
  }
  _union(other: Type) {
    return this;
  }
  readProperty(prop: Type | string) {
    return new InvalidType()
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
  readProperty(propName: string | Type) {
    switch (propName) {
      case "length": return new NumberType();
    }
    return new InvalidType('Unknown String property ' + propName);
  }
  _withMethodArgs(methodName: string, withArgs: Type[]): Type {
    switch (methodName) {
      case "slice":
      case "charCodeAt":
        return this
    }
    return new InvalidType()
  }
  getMethodRet(methodName: string, args: Type[]): Type {
    switch (methodName) {
      case "slice": {
        const validArgs =
          args.length <= 2 && args.every(a => a instanceof NumberType);
        if (validArgs) {
          return new StringType();
        } else {
          return new UnknownType()
        }
      }
      case "charCodeAt": {
        invariant(arrayAccessIsNeverUndefined);
        if (args.length === 1 && args[0] instanceof NumberType) {
          return new NumberType();
        } else {
          return new UnknownType()
        }
      }
    }
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
      // TODO do we need this complex union stuff?
      // Use an assertion to make sure it's never triggered, then delete

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
  _withArgs(args: Type[]): Type {
    const joinedArgs = typeUnion(this.params, new TupleType(args))
    if (joinedArgs instanceof TupleType || joinedArgs instanceof ArrayType) {
      return new FunctionType(
        this.displayName,
        joinedArgs,
        this.returns,
        this.identity,
      )
    }
    return joinedArgs // invalid or unknown
  }
  _withMethodArgs(methodName: string, newArgs: Type[]): Type {
    switch (methodName) {
      case "call": {
        if (newArgs.length > 1) {
          return this._withArgs(newArgs.slice(1)) // TODO thisValue
        }
        else break
      }
      case "apply": {
        if (newArgs.length === 2 && newArgs[1] instanceof TupleType) {
          // TODO thisValue
          return this._withArgs(newArgs[1].items)
        }
        else break
      }
    }
    return new UnknownType()
  }
  getRet(whenArgs: Type[]): Type {
    const joined = typeUnion(this.params, new TupleType(whenArgs))
    if (!(joined instanceof InvalidType)) {
      return this.returns
    } else {
      return joined
    }
  }
  getMethodRet(methodName: string, whenArgs: Type[]) {
    switch (methodName) {
      case "call": {
        if (whenArgs.length > 1) {
          return this.getRet(whenArgs.slice(1)) // TODO thisValue
        }
        else break
      }
      case "apply": {
        if (whenArgs.length === 2 && whenArgs[1] instanceof TupleType) {
          // TODO thisValue
          return this.getRet(whenArgs[1].items)
        }
        else break
      }
    }
    return new UnknownType()
  }
  _withRet(retType: Type) {
    const joinedRetVal = typeUnion(this.returns, retType)
    if (isValidType(joinedRetVal)) {
      return new FunctionType(
        this.displayName,
        this.params,
        joinedRetVal,
        this.identity,
      )
    }
    return joinedRetVal // invalid or unknown
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
  constructor(public arrayItem: Type) {
    invariant(!(this.arrayItem instanceof InvalidType))
  }
  toString() {
    return `Array ${this.arrayItem.toString()}`;
  }
  readProperty(key: Type | string) {
    if (key instanceof NumberType) {
      if (arrayAccessIsNeverUndefined) {
        return this.arrayItem;
      } else {
        return new OptionalType(this.arrayItem);
      }
    } else if (key === 'length') {
      return new NumberType()
    } else {
      return new InvalidType();
    }
  }
  _writeProperty(key: Type | string, value: Type) {
    if (key instanceof NumberType || Number.isInteger(+key)) {
      return this._union(new ArrayType(value))
    } else if (key === 'length') {
      return this // just a resize
    } else {
      return new InvalidType()
    }
  }
  getMethodRet(methodName: string, withArgs: Type[]): Type {
    if (this.arrayItem instanceof InvalidType) {
      unreachable()
    }
    const doNothing = new UnknownType()

    if (this.arrayItem instanceof UnknownType) {
      return doNothing
    }

    switch (methodName) {
      case "slice": {
        if (withArgs.length <= 2 && withArgs.every(a => a instanceof NumberType)) {
          return this
        }
        return doNothing
      }
      case "push": {
        const pushedType = withArgs.length ? typeUnionAll(withArgs) : new UndefinedType()
        const newInnerType = typeUnion(pushedType, this.arrayItem)
        return isValidType(newInnerType) ? new NumberType() : newInnerType
      }
    }

    return doNothing
  }
  _withMethodArgs(methodName: string, withArgs: Type[]): Type {
    if (this.arrayItem instanceof InvalidType) {
      unreachable()
    }
    const unknownContents = this.arrayItem instanceof UnknownType
    const doNothing = this

    switch (methodName) {
      case "slice": {
        return unknownContents ? doNothing : new ArrayType(this.arrayItem)
      }
      case "push": {
        const pushed = withArgs.length ? typeUnionAll(withArgs) : new UndefinedType()
        const pushedT = typeUnion(this.arrayItem, pushed)
        return isValidType(pushedT) ? new ArrayType(pushedT) : pushedT
      }
    }

    return doNothing
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
      if (union instanceof InvalidType) return union
      if (arrayAccessIsNeverUndefined) return union
      return new OptionalType(union)
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

export function isValidType(t1: Type | undefined | null): boolean {
  if (!t1) return false
  return !(t1 instanceof UnknownType || t1 instanceof InvalidType)
}

function typeArrayEqual(t1: Type[], t2: Type[]) {
  return t1.length === t2.length && t1.every((t1, i) => typeEqual(t1, t2[i]));
}
