import { AnyNode } from "./augmented-ast"
import { astNaiveTraversal } from "./ast-traversal"

export function testRevealUniqueNames(inp: AnyNode) {
    for (const node of astNaiveTraversal(inp)) {
        if (node.type === 'Identifier') {
            node.name = node.uniqueName || 'noUniqueNameHere'
        }
    }
}
