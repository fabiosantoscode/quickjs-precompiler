import { AnyNode, Program } from "../ast/augmented-ast";
import { defined, invariant, mapGetOrDefault } from "../utils";
import { propagateTypes } from "./propagation";
import { ObjectType, TypeVariable, UndefinedType } from "./type";
import { TypeDependency } from "./type-dependencies";

const typeEnvs = new WeakMap<Program, TypeEnvironment>();

/** Mappings between expressions/bindings and the TypeVariable within. */
export class TypeEnvironment {
  static forProgram(program: Program, mustExist = false) {
    return mapGetOrDefault(typeEnvs, program, () => {
      invariant(!mustExist);
      const env = new TypeEnvironment();
      propagateTypes(env, program);
      return env;
    });
  }

  #typeVars = new Map<AnyNode, TypeVariable>();
  #bindingVars = new Map<string, TypeVariable>(
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
  #knownBindings = new Set(this.#bindingVars.keys());
  #typeDependencies = new Map<TypeVariable, TypeDependency>();

  getNodeType(node: AnyNode) {
    return defined(this.#typeVars.get(node)).type;
  }
  getNodeTypeVar(node: AnyNode) {
    return defined(this.#typeVars.get(node));
  }
  setNodeType(node: AnyNode, tVar: TypeVariable) {
    invariant(!this.#typeVars.has(node));
    this.#typeVars.set(node, tVar);
  }

  getBindingType(uniqueName: string) {
    return defined(this.#bindingVars.get(uniqueName));
  }
  setBindingType(uniqueName: string, tVar: TypeVariable) {
    if (this.#knownBindings.has(uniqueName)) {
      return; // undefined, globalThis, etc. Cannot be reassigned.
    }
    invariant(!this.#bindingVars.has(uniqueName));
    this.#bindingVars.set(uniqueName, tVar);
  }

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
