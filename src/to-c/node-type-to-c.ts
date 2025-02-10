import { astMakeBlockOfOne } from "../ast/ast-make";
import {
  AnyNode2,
  BlockStatement,
  Expression,
  FunctionExpression,
  Statement,
  StatementOrDeclaration,
  VariableDeclaration,
} from "../ast/augmented-ast";
import { HygienicNames } from "../ast/hygienic-names";
import {
  BooleanType,
  FunctionType,
  NullType,
  NumberType,
} from "../typing/type";
import { TypeEnvironment } from "../typing/type-environment";
import {
  asInstance,
  defined,
  getLoc,
  invariant,
  ofType,
  unreachable,
} from "../utils";
import { CEmitter } from "./c-emitter";

export const nodeToC: Record<AnyNode2["type"], ToCTransformer> = {} as Record<
  AnyNode2["type"],
  ToCTransformer
>;

// Pass-through: exact analogues exist in C and need no further work.
nodeToC.ReturnStatement = statement("ReturnStatement");
nodeToC.BlockStatement = statement("BlockStatement", {
  canTransform(node, env, hygienicNames) {
    return true;
  },
  emit(node, env, emitter) {
    for (const stat of node.body) {
      nodeToC[stat.type].emit(stat, env, emitter);
    }
  },
});

nodeToC.ThrowStatement = statement("ThrowStatement", {
  canTransform() {
    return false;
  },
});

nodeToC.Literal = expression("Literal", {
  canTransform(node) {
    return typeof node.value === "number";
  },
  emit(node, env, emitter) {
    return emitter.emitNumber(undefined, node.value as number);
  },
});

nodeToC.Identifier = expression("Identifier", {
  canTransform(node, env, hygienicNames) {
    // TODO check if this is in other closures
    return env.getNodeTypeVar(node) != null;
  },
  emit(node, env, emitter) {
    return node.uniqueName;
  },
});

nodeToC.VariableDeclaration = statement("VariableDeclaration", {
  canTransform(node) {
    const decl = node.declarations[0];
    return decl.id.type === "Identifier";
  },
  emit(node, env, emitter) {
    const { id, init } = node.declarations[0];
    const value = nodeToC[init.type]?.emit(init, env, emitter);
    invariant(typeof value === "string");

    invariant(id.type === "Identifier");
    const t = env.getBindingTypeVar(id.uniqueName);
    emitter.emitDeclaration(defined(t.type), id.uniqueName, value);
  },
});

nodeToC.AssignmentExpression = expression("AssignmentExpression", {
  canTransform(node, env) {
    return (
      node.left.type === "Identifier" &&
      env.getBindingTypeVar(node.left.uniqueName) &&
      (node.operator === "=" ||
        node.operator === "+=" ||
        node.operator === "-=")
    );
  },
  emit(node, env, emitter) {
    invariant(node.left.type === "Identifier");
    const exp = nodeToC[node.right.type].emit(node.right, env, emitter);

    emitter.emitAssignment(
      defined(env.getNodeType(node)),
      node.left.uniqueName,
      defined(exp)
    );
  },
});

nodeToC.BinaryExpression = expression("BinaryExpression", {
  canTransform(node, env, hygienicNames) {
    const leftT = env.getNodeType(node.left);
    const rightT = env.getNodeType(node.right);
    const bothNumbers =
      leftT instanceof NumberType && rightT instanceof NumberType;

    if (!(leftT && rightT) || node.left.type === "PrivateIdentifier") {
      return false;
    }

    switch (node.operator) {
      case "==":
      case "===":
      case "!=":
      case "!==": {
        return bothNumbers;
      }
      case "<":
      case "<=":
      case ">":
      case ">=": {
        return bothNumbers;
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
      case "+":
      case "-":
      case "*":
      case "/": {
        return bothNumbers;
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
      default: {
        invariant(false);
      }
    }

    return false;
  },
  emit(node, env, emitter) {
    let { operator } = node;
    if (operator === "!==") operator = "!=";
    if (operator === "===") operator = "==";

    invariant(node.left.type !== "PrivateIdentifier");

    const type = ["==", "!=", "<", "<=", ">", ">="].includes(operator)
      ? new BooleanType()
      : "-+*/".includes(operator)
      ? new NumberType()
      : unreachable();

    const left = defined(
      nodeToC[node.left.type]?.emit(node.left, env, emitter)
    );
    const right = defined(
      nodeToC[node.right.type]?.emit(node.right, env, emitter)
    );

    return emitter.emitBinOp(type, undefined, operator, left, right);
  },
});

nodeToC.ExpressionStatement = statement("ExpressionStatement", {
  canTransform(node) {
    return (
      node.expression.type === "AssignmentExpression" ||
      node.expression.type === "UpdateExpression" ||
      node.expression.type === "CallExpression" ||
      node.expression.type === "UnaryExpression" ||
      node.expression.type === "NewExpression"
    );
  },
  emit(node, env, emitter) {
    return nodeToC[node.expression.type].emit(node.expression, env, emitter);
  },
});

nodeToC.IfStatement = statement("IfStatement", {
  canTransform(node, env, hygienicNames) {
    const type = env.getNodeType(node.test);

    return (
      (type instanceof NumberType || type instanceof BooleanType) &&
      (node.test.type === "BinaryExpression" ||
        (node.test.type === "Literal" &&
          (typeof node.test.value === "number" ||
            typeof node.test.value === "boolean")) ||
        node.test.type === "Identifier")
    );
  },
  emit(node, env, emitter) {
    const rTest = nodeToC[node.test.type].emit(node.test, env, emitter);

    emitter.emitCondition({
      cond: defined(rTest),
      then: () => {
        nodeToC[node.consequent.type].emit(node.consequent, env, emitter);
      },
      else: node.alternate
        ? () => {
            nodeToC[node.alternate!.type].emit(node.alternate!, env, emitter);
          }
        : undefined,
    });
  },
});

nodeToC.FunctionExpression = declaration("FunctionExpression", {
  canTransform(node, env) {
    return env.getNodeType(node) != null;
  },
  intoCDeclarations(mutNode, env, hygienicNames) {
    const cBindingName = hygienicNames.create(mutNode.id?.name);
    const cBody = mutNode.body;
    mutNode.body = placeholderCall(mutNode, cBindingName);

    return {
      type: "VariableDeclaration",
      kind: "var",
      _comment: "intoCDeclarations",
      loc: mutNode.loc,
      declarations: [
        {
          type: "VariableDeclarator",
          loc: mutNode.loc,
          id: {
            type: "Identifier",
            isReference: "declaration",
            uniqueName: cBindingName,
          },
          init: {
            ...mutNode,
            type: "FunctionExpression",
            loc: mutNode.loc,
            body: cBody,
          },
        },
      ],
    };
  },
});

export interface ToCTransformer<T extends AnyNode2 = AnyNode2> {
  canTransform(
    node: T,
    env: TypeEnvironment,
    hygienicNames: HygienicNames
  ): boolean;
  intoCDeclarations?(
    mutNode: T,
    env: TypeEnvironment,
    hygienicNames: HygienicNames
  ): StatementOrDeclaration | StatementOrDeclaration[];
  emit(
    node: T,
    env: TypeEnvironment,
    emitter: CEmitter
  ): string | void | undefined;
}

/** `return ${mutNode.name}(${mutNode.params})` */
function placeholderCall(mutNode: FunctionExpression, name: string) {
  return astMakeBlockOfOne({
    type: "ReturnStatement",
    argument: {
      type: "CallExpression",
      callee: {
        type: "Identifier",
        uniqueName: `${name}@1`,
        name: name,
        isReference: "reference",
        ...getLoc(mutNode.body),
      },
      arguments: mutNode.params.map((param) => ofType(param, "Identifier")),
      optional: false,
      ...getLoc(mutNode.body),
    },
    ...getLoc(mutNode.body),
  });
}

function expression<
  TypeStr extends AnyNode2["type"],
  NodeType extends Extract<AnyNode2, { type: TypeStr }>,
  Transformer extends Pick<ToCTransformer<NodeType>, "canTransform" | "emit">
>(
  typeStr: TypeStr,
  transformer?: Partial<Transformer>
): ToCTransformer<NodeType> {
  return {
    canTransform(node, env, hygienicNames) {
      ofType(node, typeStr);
      return transformer?.canTransform?.(node, env, hygienicNames) ?? true;
    },
    emit(node, env, emitter) {
      return defined(transformer?.emit)(node, env, emitter);
    },
  } as ToCTransformer<NodeType>;
}

function statement<
  TypeStr extends AnyNode2["type"],
  NodeType extends Extract<AnyNode2, { type: TypeStr }>,
  Transformer extends Pick<ToCTransformer<NodeType>, "canTransform" | "emit">
>(
  typeStr: TypeStr,
  transformer?: Partial<Transformer>
): ToCTransformer<NodeType> {
  return {
    canTransform(node, env, hygienicNames) {
      ofType(node, typeStr);
      return transformer?.canTransform?.(node, env, hygienicNames) ?? true;
    },
    emit(node, env, emitter) {
      return defined(transformer?.emit)(node, env, emitter);
    },
  } as ToCTransformer<NodeType>;
}

function declaration<
  TypeStr extends AnyNode2["type"],
  NodeType extends Extract<AnyNode2, { type: TypeStr }>,
  Transformer extends Pick<
    ToCTransformer<NodeType>,
    "canTransform" | "intoCDeclarations" | "emit"
  >
>(
  typeStr: TypeStr,
  transformer: Partial<Transformer>
): ToCTransformer<NodeType> {
  return {
    canTransform(node, env, hygienicNames) {
      ofType(node, typeStr);
      return transformer?.canTransform?.(node, env, hygienicNames) ?? true;
    },
    intoCDeclarations(node, env, hygienicNames) {
      return transformer.intoCDeclarations!(node, env, hygienicNames);
    },
    emit(node, env, emitter) {
      return defined(transformer?.emit)(node, env, emitter);
    },
  } as ToCTransformer<NodeType>;
}
