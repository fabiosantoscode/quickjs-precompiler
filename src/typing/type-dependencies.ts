import { TrackedBinding } from "../precompiler/augmented-ast";
import { invariant } from "../utils";
import { Type, TypeVariable, typeAnyOf } from "./type";
import { TypeEnvironment } from "./type-environment";

export type TypeBack = (vars: Type[]) => [done: boolean, t: Type | null];

/** Dependent types are defined by callbacks, that can be called when other TypeVariables are known. They are removed when they return done: true, otherwise they may be called again with more info later. */
export type DependentType = {
  dependencies: TypeVariable[];
  target: TypeVariable;
  typeBack: TypeBack;
};

export const addDependentType = (
  env: TypeEnvironment,
  dependencies: TypeVariable[],
  target: TypeVariable,
  typeBack: TypeBack
) => {
  const dt = { dependencies, target, typeBack };

  // Index it
  invariant(!env.dependentTypes.has(dt.target));
  env.dependentTypes.set(dt.target, dt);
};

export const propagateDependentTypes = (
  env: TypeEnvironment,
  tVar: TypeVariable
) => {
  const dependent = env.dependentTypes.get(tVar);
  if (!dependent?.dependencies.every((dep) => dep.type)) return;

  const types = dependent.dependencies.map((dep) => dep.type) as Type[];
  const [done, computedType] = dependent.typeBack(types);

  if (done) {
    env.dependentTypes.delete(dependent.target);
  }

  const existingType = dependent.target.type;
  if (computedType != null && existingType != null) {
    // TODO: this is probably good to make sure for testing
    invariant(computedType.extends(existingType));
  }

  if (computedType) {
    dependent.target.type = computedType;
  }
};

/**
 * A variable's value depends on many TypeVariables. When we know all possibilities, we know that the binding is a union of them all
 */
export type VarDependentType = {
  target: TypeVariable;
  possibilities: TypeVariable[];
  binding: TrackedBinding;
};

export const addVarDependentType = (
  env: TypeEnvironment,
  binding: TrackedBinding,
  target: TypeVariable,
  possibility: TypeVariable
) => {
  let vdt = env.varDependentTypes.get(binding);
  if (!vdt) {
    vdt = {
      target: target,
      possibilities: [],
      binding,
    };
    env.varDependentTypes.set(binding, vdt);
  }
  invariant(
    vdt.target === target,
    "targetTVar must be a binding shared by all variables of its name"
  );
  vdt.possibilities.push(possibility);
};

export const propagateVarDependentTypes = (
  env: TypeEnvironment,
  binding: TrackedBinding
) => {
  const vdt = env.varDependentTypes.get(binding);
  if (!vdt) return;

  const { target, possibilities } = vdt;
  invariant(binding.assignments <= possibilities.length);
  if (binding.assignments === possibilities.length) {
    target.type = typeAnyOf(possibilities.map((tVar) => tVar.type));
    if (target.type) env.varDependentTypes.delete(binding);
  }
};
