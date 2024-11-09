import { astRawTraversal, goThroughAll } from "../ast-traversal";
import { AnyNode2, Program } from "../augmented-ast";

/** Identifiers can be references, declarations, or just part of the AST in other places (properties, labels). We add a property to disambiguate */
export function normalizeMarkReferences(root: Program) {
  const traverseAll = {
    patterns: false, // <- false
    labels: false,
    tryCatch: true,
    classes: true,
    classProperties: true,
    expressions: true,
    functions: true,
    super: false,
    switchStatements: true,
  };

  const traverseJustReferences = {
    ...traverseAll,
    patterns: false,
  };
  const traverseReferencesAndPatterns = {
    ...traverseAll,
    patterns: true,
  };
  function justReferences(node: AnyNode2) {
    if (node.type === "Identifier") {
      node.isReference = "reference";
    }
    const children = astRawTraversal(
      node,
      traverseJustReferences,
      goThroughAll
    );
    for (const child of children) {
      justReferences(child);
    }
  }
  function patterns(node: AnyNode2) {
    if (node.type === "Identifier" && !node.isReference) {
      node.isReference = "declaration";
    }
    const children = astRawTraversal(
      node,
      traverseReferencesAndPatterns,
      goThroughAll
    );
    for (const child of children) {
      patterns(child);
    }
  }

  justReferences(root);
  patterns(root);
}
