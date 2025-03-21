import { BinaryOperator } from "acorn";
import { defined, invariant, todo } from "../utils";
import {
  ArrayType,
  FunctionType,
  NumberType,
  PtrType,
  TupleType,
  Type,
  TypeVariable,
  UndefinedType,
  UnknownType,
  typeUnionAll,
  typeUnion,
  InvalidType,
  StringType,
  isValidType,
} from "./type";
import { isComparisonBinaryOperator, isNumericBinaryOperator } from "../ast/augmented-ast";

export type TypeBack = (vars: Type[]) => Type | null;

export interface TypeDependency {
  comment?: string;
  target: TypeVariable;
  sources: readonly TypeVariable[];
  pump(): [boolean, Type | null];
}

export class TypeDependencyConditionalExpression implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public given: TypeVariable,
    public ifTrue: TypeVariable,
    public ifFalse: TypeVariable
  ) {}

  get sources() {
    return [this.given, this.ifTrue, this.ifFalse];
  }

  pump(): [boolean, Type | null] {
    // TODO: we can use progressive improvement (eg, we can know the conditional test, then actually choose a side)
    if (this.ifTrue.validType && this.ifFalse.validType) {
      return [true, typeUnion(this.ifTrue.type, this.ifFalse.type)];
    } else {
      return [false, null];
    }
  }
}

/** Mutate the function by setting its arguments */
export class TypeDependencyCopyArgsToFunction implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public args: TypeVariable[]
  ) {}

  get sources() {
    return this.args
  }

  pump(): [boolean, Type | null] {
    const target = this.target.validType
    const args = this.args.map(a => a.validType)

    if (target instanceof PtrType && args.every(isValidType)) {
      return [true, target.setFunctionArgs(args as Type[])]
    } else {
      return [false, null]
    }
  }
}

export class TypeDependencyCopyArgsToMethod implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public methodName: string,
    public args: TypeVariable[]
  ) {}

  get sources() {
    return this.args
  }

  pump(): [boolean, Type | null] {
    const target = this.target.validType
    const args = this.args.map(a => a.validType)

    if (target instanceof PtrType && args.every(isValidType)) {
      return [true, target.setMethodArgs(this.methodName, args as Type[])]
    } else {
      return [false, null]
    }
  }
}

export class TypeDependencyCopyReturnToCaller implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public callee: TypeVariable,
    public withArgs: TypeVariable[]
  ) {}

  get sources() {
    return [this.callee, ...this.withArgs]
  }

  pump(): [boolean, Type | null] {
    const target = this.target.type
    const callee = this.callee.type

    if (callee instanceof PtrType) {
      return [true, callee.getFunctionRet(this.withArgs.map(a => a.type))]
    } else {
      return [false, null]
    }
  }
}

export class TypeDependencyCopyMethodReturnToCaller implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public object: TypeVariable,
    public methodName: string,
    public withArgs: TypeVariable[],
  ) {}

  get sources() {
    return [this.object, ...this.withArgs]
  }

  pump(): [boolean, Type | null] {
    const target = this.target.type
    const object = this.object.type

    if (object.getMethodRet) {
      return [true, object.getMethodRet(this.methodName, this.withArgs.map(a => a.type))]
    } else {
      return [false, null]
    }
  }
}

/** The return type of a function */
export class TypeDependencyCopyReturnStatementsToFunctionRet implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public returnedValues: TypeVariable[]
  ) {}

  get sources() {
    return this.returnedValues;
  }

  pump(): [boolean, Type | null] {
    const returnStatements = this.returnedValues.map(ret => ret.type)
    if (this.target.type instanceof PtrType) {
      const union = returnStatements.length === 0
        ? new UndefinedType()
        : typeUnionAll(returnStatements)
      return [true, this.target.type.setFunctionRet(union)]
    } else {
      return [false, null]
    }
  }
}

export class TypeDependencyTypeBack implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public dependencies: TypeVariable[],
    public typeBack: TypeBack
  ) {}

  get sources() {
    return this.dependencies;
  }

  pump(): [boolean, Type | null] {
    const targetType =
      this.dependencies.every((tVar) => tVar.validType) &&
      this.typeBack(this.dependencies.map((tVar) => tVar.type!));

    if (targetType) {
      return [true, targetType];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyNumericBinaryOperator implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public operator: BinaryOperator,
    public left: TypeVariable,
    public right: TypeVariable,
  ) {
    invariant(isNumericBinaryOperator(operator))
  }

  get sources() {
    return [this.left, this.right];
  }

  /**
   * Very limited version of the binary operator
   * https://262.ecma-international.org/#sec-applystringornumericbinaryoperator
   */
  pump(): [boolean, Type | null] {
    let lType = this.left.validType
    let rType = this.right.validType
    const isPlus = this.operator === '+'

    // Number is always on the left, to simplify checks below
    if (rType instanceof NumberType) {
      [rType, lType] = [lType, rType];
    }

    // Number + String -> String
    // String + String -> String
    if (
      this.operator === '+'
      && (lType instanceof NumberType || lType instanceof StringType)
      && rType instanceof StringType
    ) {
      return [true, new StringType]
    }

    // Number [op] Number -> Number
    if (lType instanceof NumberType && rType instanceof NumberType) {
      return [true, new NumberType]
    }

    return [false, null]
  }
}

export class TypeDependencyComparisonBinaryOperator implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public operator: BinaryOperator,
    public left: TypeVariable,
    public right: TypeVariable,
  ) {
    invariant(isComparisonBinaryOperator(operator))
  }

  get sources() {
    return [this.left, this.right];
  }

  /**
   * Very limited version of the binary operator
   * https://262.ecma-international.org/#sec-applystringornumericbinaryoperator
   */
  pump(): [boolean, Type | null] {
    const lType = this.left.validType
    const rType = this.right.validType
    const isPlus = this.operator === '+'

    if (lType instanceof StringType || rType instanceof StringType) {
      return isPlus && (lType instanceof NumberType || rType instanceof NumberType)
        ? [true, new StringType()]
        : [true, new InvalidType()]
    }

    if (lType instanceof NumberType && rType instanceof NumberType) {
      return [true, new NumberType()];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyVariableWrite implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public written: TypeVariable
  ) {}

  get sources() {
    return [this.written];
  }

  pump(): [boolean, Type | null] {
    if (this.written.validType) {
      return [true, this.written.validType];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyVariableRead implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public source: TypeVariable
  ) {}

  get sources() {
    return [this.source];
  }

  pump(): [boolean, Type | null] {
    if (this.source.validType) {
      return [true, this.source.validType];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyDataStructureRead implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public object: TypeVariable,
    public property: string
  ) {}

  get sources() {
    return [this.object];
  }

  pump(): [boolean, Type | null] {
    if (this.object.validType) {
      const prop = this.object.type.readProperty?.(this.property);
      return [true, prop ?? new InvalidType()];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyDataStructureReadComputed implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public object: TypeVariable,
    public property: TypeVariable
  ) {}

  get sources() {
    return [this.object, this.property];
  }

  pump(): [boolean, Type | null] {
    if (this.object.validType && this.property.validType) {
      const prop = this.object.type.readProperty?.(this.property.type);
      return [true, prop ?? new InvalidType()];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyDataStructureWrite implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public property: string,
    public written: TypeVariable
  ) {}

  get sources() {
    return [this.written];
  }

  pump(): [boolean, Type | null] {
    if (this.target.type instanceof PtrType && this.written.validType) {
      const withProp = (this.target.type.writeProperty?.(this.property, this.written.type))
        ?? new InvalidType()
      return [true, withProp]
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyDataStructureWriteComputed implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public property: TypeVariable,
    public written: TypeVariable
  ) {}

  get sources() {
    return [this.written];
  }

  pump(): [boolean, Type | null] {
    if (this.target.type instanceof PtrType && this.written.validType && this.property.validType) {
      const withProp = (this.target.type.writeProperty?.(this.property.type, this.written.type))
        ?? new InvalidType()
      return [true, withProp]
    } else {
      return [false, null];
    }
  }
}

