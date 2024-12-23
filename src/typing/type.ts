import { Function } from "../ast/augmented-ast";
import { invariant, ofType } from "../utils";
import { TypeEnvironment } from "./type-environment";

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
  nullish?: true;
  specificValue?: number | string | boolean;
  extends(other: Type): boolean;
  /** "false" doesn't always mean "not equal".
   * This is just an optimization to avoid overly copying. */
  _shouldReuse(other: Type): boolean;
  /** used to implement typeUnion */
  _union(other: Type): Type | undefined;
}

export class NumberType implements Type {
  constructor(public specificValue?: number) {}
  toString() {
    return (
      "Number" + (this.specificValue != null ? ` ${this.specificValue}` : "")
    );
  }
  extends(other: Type): boolean {
    if (other instanceof NumberType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
  _shouldReuse(other: Type): boolean {
    return (
      other instanceof NumberType && other.specificValue === this.specificValue
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NumericType) return other;
    if (other instanceof NumberType) {
      return other.specificValue === this.specificValue
        ? this
        : new NumberType();
    }
  }
}

export class NumericType implements Type {
  toString() {
    return "Numeric";
  }
  extends(other: Type): boolean {
    return other instanceof NumericType || other instanceof NumberType;
    // TODO: other instanceof BigIntType
  }
  _shouldReuse(other: Type) {
    return other instanceof NumericType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NumericType || other instanceof NumberType) {
      return this;
    }
  }
}

export class StringType implements Type {
  constructor(public specificValue?: string) {}
  toString() {
    return (
      "String" +
      (this.specificValue != null
        ? ` ${JSON.stringify(this.specificValue)}`
        : "")
    );
  }
  extends(other: Type): boolean {
    if (other instanceof StringType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
  _shouldReuse(other: Type): boolean {
    return (
      other instanceof StringType && other.specificValue === this.specificValue
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof StringType) {
      return this.specificValue === other.specificValue
        ? this
        : new StringType();
    }
  }
}

export class BooleanType implements Type {
  constructor(public specificValue?: boolean) {}
  toString() {
    return (
      "Boolean" + (this.specificValue != null ? ` ${this.specificValue}` : "")
    );
  }
  extends(other: Type): boolean {
    if (other instanceof BooleanType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
  _shouldReuse(other: Type): boolean {
    return (
      other instanceof BooleanType && other.specificValue === this.specificValue
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof BooleanType) {
      return this.specificValue === other.specificValue
        ? this
        : new BooleanType();
    }
  }
}

export class UndefinedType implements Type {
  extends(other: Type): boolean {
    return other instanceof UndefinedType;
  }
  _shouldReuse(other: Type) {
    return other instanceof UndefinedType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof UndefinedType) {
      return this;
    }
  }

  get nullish() {
    return true as true;
  }
  toString() {
    return "Undefined";
  }
}

export class NullType implements Type {
  extends(other: Type): boolean {
    return other instanceof NullType;
  }
  _shouldReuse(other: Type) {
    return other instanceof NullType;
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NullType) {
      return this;
    }
  }

  get nullish() {
    return true as true;
  }
  toString() {
    return "Null";
  }
}

export class NullableType implements Type {
  constructor(public innerType: Type) {
    if (innerType instanceof NullableType) {
      return innerType;
    }
  }
  toString() {
    return `Nullable ${this.innerType.toString()}`;
  }
  extends(other: Type): boolean {
    invariant(false, "TODO is extends() unused? delete it");
  }
  _shouldReuse(other: Type) {
    return (
      other instanceof NullableType &&
      this.innerType._shouldReuse(other.innerType)
    );
  }
  _union(other: Type): Type | undefined {
    if (other instanceof NullableType) {
      const union = this.innerType._union(other.innerType);
      if (union) {
        return union._shouldReuse(this.innerType)
          ? this
          : new NullableType(union);
      }
    }
  }
}

export class FunctionType implements Type {
  returns: TypeVariable;
  params?: TypeVariable[];

  constructor(public functionNode: Function) {
    this.returns = new TypeVariable(
      undefined,
      (functionNode.id?.uniqueName || "function") + " return type"
    );
  }
  /** get parameters IIF function only has identifier params */
  getParams(env: TypeEnvironment) {
    return new Map(
      this.functionNode.params.map((param) => {
        const name = ofType(param, "Identifier").uniqueName;
        return [name, env.getBindingType(name)];
      })
    );
  }
  toString() {
    const name = this.functionNode.id?.uniqueName || "?";
    let ret = this.returns.type ? ": " + this.returns.type.toString() : "";
    return `Function(${name})${ret}`;
  }
  extends(other: Type): boolean {
    return (
      other instanceof FunctionType && other.functionNode === this.functionNode
    );
  }
  _shouldReuse(other: Type): boolean {
    return other === this; // Function types are always unique
  }
  _union(_other: Type): Type | undefined {
    return undefined; // messy repercussions
  }
}

export class ObjectType implements Type {
  toString() {
    return `Object`;
  }
  extends(other: Type): boolean {
    return other instanceof ObjectType;
  }
  _shouldReuse(other: Type) {
    return other === this; // Object types are always unique
  }
  _union(_other: Type): Type | undefined {
    return undefined; // messy repercussions
  }
}

export function typeUnion(t1: Type, t2: Type): Type | undefined {
  if (Object.getPrototypeOf(t1) !== Object.getPrototypeOf(t2)) {
    if (t1.nullish && !t2.nullish) return new NullableType(t2);
    if (t2.nullish && !t1.nullish) return new NullableType(t1);
    if (t1 instanceof NullableType) return t1._union(new NullableType(t2));
    if (t2 instanceof NullableType) return t2._union(new NullableType(t1));
  }
  return t1._union(t2);
}

export function typeAnyOf(types: (Type | undefined)[]) {
  if (types.length) {
    return types.reduce((a, b) => a && b && typeUnion(a, b));
  } else {
    return undefined;
  }
}
