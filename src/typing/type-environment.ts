import { AnyNode, Program } from "../ast/augmented-ast";
import { defined, invariant, maparrayPush, mapGetOrDefault } from "../utils";
import { propagateTypes } from "./propagation";
import { ObjectType, TypeVariable, UndefinedType } from "./type";
import { TypeDependency } from "./type-dependencies";

const typeEnvs = new WeakMap<Program, TypeEnvironment>();

/** Mappings between expressions/bindings and the TypeVariable within. */
export class TypeEnvironment {
  static forProgram(program: Program, mustExist = false) {
    return mapGetOrDefault(typeEnvs, program, () => {
      invariant(
        !mustExist,
        "no TypeEnvironment exists for program, and mustExist was passed"
      );
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
  #typeDependencies = new Map<TypeVariable, TypeDependency[]>();

  getNodeType(node: AnyNode) {
    return defined(this.#typeVars.get(node)).type;
  }
  getNodeTypeVar(node: AnyNode) {
    return defined(this.#typeVars.get(node));
  }
  setNodeTypeVar(node: AnyNode, tVar: TypeVariable) {
    invariant(!this.#typeVars.has(node));
    this.#typeVars.set(node, tVar);
  }

  getBindingTypeVar(uniqueName: string) {
    return defined(this.#bindingVars.get(uniqueName));
  }
  setBindingTypeVar(uniqueName: string, tVar: TypeVariable) {
    if (this.#knownBindings.has(uniqueName)) {
      return; // undefined, globalThis, etc. Cannot be reassigned.
    }
    invariant(!this.#bindingVars.has(uniqueName));
    this.#bindingVars.set(uniqueName, tVar);
  }
  getBindingType(uniqueName: string) {
    return defined(this.#bindingVars.get(uniqueName)).type;
  }

  addTypeDependency(dependency: TypeDependency) {
    if (!this.#typeDependencies.has(dependency.target)) {
      this.#typeDependencies.set(dependency.target, [dependency]);
    } else {
      this.#typeDependencies.get(dependency.target)!.push(dependency);
    }
  }

  getTypeDependencies(byTarget: TypeVariable) {
    return this.#typeDependencies.get(byTarget);
  }

  getTypeDependents(byTarget: TypeVariable) {
    // TODO if this function gets used in the end, cache this lookup
    const out: TypeDependency[] = [];
    for (const depSet of this.#typeDependencies.values()) {
      for (const dep of depSet) {
        if (dep.sources.includes(byTarget)) {
          out.push(dep);
        }
      }
    }
    return out;
  }

  getAllTypeDependencies(): ReadonlyMap<TypeVariable, TypeDependency[]> {
    return this.#typeDependencies;
  }
  getAllTypeDependenciesInv(): ReadonlyMap<TypeVariable, TypeVariable[]> {
    const map = new Map<TypeVariable, TypeVariable[]>();

    for (const [target, depSet] of this.#typeDependencies) {
      for (const dep of depSet) {
        for (const source of dep.sources) {
          maparrayPush(map, source, target);
        }
      }
    }

    return map;
  }
}
