import { defined, invariant, todo } from "../utils";
import {
  ArrayType,
  FunctionType,
  NumberType,
  PartialFunctionType,
  PtrType,
  TupleType,
  Type,
  TypeVariable,
  UndefinedType,
  typeAnyOf,
} from "./type";

export type TypeBack = (vars: Type[]) => Type | null;

export interface TypeDependency {
  comment?: string;
  target: TypeVariable;
  sources: readonly TypeVariable[];
  pump(): [boolean, Type | null];
}

export class TypeDependencyBindingAssignments implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public targetPossibilityCount: number,
    public possibilities: TypeVariable[] = []
  ) {}

  get sources() {
    return this.possibilities;
  }

  pump(): [boolean, Type | null] {
    if (
      this.targetPossibilityCount != null &&
      this.possibilities.length === this.targetPossibilityCount &&
      this.possibilities.every((tVar) => tVar.type)
    ) {
      return [
        true,
        typeAnyOf(this.possibilities.map((tVar) => tVar.type)) ?? null,
      ];
    } else {
      return [false, null];
    }
  }
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
    if (this.ifTrue.type && this.ifFalse.type) {
      return [true, typeAnyOf([this.ifTrue.type, this.ifFalse.type]) || null];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyCopyReturnToCall implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public callee: TypeVariable
  ) {}

  get sources() {
    return [this.callee];
  }

  pump(): [boolean, Type | null] {
    let callee =
      this.callee.type instanceof PtrType
        ? this.callee.type.asFunction
        : this.callee.type;

    if (
      (callee instanceof FunctionType ||
        callee instanceof PartialFunctionType) &&
      callee.returns
    ) {
      return [true, callee.returns];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyCopyArgsToFunction implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public args: TypeVariable[]
  ) {}

  get sources() {
    return this.args;
  }

  pump(): [boolean, Type | null] {
    if (this.args.every((a) => a.type)) {
      const types = this.args.map((tVar) => defined(tVar.type));
      // return [true, new WithFunctionArgsType(types)]
      return [true, new PartialFunctionType(new TupleType(types), undefined)];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyReturnType implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public returnedValues: TypeVariable[]
  ) {}

  get sources() {
    return this.returnedValues;
  }

  pump(): [boolean, Type | null] {
    if (this.returnedValues.length === 0) {
      return [true, new PartialFunctionType(undefined, new UndefinedType())];
    } else if (this.returnedValues.every((tVar) => tVar.type)) {
      const tt =
        typeAnyOf(this.returnedValues.map((tVar) => tVar.type)) ?? null;
      return [true, tt && new PartialFunctionType(undefined, tt)];
    } else {
      return [false, null];
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
      this.dependencies.every((tVar) => tVar.type) &&
      this.typeBack(this.dependencies.map((tVar) => tVar.type!));

    if (targetType) {
      return [true, targetType];
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
    if (this.written.type) {
      return [true, this.written.type];
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
    if (this.source.type) {
      return [true, this.source.type];
    } else {
      return [false, null];
    }
  }
}

export class TypeDependencyDataStructureWrite implements TypeDependency {
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
    if (this.written.type && this.property.type) {
      invariant(
        this.property.type instanceof NumberType,
        "only property writes are array writes right now"
      );
      return [true, new ArrayType(this.written.type)];
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
    public property: TypeVariable
  ) {}

  get sources() {
    return [this.object, this.property];
  }

  pump(): [boolean, Type | null] {
    if (this.object.type && this.property.type) {
      if (this.object.type instanceof ArrayType) {
        return [true, this.object.type.readProperty(this.property.type)];
      } else {
        return [true, null];
      }
    } else {
      return [false, null];
    }
  }
}
