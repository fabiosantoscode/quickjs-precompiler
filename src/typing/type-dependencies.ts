import { TrackedBinding } from "../precompiler/augmented-ast";
import { invariant } from "../utils";
import { Type, TypeVariable, UndefinedType, typeAnyOf } from "./type";
import { TypeEnvironment } from "./type-environment";

export type TypeBack = (vars: Type[]) => Type | null;

export interface TypeDependency {
  comment?: string;
  target: TypeVariable;
  pump(): [boolean, Type | null];
}

export class TypeDependencyBindingAssignments implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public targetPossibilityCount: number,
    public possibilities: TypeVariable[] = []
  ) {}

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

export class TypeDependencyCopyReturnToCall implements TypeDependency {
  constructor(
    public comment: string,
    public target: TypeVariable,
    public source: TypeVariable
  ) {}

  pump(): [boolean, Type | null] {
    if (this.source.type) {
      return [true, this.source.type ?? null];
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

  pump(): [boolean, Type | null] {
    if (this.returnedValues.length === 0) {
      return [true, new UndefinedType()];
    } else if (this.returnedValues.every((tVar) => tVar.type)) {
      return [
        true,
        typeAnyOf(this.returnedValues.map((tVar) => tVar.type)) ?? null,
      ];
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
