import { AnyNode, TrackedBinding } from "../precompiler/augmented-ast";
import { TypeVariable, UndefinedType, ObjectType } from "./type";
import { DependentType, VarDependentType } from "./type-dependencies";

/** Mappings between expressions/bindings and the TypeVariable within. */
export class TypeEnvironment {
  typeVars = new Map<AnyNode, TypeVariable>();
  bindingVars = new Map<string, TypeVariable>(
    Object.entries({
      "undefined@global": new TypeVariable(new UndefinedType()),
      "globalThis@global": new TypeVariable(new ObjectType()),
    })
  );
  dependentTypes = new Map<TypeVariable, DependentType>();
  varDependentTypes = new Map<TrackedBinding, VarDependentType>();
}
