import {
  AnyNode,
  Program,
  Function,
  Pattern,
  Super,
  Identifier,
  Expression,
} from "./augmented-ast.js";
import invariant from "tiny-invariant";

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
