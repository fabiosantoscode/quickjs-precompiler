import { AnyNode } from "./augmented-ast.js";

export class LocatedErrors {
  #throwError(
    at: AnyNode,
    msg: string | (() => string),
    errorTop: Function
  ): never {
    let msgString = typeof msg === "string" ? msg : msg();
    let err;

    if (at?.loc?.source) {
      err = Error(
        msgString +
          " (" +
          at.loc.source +
          ":" +
          at.loc.start.line +
          ":" +
          at.loc.start.column +
          ")"
      );
    } else if (at?.loc) {
      err = Error(
        msgString + " (" + at.loc.start.line + ":" + at.loc.start.column + ")"
      );
    } else {
      err = Error(msgString);
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, errorTop);
    }

    throw err;
  }

  borkAt(node: AnyNode, msg: string | (() => string) = "Error"): never {
    this.#throwError(node, msg, this.borkAt);
  }

  invariantAt(
    node: AnyNode,
    cond: any,
    msg: string | (() => string) = "Invariant violation"
  ): asserts cond {
    if (!cond) {
      this.#throwError(node, msg, this.invariantAt);
    } else {
      return;
    }
  }
}
