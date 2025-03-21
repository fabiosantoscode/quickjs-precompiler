import {
  astNaiveChildren,
  astNaiveTraversal,
  astTraverseExitNodes,
} from "../ast/ast-traversal";
import {
  AnyNode,
  AssignmentOperator,
  assignmentOperatorToBinaryOperator,
  Expression,
  isComparisonBinaryOperator,
  isExpression,
  isNumericBinaryOperator,
  isStatement,
  Program,
  StatementOrDeclaration,
} from "../ast/augmented-ast";
import { Parents } from "../ast/parents";
import { compileAndRunC } from "../run";
import { enumerate, invariant, ofType, todo, unreachable } from "../utils";
import { TypeMutation } from "./mutation";
import {
  ArrayType,
  BooleanType,
  FunctionType,
  InvalidType,
  NullType,
  NumberType,
  PtrType,
  StringType,
  Type,
  typeEqual,
  typeUnion,
  typeUnionAll,
  TypeVariable,
  UndefinedType,
  UnknownType,
} from "./type";
import {
  TypeBack,
  TypeDependency,
  TypeDependencyCopyArgsToFunction,
  TypeDependencyCopyArgsToMethod,
  TypeDependencyComparisonBinaryOperator,
  TypeDependencyConditionalExpression,
  TypeDependencyDataStructureRead,
  TypeDependencyDataStructureReadComputed,
  TypeDependencyDataStructureWrite,
  TypeDependencyDataStructureWriteComputed,
  TypeDependencyNumericBinaryOperator,
  TypeDependencyTypeBack,
  TypeDependencyVariableRead,
  TypeDependencyVariableWrite,
  TypeDependencyCopyMethodReturnToCaller,
  TypeDependencyCopyReturnToCaller,
  TypeDependencyCopyReturnStatementsToFunctionRet,
} from "./type-dependencies";
import { TypeEnvironment } from "./type-environment";

export function propagateTypes(
  env: TypeEnvironment,
  program: Program,
  unitTestMode = false
) {
  /** Pass 0: fill in TypeEnvironment with empty TypeVariable (containing UnknownType) **/
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
      const expType = getExpressionSelfEvidentType(node)
      if (expType != null) {
        const tVar = env.getNodeTypeVar(node);
        invariant(tVar.type instanceof UnknownType);
        tVar.type = expType;
      }
    }
  }

  function getExpressionSelfEvidentType(node: Expression) {
    switch (node.type) {
      // Simple ones
      case "Literal": {
        switch (typeof node.value) {
          case "number": return (new NumberType());
          case "string": return (new StringType());
          case "boolean": return (new BooleanType());
        }
        if (node.value === null) return (new NullType());
        invariant(false, "unknown literal " + node.value)
      }
      case "ArrayExpression": {
        return PtrType.fromMutableType(new ArrayType(new UnknownType()));
      }
      case "UnaryExpression": {
        switch (node.operator) {
          case "+":
          case "-":
          case "~": return (new NumberType());
          case "!": return (new BooleanType());
          case "delete": return (new BooleanType());
          case "typeof": return (new StringType());
          case "void": return (new UndefinedType());
          default: invariant(false, "unknown unary operator " + (node as any).operator)
        }
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        const func = FunctionType.forASTNode(node.id?.uniqueName);
        return (PtrType.fromMutableType(func));
      }
      case "UpdateExpression": {
        return new NumberType() // x++ and x-- always return a number
      }
      case "BinaryExpression": {
        if (node.operator === '+') {
          return // string or number
        } else if (isNumericBinaryOperator(node.operator)) {
          return new NumberType()
        } else if (isComparisonBinaryOperator(node.operator)) {
          return new BooleanType()
        } else if (node.operator === 'in' || node.operator === 'instanceof') {
          return new BooleanType()
        } else {
          unreachable()
        }
      }
      case "NewExpression": {
        if (node.callee.type === "Identifier") {
          // TODO we should get a function/class
          // from the environment, and call `construct()` on that.
          if (node.callee.uniqueName === "Array@global") {
            return (PtrType.fromMutableType(new ArrayType(new UnknownType())));
          }
          if (node.callee.uniqueName === "Set@global") {
            todo();
          }
          if (node.callee.uniqueName === "Map@global") {
            todo();
          }
        }
        break;
      }
      case "TemplateLiteral": {
        return (new StringType());
      }
    }
  }
}

function pass2MarkDependentTypes(env: TypeEnvironment, program: Program) {
  function onExpression(node: Expression) {
    /** When `node`'s type depends on other types */
    const depends = (
      node: Expression | TypeVariable,
      comment: string,
      dependsOn: (TypeVariable | Expression)[],
      typeBack: TypeBack
    ) => {
      const target = node instanceof TypeVariable ? node : env.getNodeTypeVar(node);
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
      case "ObjectExpression":
      case "UnaryExpression":
      case "UpdateExpression":
        break;
      case "ArrayExpression": {
        if (node.elements.length) {
          depends(
            env.getNodeTypeVar(node),
            "Array depends on array contents' types",
            node.elements.map(node => {
              invariant(node != null && node.type !== 'SpreadElement')
              return node
            }),
            (elements) => new ArrayType(typeUnionAll(elements)),
          )
        }

        break;
      }
      case "BinaryExpression": {
        // "+" operator depends on operands
        invariant(node.left.type !== 'PrivateIdentifier')
        if (isNumericBinaryOperator(node.operator)) {
          env.addTypeDependency(new TypeDependencyNumericBinaryOperator(
            `"${node.operator}" operator`,
            env.getNodeTypeVar(node),
            node.operator,
            env.getNodeTypeVar(node.left),
            env.getNodeTypeVar(node.right)
          ))
        } else if (isComparisonBinaryOperator(node.operator)) {
          env.addTypeDependency(new TypeDependencyComparisonBinaryOperator(
            `"${node.operator}" operator`,
            env.getNodeTypeVar(node),
            node.operator,
            env.getNodeTypeVar(node.left),
            env.getNodeTypeVar(node.right)
          ))
        } else {
          todo()
        }
        break;
      }
      case "AssignmentExpression": {
        const asBinaryOperator = assignmentOperatorToBinaryOperator(node.operator)

        if (node.operator === "=") {
          depends(
            node,
            "assignment expr returns its assigned value",
            [env.getNodeTypeVar(node.right)],
            ([assignedValue]) => assignedValue
          );
        } else if (asBinaryOperator) {
          env.addTypeDependency(new TypeDependencyNumericBinaryOperator(
            `"${node.operator}" assignment operator`,
            env.getNodeTypeVar(node),
            asBinaryOperator,
            env.getNodeTypeVar(node.left),
            env.getNodeTypeVar(node.right)
          ))
        } else {
          todo(node.operator + " assignment operator")
        }

        // Writing to the pattern at the end
        if (node.left.type === "MemberExpression") {
          const { left, right } = node

          if (left.computed) {
            env.addTypeDependency(
              new TypeDependencyDataStructureWriteComputed(
                "write (member expression)",
                env.getNodeTypeVar(left.object),
                env.getNodeTypeVar(left.property),
                env.getNodeTypeVar(right)
              )
            );
          } else {
            const propName = ofType(left.property, 'Identifier').name

            env.addTypeDependency(
              new TypeDependencyDataStructureWrite(
                "write property " + propName,
                env.getNodeTypeVar(left.object),
                propName,
                env.getNodeTypeVar(right)
              )
            )
          }
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

        break;
      }
      case "MemberExpression": {
        if (node.computed) {
          env.addTypeDependency(
            new TypeDependencyDataStructureReadComputed(
              "read (member expression)",
              env.getNodeTypeVar(node),
              env.getNodeTypeVar(node.object),
              env.getNodeTypeVar(node.property)
            )
          );
        } else {
          const propName = ofType(node.property, 'Identifier').name

          env.addTypeDependency(
            new TypeDependencyDataStructureRead(
              "read property " + propName,
              env.getNodeTypeVar(node),
              env.getNodeTypeVar(node.object),
              propName
            )
          )
        }
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
        // Call expressions will:
        //  - Pump the arguments into the callee
        //  - Pump the callee's return value back into the caller
        //
        // The innards of the function depend on what kind of function it is.
        // Is it a JS library method? Or a custom function a user wrote?
        // If it's a JS library method, it could be variadric or change
        // return type based on args.
        // These details are in src/typing/types.ts

        const args = node.arguments.map((arg) => {
          invariant(arg.type !== "SpreadElement");
          return env.getNodeTypeVar(arg);
        })
        if (node.callee.type === 'MemberExpression') {
          invariant(!node.callee.computed)
          invariant(node.callee.property.type === 'Identifier')
          env.addTypeDependency(
            new TypeDependencyCopyArgsToMethod(
              "copy call args to method",
              env.getNodeTypeVar(node.callee.object),
              node.callee.property.name,
              args,
            )
          );

          env.addTypeDependency(
            new TypeDependencyCopyMethodReturnToCaller(
              "copy the method return value to the caller",
              env.getNodeTypeVar(node),
              env.getNodeTypeVar(node.callee.object),
              node.callee.property.name,
              args,
            )
          )
        } else {
          env.addTypeDependency(
            new TypeDependencyCopyArgsToFunction(
              "copy function args to function",
              env.getNodeTypeVar(node.callee),
              args,
            )
          )

          env.addTypeDependency(
            new TypeDependencyCopyReturnToCaller(
              "copy returned value to the function",
              env.getNodeTypeVar(node),
              env.getNodeTypeVar(node.callee),
              args,
            )
          )
        }

        break;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        // Function name, if present, depends on the function's own binding
        if (node.id) {
          const binding = env.getBindingTypeVar(node.id.uniqueName)
          depends(
            binding,
            "function's attached name depends on the function",
            [env.getNodeTypeVar(node)],
            ([funcType]) => funcType
          )
        }

        const returnNodes = [...astTraverseExitNodes(node)]
        if (returnNodes.some(node => node.type === 'ThrowStatement')) {
          env.addTypeDependency(
            new TypeDependencyCopyReturnStatementsToFunctionRet(
              "this function contains a throw statement, so we invalidate it",
              env.getNodeTypeVar(node),
              [new TypeVariable(new InvalidType())]
            )
          );
        } else {
          env.addTypeDependency(
            new TypeDependencyCopyReturnStatementsToFunctionRet(
              "the function's return value depends on the tVars of return statements",
              env.getNodeTypeVar(node),
              returnNodes.map((node) => env.getNodeTypeVar(node.argument))
            )
          );
        }

        for (const [i, param] of enumerate(node.params)) {
          invariant(param.type === "Identifier");
          env.addTypeDependency(
            new TypeDependencyTypeBack(
              `function parameter #${i}`,
              env.getBindingTypeVar(param.uniqueName),
              [env.getNodeTypeVar(node)],
              ([funcType]) => (
                (funcType instanceof PtrType &&
                  funcType.asFunction()?.params.nthFunctionParameter(i)) ||
                null
              )
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
        onExpression(child)
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

  // Sanity checks
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

  for (let pass = 0; pass < 2000000; pass++) {
    let anyProgress = false;

    // TODO what's with this iteration? We should think of this as a cyclic directed graph
    for (const [target, depSet] of allDeps) {
      let originalType = PtrType.deref(target.type);

      const [newType, mutations] = TypeMutation.withMutationsCollected(() => {
        return depSet.reduce((acc, dep): Type => {
          let [_done, type] = dep.pump();

          return typeUnion(type ?? new UnknownType(), acc);
        }, target.type);
      });

      for (const mutation of mutations) {
        const changed = mutation.mutate();
        if (changed) anyProgress = true;
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
            if (!(target.type._target.type instanceof InvalidType)) {
              anyProgress = true;
              target.type._target.type = new InvalidType();
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
