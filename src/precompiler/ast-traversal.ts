import { ModuleDeclaration, AnyNode, Program, Statement, Function } from "./augmented-ast.js";

export function astTopLevelChildren(ast: Program): Program['body'] {
    return ast.body
}

export function* astNaiveTraversal(ast: AnyNode): Generator<AnyNode> {
    const queue = new Set([ast])
    for (const item of queue) {
        yield item

        for (const child of astNaiveChildren(item)) {
            queue.add(child)
        }
    }
}

export function* astNaiveChildren(ast: AnyNode | Function): Generator<AnyNode> {
    for (const objValue of Object.values(ast)) {
        if (
            typeof objValue === 'object'
            && objValue != null
            && 'type' in objValue
            && typeof objValue['type'] === 'string'
        ) {
            yield objValue as AnyNode;
        }

        if (Array.isArray(objValue)) {
            for (const arrayItem of objValue) {
                if (
                    typeof arrayItem === 'object'
                    && arrayItem != null
                    && 'type' in arrayItem
                    && typeof arrayItem['type'] === 'string'
                ) {
                    yield arrayItem as AnyNode;
                }
            }
        }
    }
}