import { HygienicNames } from "../ast/hygienic-names";
import {
  BooleanType,
  NullType,
  NumberType,
  Type,
  UndefinedType,
} from "../typing/type";
import { invariant, withLast } from "../utils";

const INDENT = "  ";
export class CEmitter {
  #forwardDeclsText = "";
  #forwardFuncDeclsText = "";
  #codeText = "";
  #indent = 0;
  #hygienicNames: HygienicNames;

  constructor(hyg: HygienicNames) {
    this.#hygienicNames = hyg;
    invariant(hyg.prefix === "r_");
  }

  #emitText(txt: string) {
    if (this.#codeText.endsWith("\n")) {
      this.#codeText += INDENT.repeat(this.#indent);
    }
    this.#codeText += txt;
  }

  #registers = new Set();
  #genRegister() {
    const r = this.#hygienicNames.create() + "@1";
    this.#registers.add(r);
    return r;
  }

  #emitName(name: string) {
    if (this.#registers.has(name)) {
      this.#emitText(name.replace(/@\d+$/, ""));
    } else {
      invariant(name.includes("@"));
      this.#emitText(name.replace(/@/, "_"));
    }
  }

  #emitNumber(num: number) {
    invariant(isFinite(num), num + "");
    if (Math.round(num) === num) {
      this.#codeText += `${num}.0`;
    } else {
      this.#codeText += num.toFixed();
    }
  }

  #emitType(type: Type) {
    this.#emitText(
      (function typeToStr(type: Type) {
        if (type instanceof NumberType) {
          return "double";
        } else if (type instanceof BooleanType) {
          return "int";
        } else if (type instanceof UndefinedType || type instanceof NullType) {
          return "int";
        } else {
          invariant(false, "TODO: " + type.toString());
        }
      })(type)
    );
  }

  #generatorToList(
    cb: (this: CEmitter) => Generator<undefined, void, unknown>
  ): Array<string> {
    const _text = this.#codeText;
    this.#codeText = "";
    const contents = [];

    for (const _ of cb.call(this)) {
      if (this.#codeText) {
        contents.push(this.#codeText);
      }
      this.#codeText = "";
    }

    if (this.#codeText) {
      contents.push(this.#codeText);
    }
    this.#codeText = "";

    this.#codeText = _text;
    return contents;
  }

  #emitParens(cb: (this: CEmitter) => Generator<undefined, void, unknown>) {
    const items = this.#generatorToList(cb);

    this.#emitText("(");
    if (items.reduce((acc, val) => acc + val.length, 0) > 70) {
      this.#emitText("\n");
      this.#indent++;
      for (const [isLast, item] of withLast(items)) {
        this.#emitText(item);
        if (!isLast) this.#emitText(",");
        this.#emitText("\n");
      }
      this.#indent--;
    } else {
      for (const [isLast, item] of withLast(items)) {
        this.#emitText(item);
        if (!isLast) this.#emitText(", ");
      }
    }
    this.#emitText(")");
  }

  #emitBraces(cb: () => void) {
    this.#emitText("{\n");
    this.#indent++;

    cb();

    this.#indent--;
    this.#codeText = this.#codeText.trimEnd();
    this.#emitText("\n");
    this.#emitText("}");
  }

  emitFunction(
    {
      uniqueName,
      params,
      retType,
    }: {
      uniqueName: string;
      params: Record<string, Type>;
      retType: Type;
    },
    inFunction: () => void
  ) {
    const _text = this.#codeText;
    this.#codeText = "";

    this.#emitType(retType);
    this.#emitText(" ");
    this.#emitName(uniqueName);
    this.#emitParens(function* (this: CEmitter) {
      for (const [name, type] of Object.entries(params)) {
        this.#emitType(type);
        this.#emitText(" ");
        this.#emitName(name);
        yield;
      }
    });

    const headText = this.#codeText;
    this.#codeText = _text + headText;

    this.#forwardFuncDeclsText += headText + ";\n";

    this.#emitText(" ");
    this.#emitBraces(() => {
      inFunction();
    });
    this.#emitText("\n\n");
  }

  emitDeclaration(outType: Type, uniqueName: string, value: string) {
    this.#emitType(outType);
    this.#emitText(" ");
    this.#emitName(uniqueName);
    this.#emitText(" = ");
    this.#emitName(value);
    this.#emitText(";\n");
  }

  emitAssignment(outType: Type, uniqueName: string, value: string) {
    this.#emitName(uniqueName);
    this.#emitText(" = ");
    this.#emitName(value);
    this.#emitText(";\n");
    return uniqueName;
  }

  emitNumber(outRegister: string | undefined, arg: number) {
    outRegister ||= this.#genRegister();
    this.#emitType(new NumberType());
    this.#emitText(" ");
    this.#emitName(outRegister);
    this.#emitText(" = ");
    this.#emitNumber(arg);
    this.#emitText(";\n");
    return outRegister;
  }

  emitCondition(opts: { cond: string; then: () => void; else?: () => void }) {
    this.#emitText("if (");
    this.#emitName(opts.cond);
    this.#emitText(") ");
    this.#emitBraces(() => {
      opts.then!();
    });

    if (opts.else) {
      this.#emitText(" else ");
      this.#emitBraces(() => {
        opts.else!();
      });
    }
  }

  emitValueReturningCondition(
    outType: NumberType,
    outRegister: string | undefined,
    opts: { cond: string; then: () => string; else?: () => string }
  ) {
    outRegister ||= this.#genRegister();

    // If return type
    this.#emitType(outType);
    this.#emitText(" ");
    this.#emitName(outRegister);
    this.#emitText(";\n");

    this.#emitText("if (");
    this.#emitName(opts.cond);
    this.#emitText(") ");
    this.#emitBraces(() => {
      const then_ = opts.then!();
      this.emitAssignment(outType, outRegister, then_);
    });

    if (opts.else) {
      this.#emitText(" else ");
      this.#emitBraces(() => {
        const else_ = opts.else!();
        this.emitAssignment(outType, outRegister, else_);
      });
    }

    return outRegister;
  }

  emitBinOp(
    outType: NumberType,
    outRegister: string | undefined,
    operator: string,
    left: string,
    right: string
  ): string {
    outRegister ||= this.#genRegister();
    this.#emitType(outType);
    this.#emitText(" ");
    this.#emitName(outRegister);
    this.#emitText(" = ");
    this.#emitName(left);
    this.#emitText(" " + operator + " ");
    this.#emitName(right);
    this.#emitText(";\n");
    return outRegister;
  }

  emitReturn(register: string) {
    this.#emitText("return ");
    this.#emitName(register);
    this.#emitText(";\n");
  }

  // AT THE END

  finish() {
    this.#codeText = this.#codeText.trimEnd();
  }

  getForwardDecls() {
    return this.#forwardDeclsText;
  }

  getForwardFuncDecls() {
    return this.#forwardFuncDeclsText;
  }

  getCodeText() {
    return this.#codeText;
  }

  getFullCCode() {
    return this.#forwardDeclsText + this.#forwardFuncDeclsText + this.#codeText;
  }
}
