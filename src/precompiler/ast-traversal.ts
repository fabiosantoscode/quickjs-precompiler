import {
  AnyNode,
  Program,
  Pattern,
  Identifier,
  Expression,
  Function,
  FunctionExpression,
  ArrowFunctionExpression,
  AnyNode2,
  BlockStatement,
  StaticBlock,
} from "./augmented-ast";
import { invariant } from "../utils";

export const unknownAbort = new Error("not an error. aborting due to unknown");

export function astTopLevelChildren(ast: Program): Program["body"] {
  return ast.body;
}

export function* astNaiveTraversal(ast: AnyNode): Generator<AnyNode> {
  const queue = new Set([ast]);
  for (const item of queue) {
    yield item;

    for (const child of astNaiveChildren(item)) {
      queue.add(child);
    }
  }
}

export function astIsBodyArrayHaver(
  ast: AnyNode2
): ast is BlockStatement | Program {
  return (
    ast.type === "BlockStatement" ||
    ast.type === "Program" ||
    ast.type ===
      ("StaticBlock" as any /* StaticBlock is *kind of* supported rn */)
  );
}

type GoInto = {
  classes: boolean;
  classProperties: boolean;
  switchStatements: boolean;
  tryCatch: boolean;
  functions: boolean;
  expressions: boolean;
  patterns: boolean;
  labels: boolean;
  super: boolean;
};
type GoThrough = {
  expressions: boolean;
  patterns: boolean;
  classProperties: boolean;
  switchStatements: boolean;
  tryCatch: boolean;
};

export const goIntoAll: GoInto = {
  classes: true,
  classProperties: true,
  switchStatements: true,
  tryCatch: true,
  functions: true,
  expressions: true,
  patterns: true,
  labels: true,
  super: true,
};
export const goIntoStatements: GoInto = {
  classes: false,
  classProperties: false,
  switchStatements: false,
  tryCatch: false,
  functions: true,
  expressions: false,
  patterns: false,
  labels: false,
  super: false,
};
export const goThroughAll: GoThrough = {
  expressions: true,
  patterns: true,
  classProperties: true,
  switchStatements: true,
  tryCatch: true,
};

export function* astRawTraversal(
  ast: AnyNode2,
  goInto: GoInto,
  goThrough: GoThrough
): Generator<AnyNode2, undefined, undefined> {
  function* through(thing?: AnyNode2 | null) {
    for (const child of thing != null
      ? astRawTraversal(thing, goInto, goThrough)
      : []) {
      yield child;
    }
  }
  function* throughPattern(
    thing?: Pattern | null
  ): Generator<AnyNode2, undefined, undefined> {
    switch (thing?.type) {
      case undefined:
        return;

      case "Identifier":
        return;

      case "ArrayPattern": {
        for (const item of thing.elements) yield* throughPattern(item);
        return;
      }

      case "ObjectPattern": {
        for (const item of thing.properties) {
          if (item.type === "RestElement") {
            yield* throughPattern(item.argument);
          } else if (item.type === "Property") {
            if (item.computed) {
              if (goInto.expressions) yield item.key;
              else if (goThrough.expressions) yield* through(item.key);
            }

            yield* throughPattern(item.value);
          }
        }
        return;
      }

      case "AssignmentPattern": {
        yield* throughPattern(thing.left);

        if (goInto.expressions) yield thing.right;
        else if (goThrough.expressions) yield* through(thing.right);

        return;
      }

      case "RestElement": {
        yield* throughPattern(thing.argument);

        return;
      }

      case "MemberExpression": {
        if (thing.object.type === "Super") {
          if (goInto.super) yield thing.object;
        } else {
          if (goInto.expressions) yield thing.object;
          else if (goThrough.expressions) yield* through(thing.object);
        }

        if (!thing.computed && thing.property.type !== "PrivateIdentifier") {
          if (goInto.expressions) yield thing.property;
          else if (goThrough.expressions) yield* through(thing.property);
        }

        return;
      }

      default: {
        invariant(false, "unreachable");
      }
    }
  }
  switch (ast.type) {
    case "Program": {
      yield* ast.body;
      return;
    }

    // Import/export

    case "ImportExpression": {
      yield ast.source;
      return;
    }

    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
    case "ExportAllDeclaration": {
      return;
    }

    case "BlockStatement": {
      yield* ast.body;
      return;
    }
    case "WithStatement": {
      invariant(false);
    }
    case "LabeledStatement": {
      yield ast.body;
      return;
    }
    case "IfStatement": {
      if (goInto.expressions) yield ast.test;
      else if (goThrough.expressions) yield* through(ast.test);
      yield ast.consequent;
      if (ast.alternate) yield ast.alternate;
      return;
    }
    case "SwitchStatement": {
      if (goInto.switchStatements) {
        if (goInto.expressions) yield ast.discriminant;
        else if (goThrough.expressions) yield* through(ast.discriminant);

        for (const item of ast.cases) {
          if (item.test) {
            if (goInto.expressions) yield item.test;
            else if (goThrough.expressions) yield* through(item.test);
          }
          yield* item.consequent;
        }
      } else if (goThrough.switchStatements) {
        if (goInto.expressions) yield ast.discriminant;
        else if (goThrough.expressions) yield* through(ast.discriminant);

        for (const item of ast.cases) {
          if (item.test) {
            if (goInto.expressions) yield item.test;
            else if (goThrough.expressions) yield* through(item.test);
          }
          yield* item.consequent;
        }
      }
      return;
    }
    case "TryStatement": {
      if (goInto.tryCatch) {
        yield ast.block;
        if (ast.handler) {
          if (goInto.patterns && ast.handler.param) yield ast.handler.param;
          yield ast.handler.body;
        }
        if (ast.finalizer) yield ast.finalizer;
      } else if (goThrough.tryCatch) {
        yield ast.block;
        if (ast.handler) {
          yield* throughPattern(ast.handler.param);
          yield ast.handler.body;
        }
        if (ast.finalizer) yield ast.finalizer;
      }
      return;
    }

    // Declarations
    case "VariableDeclaration": {
      const { id, init } = ast.declarations[0];

      if (goInto.patterns) yield id;
      else if (goThrough.patterns) yield* throughPattern(id);
      if (goInto.expressions && init) yield init;
      else if (goThrough.expressions && init) yield* through(init);

      return;
    }

    // Classes, funcs
    case "ClassDeclaration":
    case "ClassExpression": {
      invariant(false, "TODO");
      /*
      if (goInto.classes) {
        if (goInto.patterns && ast.id) {
          yield ast.id;
        } else if (goThrough.patterns && ast.id) {
          yield* throughPattern(ast.id);
        }

        for (const item of ast.body.body) {
          if (item.type === "StaticBlock") yield* item.body;
          else if (goInto.classProperties) {
            if (item.key.type !== "PrivateIdentifier") {
              if (item.computed && goInto.expressions) {
                yield item.key;
              } else if (item.computed && goThrough.expressions) {
                yield* through(item.key);
              }
            }

            if (item.type === "MethodDefinition") {
              if (goInto.functions) yield item.value;
            } else {
              if (goInto.expressions && item.value) yield item.value;
              else if (goThrough.expressions && item.value)
                yield* through(item.value);
            }
          } else if (goThrough.classProperties) {
            if (item.key.type !== "PrivateIdentifier") {
              if (item.computed && goInto.expressions) {
                yield item.key;
              } else if (item.computed && goThrough.expressions) {
                yield* through(item.key);
              }
            }

            if (item.type === "MethodDefinition") {
              if (goInto.functions) yield item.value;
            } else {
              if (goInto.expressions && item.value) yield item.value;
              else if (goThrough.expressions && item.value)
                yield* through(item.value);
            }
          }
        }
      }
      */
      return;
    }

    // FunctionDeclaration still exists during normalizing
    case "FunctionDeclaration" as any as "FunctionExpression":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      if (goInto.patterns) {
        if (ast.id) yield ast.id;
      }

      if (goInto.functions) {
        if (goInto.patterns) {
          for (const pat of ast.params) {
            yield pat;
          }
        } else if (goThrough.patterns) {
          for (const pat of ast.params) {
            yield* throughPattern(pat);
          }
        }

        yield ast.body;
      }

      return;
    }

    // Func calls
    case "CallExpression":
    case "NewExpression": {
      if (goInto.expressions) {
        if (ast.callee.type === "Super") {
          if (goInto.super) yield ast.callee;
        } else {
          yield ast.callee;
        }

        for (const arg of ast.arguments) {
          if (arg.type === "SpreadElement") {
            yield arg.argument;
          } else {
            yield arg;
          }
        }
      } else if (goThrough.expressions) {
        if (ast.callee.type === "Super") {
          if (goInto.super) yield ast.callee;
        } else {
          yield* through(ast.callee);
        }

        for (const arg of ast.arguments) {
          if (arg.type === "SpreadElement") {
            yield* through(arg.argument);
          } else {
            yield* through(arg);
          }
        }
      }
      return;
    }

    // Loopies
    case "WhileStatement":
    case "DoWhileStatement": {
      if (goInto.expressions) {
        yield ast.test;
      } else if (goThrough.expressions) {
        yield* through(ast.test);
      }
      yield ast.body;
      return;
    }

    case "ForStatement": {
      if (ast.init?.type === "VariableDeclaration") {
        yield ast.init;
      } else if (ast.init && goInto.expressions) {
        yield ast.init;
      } else if (ast.init && goThrough.expressions) {
        yield* through(ast.init);
      }
      if (ast.test && goInto.expressions) {
        yield ast.test;
      } else if (ast.test && goThrough.expressions) {
        yield* through(ast.test);
      }
      if (ast.update && goInto.expressions) {
        yield ast.update;
      } else if (ast.update && goThrough.expressions) {
        yield* through(ast.update);
      }
      yield ast.body;
      return;
    }
    case "ForInStatement":
    case "ForOfStatement": {
      if (ast.left.type === "VariableDeclaration") {
        yield ast.left;
      } else if (goInto.patterns) {
        yield ast.left;
      } else if (goThrough.patterns) {
        yield* through(ast.left);
      }

      if (goInto.expressions) yield ast.right;
      else if (goThrough.expressions) yield* through(ast.right);

      yield ast.body;
      return;
    }

    // Values
    case "TemplateLiteral": {
      if (goInto.expressions) {
        yield* ast.expressions;
      } else if (goThrough.expressions) {
        for (const e of ast.expressions) {
          yield* through(e);
        }
      }
      return;
    }
    case "TaggedTemplateExpression": {
      if (goInto.expressions) {
        yield ast.tag;
        yield* ast.quasi.expressions;
      } else if (goThrough.expressions) {
        yield* through(ast.tag);
        for (const e of ast.quasi.expressions) {
          yield* through(e);
        }
      }
      return;
    }

    // Containers
    case "ArrayExpression": {
      if (goInto.expressions) {
        for (const item of ast.elements) {
          if (item?.type === "SpreadElement") yield item.argument;
          else if (item) yield item;
        }
      } else if (goThrough.expressions) {
        for (const item of ast.elements) {
          if (item?.type === "SpreadElement") yield* through(item.argument);
          else if (item) yield* through(item);
        }
      }
      return;
    }
    case "ObjectExpression": {
      if (goInto.expressions) {
        for (const item of ast.properties) {
          if (item.type === "SpreadElement") yield item.argument;
          else {
            if (item.computed) yield item.key;
            if (item.kind !== "init") {
              // get/set (TODO: differentiate this?)
              yield item.value;
            } else {
              yield item.value;
            }
          }
        }
      } else if (goThrough.expressions) {
        for (const item of ast.properties) {
          if (item.type === "SpreadElement") yield* through(item.argument);
          else {
            if (item.computed) yield* through(item.key);
            if (item.kind !== "init") {
              // get/set (TODO: differentiate this?)
              yield* through(item.value);
            } else {
              yield* through(item.value);
            }
          }
        }
      }
      return;
    }

    // Operators
    case "UnaryExpression":
    case "UpdateExpression": {
      if (goInto.expressions) yield ast.argument;
      else if (goThrough.expressions) yield* through(ast.argument);
      return;
    }
    case "BinaryExpression":
    case "LogicalExpression": {
      if (goInto.expressions) {
        if (ast.left.type !== "PrivateIdentifier") yield ast.left;
        yield ast.right;
      } else if (goThrough.expressions) {
        if (ast.left.type !== "PrivateIdentifier") yield* through(ast.left);
        yield* through(ast.right);
      }
      return;
    }
    case "SequenceExpression": {
      if (goInto.expressions) yield* ast.expressions;
      else if (goThrough.expressions) {
        for (const exp of ast.expressions) {
          yield* through(exp);
        }
      }
      return;
    }

    case "ChainExpression": {
      if (goInto.expressions) yield ast.expression;
      else if (goThrough.expressions) yield* through(ast.expression);
      return;
    }
    case "MemberExpression": {
      if (goInto.expressions) {
        if (ast.object.type !== "Super") yield ast.object;
        if (ast.computed && ast.property.type !== "PrivateIdentifier") {
          yield ast.property;
        }
      } else if (goThrough.expressions) {
        if (ast.object.type !== "Super") yield* through(ast.object);
        if (ast.computed && ast.property.type !== "PrivateIdentifier") {
          yield* through(ast.property);
        }
      }
      return;
    }

    // Other exprs
    case "AssignmentExpression": {
      if (goInto.patterns) yield ast.left;
      else if (goThrough.patterns) yield* throughPattern(ast.left);
      if (goInto.expressions) yield ast.right;
      else if (goThrough.expressions) yield* through(ast.right);
      return;
    }
    case "ConditionalExpression": {
      if (goInto.expressions) {
        yield ast.test;
        yield ast.consequent;
        yield ast.alternate;
      } else if (goThrough.expressions) {
        yield* through(ast.test);
        yield* through(ast.consequent);
        yield* through(ast.alternate);
      }
      return;
    }

    // Simplest
    case "ThrowStatement": {
      if (goInto.expressions) yield ast.argument;
      else if (goThrough.expressions) yield* through(ast.argument);
      return;
    }
    case "ReturnStatement":
    case "YieldExpression":
    case "AwaitExpression": {
      if (goInto.expressions && ast.argument) yield ast.argument;
      else if (goThrough.expressions && ast.argument)
        yield* through(ast.argument);
      return;
    }
    case "BreakStatement": {
      if (goInto.labels && ast.label) yield ast.label;
      return;
    }
    case "ContinueStatement": {
      if (goInto.labels && ast.label) yield ast.label;
      return;
    }
    case "EmptyStatement": {
      return;
    }
    case "ExpressionStatement": {
      if (goInto.expressions) yield ast.expression;
      else if (goThrough.expressions) yield* through(ast.expression);
      return;
    }

    case "DebuggerStatement":
    case "MetaProperty":
    case "Super":
    case "Literal":
    case "Identifier":
    case "ThisExpression": {
      return;
    }

    case "ObjectPattern":
    case "ArrayPattern":
    case "RestElement":
    case "AssignmentPattern": {
      yield* throughPattern(ast);
      return;
    }

    default: {
      throw new Error(`Unknown statement type ${(ast as any).type}`);
    }
  }
}

export function* astTraverseBodyHavers(
  node: AnyNode2
): Generator<Program | StaticBlock | BlockStatement> {
  if (node.type === "ClassExpression" || node.type === "ClassDeclaration") {
    invariant(false, "TODO");
  }

  function* recurse(
    node: AnyNode2
  ): Generator<Program | StaticBlock | BlockStatement> {
    for (const child of astRawTraversal(node, goIntoStatements, goThroughAll)) {
      if (astIsBodyArrayHaver(child)) {
        yield child;
      } else {
        yield* recurse(child);
      }
    }
  }

  yield* recurse(node);
}

export function* astNaiveChildren(ast: AnyNode | Function): Generator<AnyNode> {
  for (const objValue of Object.values(ast)) {
    if (
      typeof objValue === "object" &&
      objValue != null &&
      "type" in objValue &&
      typeof objValue["type"] === "string"
    ) {
      yield objValue as AnyNode;
    }

    if (Array.isArray(objValue)) {
      for (const arrayItem of objValue) {
        if (
          typeof arrayItem === "object" &&
          arrayItem != null &&
          "type" in arrayItem &&
          typeof arrayItem["type"] === "string"
        ) {
          yield arrayItem as AnyNode;
        }
      }
    }
  }
}

export function isFunction(
  item: AnyNode | Function
): item is FunctionExpression | ArrowFunctionExpression {
  return (
    item.type === "FunctionDeclaration" ||
    item.type === "FunctionExpression" ||
    item.type === "ArrowFunctionExpression"
  );
}

export function astPatternAssignedBindings(
  pattern: Pattern,
  items = [] as Identifier[]
): Identifier[] {
  switch (pattern.type) {
    case "Identifier": {
      items.push(pattern);
      break;
    }
    case "ArrayPattern": {
      for (const item of pattern.elements) {
        if (item) {
          astPatternAssignedBindings(item, items);
        }
      }
      break;
    }
    case "MemberExpression": {
      // Nothing to do: we might have been mutated, but no bindings changed.
      break;
    }
    case "AssignmentPattern": {
      astPatternAssignedBindings(pattern.left), items;
      break;
    }
    case "ObjectPattern": {
      for (const item of pattern.properties) {
        if (item.type === "RestElement") {
          astPatternAssignedBindings(item.argument, items);
        } else if (item.type === "Property") {
          astPatternAssignedBindings(item.value, items);
        } else {
          invariant(false);
        }
      }
      break;
    }
    case "RestElement": {
      astPatternAssignedBindings(pattern.argument, items);
      break;
    }
    default: {
      // unreachable
      invariant(false, "unknown pattern node type " + (pattern as any).type);
    }
  }

  return items;
}

/** Non-pattern expressions within a pattern, such as computed keys or default values */
export function astPatternGetExpressions(
  pattern: Pattern,
  items = [] as Expression[]
): Expression[] {
  switch (pattern.type) {
    case "Identifier": {
      break;
    }
    case "ArrayPattern": {
      for (const item of pattern.elements) {
        if (item) {
          astPatternGetExpressions(item, items);
        }
      }
      break;
    }
    case "MemberExpression": {
      items.push(pattern);
      break;
    }
    case "AssignmentPattern": {
      astPatternGetExpressions(pattern.left, items);
      items.push(pattern.right);
      break;
    }
    case "ObjectPattern": {
      for (const item of pattern.properties) {
        if (item.type === "RestElement") {
          astPatternGetExpressions(item.argument, items);
        } else if (item.type === "Property") {
          astPatternGetExpressions(item.value, items);
          if (item.computed) {
            items.push(item.key);
          }
        } else {
          invariant(false);
        }
      }
      break;
    }
    case "RestElement": {
      astPatternGetExpressions(pattern.argument, items);
      break;
    }
    default: {
      // unreachable
      invariant(false, "unknown pattern node type " + (pattern as any).type);
    }
  }

  return items;
}
