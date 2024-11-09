import { AnyNode } from "../ast/augmented-ast";
import { invariant } from "../utils";
import { ObjectType, TypeVariable, UndefinedType } from "./type";
import { TypeDependency } from "./type-dependencies";

/** Mappings between expressions/bindings and the TypeVariable within. */
export class TypeEnvironment {
  typeVars = new Map<AnyNode, TypeVariable>();
  bindingVars = new Map<string, TypeVariable>(
    Object.entries({
      "undefined@global": new TypeVariable(
        new UndefinedType(),
        'global variable "undefined"'
      ),
      "globalThis@global": new TypeVariable(
        new ObjectType(),
        'global variable "globalThis"'
      ),
    })
  );

  #typeDependencies = new Map<TypeVariable, TypeDependency>();

  addTypeDependency(dependency: TypeDependency) {
    invariant(
      !this.#typeDependencies.has(dependency.target),
      "dependency already exists"
    );

    this.#typeDependencies.set(dependency.target, dependency);
  }

  getTypeDependency(key: TypeVariable) {
    return this.#typeDependencies.get(key);
  }

  getAllTypeDependencies() {
    return new Set(this.#typeDependencies.values());
  }
}
