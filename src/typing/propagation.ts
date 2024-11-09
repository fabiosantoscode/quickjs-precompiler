import { invariant, maparrayPush } from "../utils";
import {
  astNaiveTraversal,
  astTraverseExitNodes,
  isFunction,
} from "../ast/ast-traversal";
import {
  AnyNode,
  AssignmentExpression,
  CallExpression,
  Expression,
  Function,
  FunctionExpression,
  isExpression,
  Pattern,
  Program,
} from "../ast/augmented-ast";
import { defined, zip } from "../utils";
import {
  BooleanType,
  FunctionType,
  NullType,
  NumberType,
  NumericType,
  StringType,
  Type,
  typeAnyOf,
  TypeVariable,
  UndefinedType,
} from "./type";
import {
  TypeBack,
  TypeDependencyCopyReturnToCall,
  TypeDependencyReturnType,
  TypeDependencyTypeBack,
  TypeDependencyBindingAssignments,
} from "./type-dependencies";
import { TypeEnvironment } from "./type-environment";
import { findCompleteFunctions } from "./complete-functions";

export function propagateTypes(env: TypeEnvironment, program: Program) {
  /** Pass 0: fill in TypeEnvironment with empty TypeVariable's.
   *
   * All expressions will have a unique TypeVariable, whose type will be undefined for now
   * Identifiers referring to the same variable will share their TypeVariable instance, and be indexed in TypeEnvironment.bindingVars
   **/
  pass0AssignTypeVariables(env, program);

  /** Pass 1: mark literals, `undefined` and other certainly-known types. */
  pass1MarkSelfEvidentTypes(env, program);

  /** Pass 2: find assigned variables and create dependent, OneOfType instances */
  pass2MarkAssignments(env, program);

  /** Pass 3: knowing that the TypeVariables are defined, create types that depend on them */
  pass3MarkDependentTypes(env, program);

  /** Pass 4: find all functions whose calls are fully known, and mark their argument types and return types */
  pass4MarkFunctionArgsAndRet(env, program);

  /** Pass 5: pump dependencies */
  pass5PumpDependencies(env, program);
}

function pass0AssignTypeVariables(env: TypeEnvironment, program: Program) {
  for (const binding of program.allBindings.values()) {
    env.bindingVars.set(
      binding.uniqueName,
      new TypeVariable(undefined, binding.uniqueName + " binding")
    );
  }

  for (const node of astNaiveTraversal(program)) {
    if (node.type === "Identifier") {
      if (node.isReference) {
        const inClosure = env.bindingVars.get(node.uniqueName);
        invariant(node.uniqueName);
        invariant(inClosure);
        env.typeVars.set(node, inClosure);
      }
    } else if (isExpression(node)) {
      const tVar = new TypeVariable(undefined, node.type + " expression");
      env.typeVars.set(node, tVar);

      if (node.type === "FunctionExpression" && node.id) {
        env.bindingVars.set(node.id.uniqueName, tVar);
        env.typeVars.set(node.id, tVar);
      }
    }
  }
}

function pass1MarkSelfEvidentTypes(env: TypeEnvironment, program: Program) {
  for (const node of astNaiveTraversal(program)) {
    if (isExpression(node)) {
      /** When you just know that the type is for example NumberType, or equal to another node's type */
      const just = (theType?: Type | TypeVariable) => {
        invariant(theType);

        if (theType instanceof TypeVariable) {
          env.typeVars.set(node, theType);
        } else {
          env.typeVars.get(node)!.type = theType;
        }
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
              just(new NumberType(node.value));
              break;
            }
            case "string": {
              just(new StringType(node.value));
              break;
            }
            case "boolean": {
              just(new BooleanType(node.value));
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
          } else if (node.operator === "-" || node.operator === "~") {
            just(new NumericType());
          } else if (node.operator === "!") {
            just(new BooleanType());
          } else if (node.operator === "typeof") {
            just(new StringType());
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
          just(new FunctionType(node));
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
            case "|":
            case "^":
            case "&":
            case "<<":
            case ">>":
            case ">>>":
              just(new NumericType());
              break;

            case "instanceof":
            case "in":
              just(new BooleanType());
              break;
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

function pass2MarkAssignments(env: TypeEnvironment, program: Program) {
  const namesToDependencies = new Map<
    string,
    TypeDependencyBindingAssignments
  >();
  program.allBindings.forEach((bind) => {
    if (bind.explicitlyDefined) {
      const tDep = new TypeDependencyBindingAssignments(
        `variable ${bind.uniqueName} depends on ${bind.assignments} assignments`,
        defined(env.bindingVars.get(bind.uniqueName)),
        bind.assignments,
        []
      );

      namesToDependencies.set(bind.uniqueName, tDep);

      env.addTypeDependency(tDep);
    }
  });

  for (const node of astNaiveTraversal(program)) {
    type AssignmentLike = {
      left: Pattern;
      right: Expression;
      operator: AssignmentExpression["operator"];
      comment: string;
      isConstant: boolean;
    };
    function intoAssignmentLike(node: AnyNode): AssignmentLike | undefined {
      if (node.type === "AssignmentExpression") {
        let { left, right, operator } = node;
        return {
          left,
          right,
          operator,
          comment:
            "assignment" + (operator === "=" ? "" : " (" + operator + ")"),
          isConstant: false,
        };
      } else if (node.type === "VariableDeclaration") {
        invariant(node.declarations.length === 1);
        const kind = node.kind;
        const { id: left, init: right } = node.declarations[0];
        return {
          left,
          right,
          operator: "=",
          comment: "variable",
          isConstant: kind === "const",
        };
      } else {
        return undefined;
      }
    }
    const asAssignmentLike = intoAssignmentLike(node);
    if (
      asAssignmentLike &&
      asAssignmentLike.operator === "=" &&
      asAssignmentLike.left.type === "Identifier"
    ) {
      // TODO: +=, not identifiers, etc

      const { left, right, operator, isConstant } = asAssignmentLike;

      const possibility = defined(env.typeVars.get(right));

      /* TODO treat const differently
      if (isConstant) {
        // Never reassigned!
        env.bindingVars.set(left.uniqueName, possibility);
        env.typeVars.set(left, possibility);
      } else {
       */
      const tDep = namesToDependencies.get(left.uniqueName);
      if (tDep) {
        tDep.possibilities.push(possibility);
      }
    }
  }
}

function pass3MarkDependentTypes(env: TypeEnvironment, program: Program) {
  for (const node of astNaiveTraversal(program)) {
    if (isExpression(node)) {
      /** When you can refine your knowledge after knowing other types */
      const depends = (
        dependsOn: (TypeVariable | Expression)[],
        comment: string,
        typeBack: TypeBack
      ) => {
        const target = env.typeVars.get(node);
        invariant(target);
        const dependencies = dependsOn.map((t) => {
          const tVar = t instanceof TypeVariable ? t : env.typeVars.get(t);
          invariant(tVar);
          return tVar;
        });
        //addDependentType(env, { dependencies, target, comment, typeBack });
        env.addTypeDependency(
          new TypeDependencyTypeBack(comment, target, dependencies, typeBack)
        );
      };

      switch (node.type) {
        case "Identifier": {
          break;
        }
        case "Literal": {
          break;
        }
        case "ThisExpression": {
          break;
        }
        case "ArrayExpression": {
          break;
        }
        case "ObjectExpression": {
          break;
        }
        case "FunctionExpression": {
          break;
        }
        case "UnaryExpression": {
          break;
        }
        case "UpdateExpression": {
          break;
        }
        case "BinaryExpression": {
          if (node.left.type !== "PrivateIdentifier") {
            switch (node.operator) {
              case "==": {
                break;
              }
              case "!=": {
                break;
              }
              case "===": {
                break;
              }
              case "!==": {
                break;
              }
              case "<": {
                break;
              }
              case "<=": {
                break;
              }
              case ">": {
                break;
              }
              case ">=": {
                break;
              }
              case "<<": {
                break;
              }
              case ">>": {
                break;
              }
              case ">>>": {
                break;
              }
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
              case "-": {
                break;
              }
              case "*": {
                break;
              }
              case "/": {
                break;
              }
              case "%": {
                break;
              }
              case "|": {
                break;
              }
              case "^": {
                break;
              }
              case "&": {
                break;
              }
              case "in": {
                break;
              }
              case "instanceof": {
                break;
              }
              case "**": {
                break;
              }
            }
          }
          break;
        }
        case "AssignmentExpression": {
          break;
        }
        case "LogicalExpression": {
          break;
        }
        case "MemberExpression": {
          break;
        }
        case "ConditionalExpression": {
          break;
        }
        case "CallExpression": {
          break;
        }
        case "NewExpression": {
          break;
        }
        case "SequenceExpression": {
          break;
        }
        case "ArrowFunctionExpression": {
          break;
        }
        case "YieldExpression": {
          break;
        }
        case "TemplateLiteral": {
          break;
        }
        case "TaggedTemplateExpression": {
          break;
        }
        case "ClassExpression": {
          break;
        }
        case "MetaProperty": {
          break;
        }
        case "AwaitExpression": {
          break;
        }
        case "ChainExpression": {
          break;
        }
        case "ImportExpression": {
          break;
        }
      }
    }
  }
}

function pass4MarkFunctionArgsAndRet(env: TypeEnvironment, program: Program) {
  const completeFunctions = findCompleteFunctions(program);
  const byName = new Map(
    [...completeFunctions.entries()].flatMap(([func, nodeInfo]) => {
      return nodeInfo.map((str) => [str, func]);
    })
  );
  const calls = new Map<Function, CallExpression[]>();

  for (const node of astNaiveTraversal(program)) {
    if (node.type !== "CallExpression") continue;

    const funcNode =
      node.callee.type === "Identifier"
        ? byName.get(node.callee.uniqueName)
        : isFunction(node.callee)
        ? node.callee
        : undefined;
    const tVar = funcNode && env.typeVars.get(funcNode as any);

    if (!funcNode || !tVar) continue;

    maparrayPush(calls, funcNode, node);
  }

  for (const func of calls.keys()) {
    const tVarFunc = env.typeVars.get(func as FunctionExpression);
    invariant(tVarFunc?.type instanceof FunctionType);
    const callExprNodes = defined(calls.get(func));

    let quit = false;

    const paramUniqueNames: string[] = [];
    for (const param of func.params) {
      invariant(param.type === "Identifier", "Unsupported");

      paramUniqueNames.push(param.uniqueName);
    }

    const argTVars: Array<(TypeVariable | undefined)[]> = Array.from(
      { length: func.params.length },
      () => []
    );
    for (const callExpr of callExprNodes) {
      if (
        callExpr.arguments.length !== func.params.length ||
        callExpr.arguments.some((a) => a.type === "SpreadElement")
      ) {
        quit = true;
        break;
      }

      for (let paramI = 0; paramI < func.params.length; paramI++) {
        argTVars[paramI].push(env.typeVars.get(callExpr.arguments[paramI]));
      }
    }

    if (quit) continue;

    // ARG TYPES
    for (const [argName, passedArgs] of zip(paramUniqueNames, argTVars)) {
      if (!passedArgs.every((d) => d != null)) {
        continue; // some were unknown
      }
      // TODO addVarDependentTypes already supports multiple possibilities. Maybe we don't have to do as much here?

      // params already have a type dependency here

      const dep = env.getTypeDependency(defined(env.bindingVars.get(argName)));
      invariant(dep instanceof TypeDependencyBindingAssignments);

      dep.targetPossibilityCount += passedArgs.length;
      dep.possibilities.push(...passedArgs);

      // HACK: when the var-tracking code creates our
      // TypeDependencyBindingAssignments, it trusts BindingTracker's "assignments",
      // which counts the parameter itself. To fix this, we decrement.
      // If we couldn't get to this line, it would simply never resolve which is great, since we wouldn't know everything this argument could be.
      dep.targetPossibilityCount--;
    }

    // RET TYPE
    const exitNodes = [...astTraverseExitNodes(func as FunctionExpression)];
    const exitTVars = exitNodes.map((node) => {
      invariant(
        node.type === "ReturnStatement",
        "throw not supported right now"
      );
      invariant(
        node.argument,
        "TODO normalize plain return to `return undefined`"
      );

      return defined(env.typeVars.get(node.argument));
    });

    const tVarRet = (tVarFunc.type as FunctionType).returns;
    env.addTypeDependency(
      new TypeDependencyReturnType(
        "the function's return value depends on the tVars of return statements",
        tVarRet,
        exitTVars
      )
    );

    // MAPPING THE RET TYPE TO THE CALLS
    for (const call of callExprNodes) {
      env.addTypeDependency(
        new TypeDependencyCopyReturnToCall(
          "copy the function ret into the callsite",
          defined(env.typeVars.get(call)),
          tVarRet
        )
      );
    }
  }
}

function pass5PumpDependencies(env: TypeEnvironment, _program: Program) {
  const allDeps = env.getAllTypeDependencies();

  for (let pass = 0; pass < 2000000; pass++) {
    let anyProgress = false;

    for (const dep of allDeps) {
      const [done, type] = dep.pump();
      if (done) {
        allDeps.delete(dep);
        anyProgress = true;
      }

      if (type) {
        if (!dep.target.type) {
          dep.target.type = type;
        } else if (dep.target.type.extends(type)) {
          dep.target.type = type;
        } else {
          invariant(false, "TODO: should never occur?");
        }
      }
    }

    if (!anyProgress) return;
  }

  console.warn("Giving up after 2000000 iterations.");
}
