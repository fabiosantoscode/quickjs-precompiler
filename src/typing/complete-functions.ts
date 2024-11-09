import { astNaiveChildren, isFunction } from "../ast/ast-traversal";
import { AnyNode, Function, Identifier, Program } from "../ast/augmented-ast";
import { invariant } from "../utils";

/** A "complete" function is one for which we can know all of its function calls. It is never reassigned, but it may belong in multiple aliases. */
export function findCompleteFunctions(program: Program) {
  /** We use uniqueName as key, so it's OK to use a single map */
  const byName = new Map<string, { node: Function; aliases: string[] }>();
  const iife = new Set<Function>();

  /**
   * First pass: Find functions
   */
  function onFunction(node: Function, parent: AnyNode) {
    const aliases: string[] = [];

    if (node.id) aliases.push(node.id.uniqueName);

    if (parent.type === "VariableDeclarator") {
      if (parent.id.type === "Identifier") {
        aliases.push(parent.id.uniqueName);
      } else {
        return; // leaked
      }
    } else if (parent.type === "CallExpression" && parent.callee === node) {
      iife.add(node);
      // no leaking possible
    } else if (parent.type === "Program" || parent.type === "BlockStatement") {
      // no leaking possible
    } else {
      return; // leaked
    }

    for (const l of aliases) {
      byName.set(l, { node, aliases });
    }
  }

  let setOfAliasesChanged = false; // can assign elsewhere
  function onReference(ident: Identifier, parent: AnyNode) {
    const alias = byName.get(ident.uniqueName);
    if (!alias) return;

    let leaked = true;

    if (parent.type === "CallExpression" && parent.callee === ident) {
      leaked = false;
    }

    if (
      parent.type === "VariableDeclarator" &&
      parent.init === ident &&
      parent.id.type === "Identifier" &&
      !alias.aliases.includes(parent.id.uniqueName)
    ) {
      leaked = false;
      setOfAliasesChanged = true;
      alias.aliases.push(parent.id.uniqueName);
      byName.set(parent.id.uniqueName, alias);
    }

    if (leaked) {
      for (const l of alias.aliases) {
        byName.delete(l);
      }
      iife.delete(alias.node);
    }
  }

  function digest() {
    const allFuncs = new Map<Function, string[]>();

    for (const item of byName.values()) {
      invariant(
        !allFuncs.has(item.node) || item.aliases === allFuncs.get(item.node)
      );
      allFuncs.set(item.node, item.aliases);
    }

    for (const item of iife) {
      if (!allFuncs.has(item)) {
        allFuncs.set(item, []);
      }
    }

    return allFuncs;
  }

  /* Call onFunction now */
  (function recurse(parent: AnyNode) {
    for (const node of astNaiveChildren(parent)) {
      if (isFunction(node)) {
        onFunction(node, parent);
      }

      recurse(node);
    }
  })(program);

  /* Call onReference now */
  do {
    setOfAliasesChanged = false;

    (function recurse(parent: AnyNode) {
      for (const node of astNaiveChildren(parent)) {
        if (node.type === "Identifier" && node.isReference === "reference") {
          onReference(node, parent);
        }

        recurse(node);
      }
    })(program);
  } while (setOfAliasesChanged);

  return digest();
}
