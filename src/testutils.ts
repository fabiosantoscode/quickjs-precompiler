import { inspect } from "util";
import { astNaiveTraversal } from "./ast/ast-traversal";
import { AnyNode } from "./ast/augmented-ast";

export function testToString(x: any) {
  if (typeof x !== "object") return String(x);

  return inspect(x);
}

export function testRevealUniqueNames<T extends AnyNode>(inp: T): T {
  for (const node of astNaiveTraversal(inp)) {
    if (node.type === "Identifier") {
      node.name = node.uniqueName || "<noUniqueName>";
    }
  }
  return inp;
}
