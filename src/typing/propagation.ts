import { invariant } from "../utils";
import {
  astNaiveChildren,
  astNaiveTraversal,
} from "../precompiler/ast-traversal";
import {
  AnyNode,
  AssignmentExpression,
  Expression,
  isExpression,
  Pattern,
  Program,
} from "../precompiler/augmented-ast";
import { defined } from "../utils";
import {
  BooleanType,
  FunctionType,
  NullType,
  NumberType,
  NumericType,
  StringType,
  Type,
  TypeVariable,
  UndefinedType,
} from "./type";
import {
  addDependentType,
  addVarDependentType,
  propagateDependentTypes,
  propagateVarDependentTypes,
  TypeBack,
} from "./type-dependencies";
import { TypeEnvironment } from "./type-environment";

export function propagateTypes(env: TypeEnvironment, program: Program) {
  /** Pass 0: fill in TypeEnvironment with empty TypeVariable's.
   *
   * All expressions will have a unique TypeVariable, whose type will be undefined for now
   * Identifiers referring to the same variable will share their TypeVariable instance, and be indexed in TypeEnvironment.bindingVars
   **/
  assignTypeVariables(env, program);

  /** Pass 1: mark literals, `undefined` and other certainly-known types. */
  markSelfEvidentTypes(env, program);

  /** Pass 2: find assigned variables and create dependent, OneOfType instances */
  for (const node of astNaiveTraversal(program)) {
    type AssignmentLike = {
      left: Pattern;
      right: Expression
      operator: AssignmentExpression["operator"];
      isConstant: boolean;
    };
    function intoAssignmentLike(node: AnyNode): AssignmentLike | undefined {
      if (node.type === "AssignmentExpression") {
        let { left, right, operator } = node;
        return { left, right, operator, isConstant: false };
      } else if (node.type === "VariableDeclaration") {
        invariant(node.declarations.length === 1);
        const kind = node.kind;
        const { id: left, init: right } = node.declarations[0];
        return { left, right, operator: "=", isConstant: kind === "const" };
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

      const leftTVar = defined(env.bindingVars.get(left.uniqueName));
      const rightTVar = defined(env.typeVars.get(right));

      /* TODO treat const differently
      if (isConstant) {
        // Never reassigned!
        env.bindingVars.set(left.uniqueName, rightTVar);
        env.typeVars.set(left, rightTVar);
      } else {
       */
      const binding = defined(program.allBindings.get(left.uniqueName));
      addVarDependentType(env, binding, leftTVar, rightTVar);
    }
  }

  /** Pass 3: knowing that the TypeVariables are defined, create types that depend on them */
  for (const node of astNaiveTraversal(program)) {
    if (isExpression(node)) {
      /** When you can refine your knowledge after knowing other types */
      const depends = (
        dependsOn: (TypeVariable | Expression)[],
        onRefined: TypeBack
      ) => {
        const nodeTVar = env.typeVars.get(node);
        invariant(nodeTVar);
        const dependsOnTVars = dependsOn.map((t) => {
          const tVar = t instanceof TypeVariable ? t : env.typeVars.get(t);
          invariant(tVar);
          return tVar;
        });
        addDependentType(env, dependsOnTVars, nodeTVar, onRefined);
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
                depends([node.left, node.right], ([left, right]) => {
                  if (
                    left instanceof NumberType &&
                    right instanceof NumberType
                  ) {
                    return [true, new NumberType()];
                  }
                  return [false, null];
                });
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

  /** Pass 4: pump dependencies */
  for (let i = 0; i < 20; i++) {
    (function recurse(node: AnyNode) {
      const tVar = env.typeVars.get(node);
      if (tVar) {
        propagateDependentTypes(env, tVar);
      }

      for (const child of astNaiveChildren(node)) {
        recurse(child);
      }

      if (tVar) {
        propagateDependentTypes(env, tVar);
      }
    })(program);

    for (const bindings of program.allBindings.values()) {
      propagateVarDependentTypes(env, bindings);
    }
  }
}

function assignTypeVariables(env: TypeEnvironment, program: Program) {
  for (const binding of program.allBindings.values()) {
    env.bindingVars.set(binding.uniqueName, new TypeVariable());
  }

  for (const node of astNaiveTraversal(program)) {
    if (isExpression(node)) {
      if (node.type === "Identifier") {
        if (node.isReference) {
          const inClosure = env.bindingVars.get(node.uniqueName);
          invariant(node.uniqueName);
          invariant(inClosure);
          env.typeVars.set(node, inClosure);
        }
      } else if (isExpression(node)) {
        const tVar = new TypeVariable();
        env.typeVars.set(node, tVar);

        if (
          (node.type === "FunctionExpression") &&
          node.id
        ) {
          env.bindingVars.set(node.id.uniqueName, tVar);
          env.typeVars.set(node.id, tVar);
        }
      }
    }
  }
}

function markSelfEvidentTypes(env: TypeEnvironment, program: Program) {
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
