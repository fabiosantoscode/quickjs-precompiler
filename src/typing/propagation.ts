import {
  astNaiveChildren,
  astNaiveTraversal,
  astTraverseExitNodes,
} from "../ast/ast-traversal";
import {
  AnyNode,
  Expression,
  isExpression,
  isStatement,
  Program,
  StatementOrDeclaration,
} from "../ast/augmented-ast";
import { Parents } from "../ast/parents";
import { compileAndRunC } from "../run";
import { enumerate, invariant, todo, unreachable } from "../utils";
import { TypeMutation } from "./mutation";
import {
  ArrayType,
  BooleanType,
  FunctionType,
  InvalidType,
  NullType,
  NumberType,
  NumericType,
  PtrType,
  StringType,
  Type,
  typeEqual,
  typeUnion,
  TypeVariable,
  UndefinedType,
  UnknownType,
} from "./type";
import {
  TypeBack,
  TypeDependency,
  TypeDependencyConditionalExpression,
  TypeDependencyCopyArgsToFunction,
  TypeDependencyCopyReturnToCall,
  TypeDependencyDataStructureRead,
  TypeDependencyDataStructureWrite,
  TypeDependencyReturnType,
  TypeDependencyTypeBack,
  TypeDependencyVariableRead,
  TypeDependencyVariableWrite,
} from "./type-dependencies";
import { TypeEnvironment } from "./type-environment";

export function propagateTypes(
  env: TypeEnvironment,
  program: Program,
  unitTestMode = false
) {
  /** Pass 0: fill in TypeEnvironment with empty TypeVariable's **/
  pass0AssignTypeVariables(env, program);

  /** Pass 1: mark literals, `undefined` and other certainly-known types. */
  pass1MarkSelfEvidentTypes(env, program);

  /** Pass 2: knowing that the TypeVariables are defined, create types that depend on them */
  pass2MarkDependentTypes(env, program);

  /** Pass 3: pump dependencies */
  pass3PumpDependencies(env, program, unitTestMode);
}

function pass0AssignTypeVariables(env: TypeEnvironment, program: Program) {
  for (const binding of program.allBindings.values()) {
    env.setBindingTypeVar(
      binding.uniqueName,
      new TypeVariable(new UnknownType(), binding.uniqueName + " binding")
    );
  }

  for (const node of astNaiveTraversal(program)) {
    if (node.type === "Identifier") {
      if (node.isReference) {
        invariant(node.uniqueName);
        const inClosure = env.getBindingTypeVar(node.uniqueName);
        env.setNodeTypeVar(node, inClosure);
      }
    } else if (isExpression(node)) {
      const tVar = new TypeVariable(
        new UnknownType(),
        node.type + " expression"
      );
      env.setNodeTypeVar(node, tVar);
    }
  }
}

function pass1MarkSelfEvidentTypes(env: TypeEnvironment, program: Program) {
  for (const node of astNaiveTraversal(program)) {
    if (isExpression(node)) {
      /** When you just know that the type is for example NumberType, or equal to another node's type */
      const just = (theType: Type) => {
        const tVar = env.getNodeTypeVar(node);
        invariant(tVar.type instanceof UnknownType);
        tVar.type = theType;
      };

      switch (node.type) {
        // Simple ones
        case "Literal": {
          if (node.value === null) {
            just(new NullType());
            break;
          }
          switch (typeof node.value) {
            case "number": {
              just(new NumberType());
              break;
            }
            case "string": {
              just(new StringType());
              break;
            }
            case "boolean": {
              just(new BooleanType());
              break;
            }
            case "object": {
              if (node.value === null) just(new NullType());
              // regexp later?
              break;
            }
            default: {
              // later?
            }
          }
          break;
        }
        case "UnaryExpression": {
          if (node.operator === "delete") {
            just(new BooleanType());
          } else if (node.operator === "+") {
            just(new NumberType());
          } else if (node.operator === "-") {
            just(new NumericType());
          } else if (node.operator === "!") {
            just(new BooleanType());
          } else if (node.operator === "typeof") {
            just(new StringType());
          } else if (node.operator === "~") {
            just(new NumberType());
          } else {
            invariant(
              node.operator === "void",
              () => "unknown operator " + node.operator
            );

            just(new UndefinedType());
          }
          break;
        }
        case "FunctionExpression":
        case "ArrowFunctionExpression": {
          const func = FunctionType.forASTNode(node.id?.uniqueName);
          just(PtrType.fromMutableType(func));
          break;
        }

        case "ClassExpression": {
          invariant(false, "TODO");
          break;
        }
        case "AssignmentExpression": {
          switch (node.operator) {
            case "=":
            case "||=":
            case "&&=":
            case "??=":
              break; // Dependent types

            case "+=":
            case "-=":
            case "*=":
            case "/=":
            case "%=":
            case "<<=":
            case ">>=":
            case ">>>=":
            case "|=":
            case "^=":
            case "&=":
            case "**=":
              just(new NumericType());
              break;

            default:
              invariant(
                false,
                "unknown node operator " + (node as any).operator
              );
          }
          break;
        }
        case "UpdateExpression": {
          switch (node.operator) {
            case "++":
            case "--":
              just(new NumericType());
              break;

            default:
              invariant(
                false,
                "unknown node operator " + (node as any).operator
              );
          }
          break;
        }
        case "BinaryExpression": {
          switch (node.operator) {
            case "+":
              break; // numeric or string

            case "==":
            case "!=":
            case "===":
            case "!==":
            case "<":
            case "<=":
            case ">":
            case ">=":
              just(new BooleanType());
              break;

            case "**":
            case "-":
            case "*":
            case "/":
            case "%":
              just(new NumericType());
              break;
            case "|":
            case "^":
            case "&":
            case "<<":
            case ">>":
            case ">>>":
              just(new NumberType());
              break;

            case "instanceof":
            case "in":
              just(new BooleanType());
              break;
          }
          break;
        }
        case "NewExpression": {
          if (node.callee.type === "Identifier") {
            if (node.callee.uniqueName === "Array@global") {
              just(PtrType.fromMutableType(new ArrayType(new UnknownType())));
            }
            if (node.callee.uniqueName === "Set@global") {
              invariant(false);
            }
            if (node.callee.uniqueName === "Map@global") {
              invariant(false);
            }
          }
          break;
        }
        case "TemplateLiteral": {
          just(new StringType());
          break;
        }
      }
    }
  }
}

function pass2MarkDependentTypes(env: TypeEnvironment, program: Program) {
  function onExpression(node: Expression) {
    /** When you can refine your knowledge after knowing other types */
    const depends = (
      dependsOn: (TypeVariable | Expression)[],
      comment: string,
      typeBack: TypeBack
    ) => {
      const target = env.getNodeTypeVar(node);
      invariant(target);
      const dependencies = dependsOn.map((t) => {
        const tVar = t instanceof TypeVariable ? t : env.getNodeTypeVar(t);
        invariant(tVar);
        return tVar;
      });
      env.addTypeDependency(
        new TypeDependencyTypeBack(comment, target, dependencies, typeBack)
      );
    };

    switch (node.type) {
      case "Identifier":
      case "Literal":
      case "ThisExpression":
      case "ArrayExpression":
      case "ObjectExpression":
      case "UnaryExpression":
      case "UpdateExpression":
        break;
      case "BinaryExpression": {
        if (node.left.type !== "PrivateIdentifier") {
          switch (node.operator) {
            case "==":
            case "!=":
            case "===":
            case "!==":
            case "<":
            case "<=":
            case ">":
            case ">=":
            case "<<":
            case ">>":
            case ">>>":
              break;
            case "+": {
              depends(
                [node.left, node.right],
                '"+" operator',
                ([left, right]) => {
                  if (
                    left instanceof NumberType &&
                    right instanceof NumberType
                  ) {
                    return new NumberType();
                  }
                  return null;
                }
              );
              break;
            }
            case "-":
            case "*":
            case "/":
            case "%": {
              /* TODO: this is already marked as NumericType. Below is a possible refinement.
              depends(
                [node.left, node.right],
                "- * / operators depend on the operands. Could be BigInt or number",
                ([left, right]) => {
                  if (
                    left instanceof NumberType && right instanceof NumberType
                  ) {
                    return new NumberType()
                  }
                  return null
                }
              );
              break; */
            }
            case "|":
            case "^":
            case "&":
            case "in":
            case "instanceof":
            case "**":
              break;
          }
        }
        break;
      }
      case "AssignmentExpression": {
        if (node.operator === "=") {
          depends(
            [env.getNodeTypeVar(node.right)],
            "assignment expr returns its assigned value",
            ([assignedValue]) => assignedValue
          );

          if (node.left.type === "MemberExpression") {
            // TODO also handle other types (eg Identifier)

            invariant(
              node.left.object.type === "Identifier",
              "TODO: other membex"
            );

            recurse(node.right);

            if (node.left.computed) {
              recurse(node.left.property);
            }

            env.addTypeDependency(
              new TypeDependencyDataStructureWrite(
                "write (member expression)",
                env.getNodeTypeVar(node.left.object),
                env.getNodeTypeVar(node.left.property),
                env.getNodeTypeVar(node.right)
              )
            );

            return true;
          } else if (node.left.type === "Identifier") {
            env.addTypeDependency(
              new TypeDependencyVariableWrite(
                "writing to an identifier using an AssignmentExpression",
                env.getBindingTypeVar(node.left.uniqueName),
                env.getNodeTypeVar(node.right)
              )
            );
          } else {
            todo();
          }
        }
        break;
      }
      case "MemberExpression": {
        env.addTypeDependency(
          new TypeDependencyDataStructureRead(
            "read",
            env.getNodeTypeVar(node),
            env.getNodeTypeVar(node.object),
            env.getNodeTypeVar(node.property)
          )
        );
        break;
      }
      case "ConditionalExpression": {
        env.addTypeDependency(
          new TypeDependencyConditionalExpression(
            "?: ternary operator depends on branches types and conditional truth",
            env.getNodeTypeVar(node),
            env.getNodeTypeVar(node.test),
            env.getNodeTypeVar(node.consequent),
            env.getNodeTypeVar(node.alternate)
          )
        );
        break;
      }
      case "CallExpression": {
        env.addTypeDependency(
          new TypeDependencyCopyReturnToCall(
            "copy return to call",
            env.getNodeTypeVar(node),
            env.getNodeTypeVar(node.callee)
          )
        );
        env.addTypeDependency(
          new TypeDependencyCopyArgsToFunction(
            "copy args to function",
            env.getNodeTypeVar(node.callee),
            node.arguments.map((arg) => {
              invariant(arg.type !== "SpreadElement");
              return env.getNodeTypeVar(arg);
            })
          )
        );
        break;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        env.addTypeDependency(
          new TypeDependencyReturnType(
            "the function's return value depends on the tVars of return statements",
            env.getNodeTypeVar(node),
            [...astTraverseExitNodes(node)].map((node) => {
              invariant(node.type !== "ThrowStatement");
              return env.getNodeTypeVar(node.argument);
            })
          )
        );

        for (const [i, param] of enumerate(node.params)) {
          invariant(param.type === "Identifier");
          env.addTypeDependency(
            new TypeDependencyTypeBack(
              `function parameter #${i}`,
              env.getBindingTypeVar(param.uniqueName),
              [env.getNodeTypeVar(node)],
              ([funcType]) => {
                return (
                  (funcType instanceof PtrType &&
                    funcType.asFunction?.params.nthFunctionParameter(i)) ||
                  null
                );
              }
            )
          );
        }
        break;
      }
      case "LogicalExpression":
      case "NewExpression":
      case "SequenceExpression":
      case "YieldExpression":
      case "TemplateLiteral":
      case "TaggedTemplateExpression":
      case "ClassExpression":
      case "MetaProperty":
      case "AwaitExpression":
      case "ChainExpression":
      case "ImportExpression":
        break;
      default:
        unreachable();
    }
  }

  function onStatement(node: StatementOrDeclaration) {
    switch (node.type) {
      case "VariableDeclaration": {
        const { id, init } = node.declarations[0];
        invariant(id.type === "Identifier");

        env.addTypeDependency(
          new TypeDependencyVariableWrite(
            "copy initializer into vardecl " + id.uniqueName,
            env.getBindingTypeVar(id.uniqueName),
            env.getNodeTypeVar(init)
          )
        );
      }
    }
  }

  function recurse(node: AnyNode) {
    for (const child of astNaiveChildren(node)) {
      if (isExpression(child)) {
        if (onExpression(child)) {
          // can return true to abort
          continue;
        }
      } else if (isStatement(child)) {
        onStatement(child);
      }
      recurse(child);
    }
  }

  recurse(program);
}

function pass3PumpDependencies(
  env: TypeEnvironment,
  _program: Program,
  testMode = false
) {
  const allDeps = env.getAllTypeDependencies();
  const allDepsInv = env.getAllTypeDependenciesInv();

  for (let pass = 0; pass < 2000000; pass++) {
    // Sanity checks
    //invariant(
    //  [...allDeps].flat().every((dep) => dep.target.type === undefined),
    //  "every dependency target type is as-of-yet unknown"
    //);
    invariant(
      [...allDeps].every(([_k, depSet]) => depSet.length > 0),
      "all depSets have at least one dep"
    );
    invariant(
      [...allDeps].every(
        ([_k, depSet]) =>
          depSet.length === 0 ||
          depSet.every((dep) => dep.target === depSet[0].target)
      ),
      "each depSet points to the same dep"
    );

    let anyProgress = false;

    for (const [target, depSet] of allDeps) {
      let originalType = PtrType.deref(target.type);
      let newType: Type | undefined;

      const mutations = TypeMutation.withMutationsCollected(() => {
        newType = depSet.reduce(
          (acc: Type | undefined, dep: TypeDependency, i): Type | undefined => {
            if (acc == null && i > 0) return undefined;

            let [_done, type] = dep.pump();

            if (type && acc) {
              return typeUnion(type, acc) ?? new InvalidType();
            } else {
              return type || acc;
            }
          },
          target.type
        );
      });

      if (newType != undefined) {
        for (const mutation of mutations) {
          const changed = mutation.mutate();
          if (changed) anyProgress = true;
        }
      }

      // We moved forward
      if (!typeEqual(PtrType.deref(newType), originalType)) {
        anyProgress = true;

        target.type = newType;
      }
    }

    // Propagate invalid types!
    for (const [source, targets] of allDepsInv) {
      if (PtrType.deref(source.type) instanceof InvalidType) {
        for (const target of targets) {
          if (target.type instanceof PtrType) {
            if (!(target.type._target.target instanceof InvalidType)) {
              anyProgress = true;
              target.type._target.target = new InvalidType();
            }
          } else {
            if (!(target.type instanceof InvalidType)) {
              anyProgress = true;
              target.type = new InvalidType();
            }
          }
        }
      }
    }

    if (!anyProgress && false) {
      // Print deps (debug)
      for (const [target, dep] of allDeps) {
        console.log(dep, "-->", target);
      }
    }

    if (!anyProgress) return;

    if (testMode && pass > 50) {
      console.log(allDeps);
      throw new Error("types never converge");
      return;
    }
  }

  console.warn("Giving up after 2000000 iterations.");
}
