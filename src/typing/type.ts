import {
  ArrowFunctionExpression,
  FunctionExpression,
} from "../ast/augmented-ast";
import { invariant } from "../utils";

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
  specificValue?: number | string | boolean;
  extends(other: Type): boolean;
}

export class NumberType implements Type {
  constructor(public specificValue?: number) {}
  toString() {
    return "Number";
  }
  extends(other: Type): boolean {
    if (other instanceof NumberType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
}

export class NumericType implements Type {
  constructor() {}
  toString() {
    return "Numeric";
  }
  extends(other: Type): boolean {
    return other instanceof NumericType || other instanceof NumberType;
    // TODO: other instanceof BigIntType
  }
}

export class StringType implements Type {
  constructor(public specificValue?: string) {}
  toString() {
    return "String";
  }
  extends(other: Type): boolean {
    if (other instanceof StringType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
}

export class BooleanType implements Type {
  constructor(public specificValue?: boolean) {}
  toString() {
    return "Boolean";
  }
  extends(other: Type): boolean {
    if (other instanceof BooleanType) {
      return (
        this.specificValue == null || this.specificValue === other.specificValue
      );
    }
    return false;
  }
}

export class UndefinedType implements Type {
  toString() {
    return "Undefined";
  }
  extends(other: Type): boolean {
    return other instanceof UndefinedType;
  }
}

export class NullType implements Type {
  toString() {
    return "Null";
  }
  extends(other: Type): boolean {
    return other instanceof NullType;
  }
}

export class FunctionType implements Type {
  constructor(
    public functionNode: FunctionExpression | ArrowFunctionExpression,
    public returns: TypeVariable = new TypeVariable(
      undefined,
      ((this.functionNode as FunctionExpression)?.id?.uniqueName ||
        "function") + " return type"
    )
  ) {}
  toString() {
    const name =
      (this.functionNode as FunctionExpression).id?.uniqueName || "?";
    let ret = this.returns.type ? ": " + this.returns.type.toString() : "";
    return `Function(${name})${ret}`;
  }
  extends(other: Type): boolean {
    return (
      other instanceof FunctionType && other.functionNode === this.functionNode
    );
  }
}

export class ObjectType implements Type {
  toString() {
    return `Object`;
  }
  extends(other: Type): boolean {
    return other instanceof ObjectType;
  }
}

function typeEither(t1: Type, t2: Type) {
  if (t1.extends && t2.extends) {
    if (t1.extends(t2)) return t1;
    if (t2.extends(t1)) return t2;
    return undefined;
  } else {
    invariant(!t1.extends && !t2.extends);
    return Object.getPrototypeOf(t1) === Object.getPrototypeOf(t2)
      ? t1
      : undefined;
  }
}

export function typeAnyOf(types: (Type | undefined)[]) {
  let final: Type | undefined = types[0];
  for (let i = 1; i < types.length; i++) {
    const here = types[i];
    if (final == null || here == null) return final;
    final = typeEither(final, here);
  }
  return final;
}
