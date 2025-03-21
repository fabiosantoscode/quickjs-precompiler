import { ArrayType, NumberType, StringType, Type, typeEqual } from '../typing/type'
import { defined, invariant, unreachable } from '../utils'

type TypeClass = { new(...a: any[]): Type }

export const library = {
  byType: new Map<TypeClass, LibraryObject>(),
  byName: new Map<string, LibraryObject>(),
}

const string = libraryObject('String', StringType)
string.addMethod('charCodeAt', 'Number -> String')

type Method = {
  methodName: string
  functor: ReturnType<typeof functor>
}
type LibraryObject = ReturnType<typeof libraryObject>
function libraryObject(objectName: string, typeClass: TypeClass) {
  const libObj = {
    addMethod(methodName: string, func: string) {
      this.methods[methodName] = {
        methodName,
        functor: functor(func),
      }
    },
    methods: {} as Record<string, Method>,
  }

  library.byName.set(objectName, libObj)
  library.byType.set(typeClass, libObj)

  return libObj
}

/**
 * Examples:
 *
 * Basic Syntax: String, Number -> Number
 *               -> String
 * Arrays: Array Array String
 * Many signatures: Number -> Number | String -> Number
 * Type variables: $A -> $A
 */
function functor(syntax: string) {
  const splitSignatures = syntax.trim().split(/\s*\|\s*/g)

  const signatures: {args: Matcher[], ret: Matcher}[] = []
  for (const signature of splitSignatures) {
    const argsAndRet = signature.split(/\s*->\s*/g)
    invariant(argsAndRet.length === 2)
    const [args, ret] = argsAndRet

    signatures.push({
      args: args.split(/\s*,\s*/g).filter(arg => !!arg).map(arg => readMatcher(arg)),
      ret: readMatcher(ret)
    })
  }

  function readMatcher(arg: string): Matcher {
    if (arg.startsWith('$')) {
      return { type: 'typeVariable', typeVariable: arg.slice(1) }
    }
    if (arg.startsWith('Array ')) {
      return { type: 'arrayOf', arrayOf: readMatcher(arg.slice('Array '.length)) }
    }
    if (arg === 'String') {
      return { type: 'just', just: new StringType() }
    }
    if (arg === 'Number') {
      return { type: 'just', just: new NumberType() }
    }

    unreachable(arg)
  }

  function match(argTypes: Type[]): Type | null {
    NEXT_SIGNATURE: for (const { args, ret } of signatures) {
      if (argTypes.length !== args.length) continue

      const variables = new Map()
      for (let i = 0; i < args.length; i++) {
        const arg = argTypes[i]
        const desiredArg = args[i]

        const thisArgMatches = matchOneArg(arg, desiredArg, variables, true)
        if (!thisArgMatches) continue NEXT_SIGNATURE
      }

      // All args match, now get the return
      return unmatchRet(ret, variables)
    }

    function matchOneArg(arg: Type, desiredArg: Matcher, variables: Map<string, Type>, writingVariables: boolean): boolean {
      if (desiredArg.type === 'typeVariable') {
        if (writingVariables) {
          variables.set(desiredArg.typeVariable, arg)
          return true
        } else {
          return typeEqual(defined(variables.get(desiredArg.typeVariable)), arg)
        }
      }
      if (desiredArg.type === 'arrayOf') {
        return arg instanceof ArrayType
          && matchOneArg(arg.arrayItem, desiredArg.arrayOf, variables)
      }
      if (desiredArg.type === 'just') {
        return typeEqual(desiredArg.just, arg)
      }

      unreachable()
    }

    function unmatchRet(ret: Matcher, variables: Map<string, Type>) {
      if (ret.type === 'typeVariable') {
        return defined(variables.get(ret.typeVariable))
      }
      if (ret.type === 'arrayOf') {
        return new ArrayType(unmatchRet(ret.arrayOf, variables))
      }
      if (ret.type === 'just') {
        return ret.just
      }
    }

    return null
  }

  type Matcher =
    { type: 'typeVariable', typeVariable: string }
    | { type: 'arrayOf', arrayOf: Matcher }
    | { type: 'just', just: Type }

  return { match }
}
