import { parseJsFile, stringifyJsFile } from "../parse";
import { astNaiveTraversal } from "../ast/ast-traversal";
import {
  AnyNode2,
  ArrowFunctionExpression,
  BlockStatement,
  CallExpression,
  Expression,
  Identifier,
  Program,
  Statement,
  VariableDeclaration,
} from "../ast/augmented-ast";

/*
 * First, we will associate type variables with our program.
 * Every node will have a TypeVariable, whose .type may change
 */
import { TypeEnvironment } from "./type-environment";

/* Then, we propagate types.
 * Documented more within propagateTypes()
 */
import { propagateTypes } from "./propagation";
import { defined, invariant } from "../utils";
import { FunctionType, PtrType, typeEqual, TypeVariable } from "./type";

it("propagates types to vars", () => {
  expect(
    testTypes(`
      let variable = 1
      let expression = 1 + 1
      let dependentVar = variable + 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let variable = 1;
    /* Number */ let expression = 1 + 1;
    /* Number */ let dependentVar = variable + 1;"
  `);
});

it("allows variables to have multiple types (by ignoring those)", () => {
  expect(
    testTypesLast(`
      let number = 1;
      number;
      number = '';
      number;
    `)
  ).toMatchInlineSnapshot(`"Invalid"`);
});

it("marks functions", () => {
  expect(
    testTypesLast(`
      function func1() { }
      func1
    `)
  ).toMatchInlineSnapshot(`"Function(func1@2): Undefined"`);
});

it("understands reassignment of mutable vars is not to be followed", () => {
  // The binding below is not followed because it reassigns a mutable var
  expect(
    testTypesLast(`
      let func2 = x => x
      func2 = x => x
      func2
    `)
  ).toMatchInlineSnapshot(`"Ptr Invalid"`);
});

it("marks the return type", () => {
  expect(
    testTypesLast(`
      function func1() { return 1 }
      func1()
    `)
  ).toMatchInlineSnapshot(`"Number"`);
});

it("marks the return type (identity function)", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1(1)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2): Number */ const func1 = function func1(/* Number */ (x)) {
      return /* Number */ (x);
    };
    /* Number */ (func1(1));"
  `);
});

it("marks the return type even if the function wasn't called anywhere", () => {
  expect(
    testTypes(`
      function helloWorld() {
        return 1;
      }
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(helloWorld@2): Number */ const helloWorld = function helloWorld() {
      return /* Number */ (1);
    };"
  `);
});

it("understands changing variables", () => {
  expect(
    testTypes(`
      let x = 1;
      x = 2;
      let y = x;
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let x = 1;
    /* Number */ (x = 2);
    /* Number */ let y = x;"
  `);
});

it("understands nullable types", () => {
  expect(
    testTypes(`
      let x = undefined;
      x = 2;
      let y = x;
    `)
  ).toMatchInlineSnapshot(`
    "/* Optional Number */ let x = /* Undefined */ (undefined);
    /* Number */ (x = 2);
    /* Optional Number */ let y = x;"
  `);
});

it("understands function return types", () => {
  // TODO this lower-level test will look deeper
  var [{ body }, env] = testTypesEnv(`
    let callee = x => x;
    let number = callee(1);
  `);
  const call = (body[1] as VariableDeclaration).declarations[0]
    .init as CallExpression;
  const callee = call.callee as ArrowFunctionExpression;

  expect(env.getNodeType(callee)).toBeInstanceOf(PtrType);
  const funcType = (env.getNodeType(callee) as PtrType).target as FunctionType;
  const xArgType = env.getBindingTypeVar("x@1");
  const xPassedArgType = env.getNodeType(call.arguments[0]);
  const callType = env.getNodeType(call);

  expect(env.getTypeDependencies(xArgType)).toMatchInlineSnapshot(`
    [
      TypeDependencyTypeBack {
        "comment": "function parameter #0",
        "dependencies": [
          TypeVariable {
            "comment": "ArrowFunctionExpression expression",
            "type": PtrType {
              "_target": MutableCell {
                "type": FunctionType {
                  "displayName": "?",
                  "identity": Symbol(),
                  "params": TupleType {
                    "items": [
                      NumberType {},
                    ],
                  },
                  "returns": NumberType {},
                },
              },
            },
          },
        ],
        "target": TypeVariable {
          "comment": "x@1 binding",
          "type": NumberType {},
        },
        "typeBack": [Function],
      },
    ]
  `);

  expect(funcType.toString()).toMatchInlineSnapshot(`"Function(?): Number"`);
  expect(funcType.returns).toMatchInlineSnapshot(`NumberType {}`);
  expect(xPassedArgType).toMatchInlineSnapshot(`NumberType {}`);
  expect(xArgType.type).toMatchInlineSnapshot(`NumberType {}`);
  expect(callType).toMatchInlineSnapshot(`NumberType {}`);
});

it("follows simple assignments", () => {
  expect(
    testTypes(`
      let x = 1;
      x++;
      x = 3;
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let x = 1;
    /* Number */ (x++);
    /* Number */ (x = 3);"
  `);
});

it("follows reassignments of function types", () => {
  expect(
    testTypes(`
      const x = () => 1
      const y = x
      x()
      y()
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const x = () => {
      return /* Number */ (1);
    };
    /* Function(?): Number */ const y = x;
    /* Number */ (x());
    /* Number */ (y());"
  `);
});

it("finds invalid usages of functions after a reassignment", () => {
  expect(
    testTypes(`
      const x = (y) => y + 1
      x(1)
      const y = x
      y('wrong type')
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ const x = (/* Invalid */ (y)) => {
      return /* Invalid */ (y + 1);
    };
    /* Invalid */ (x(1));
    /* Ptr Invalid */ const y = x;
    /* Invalid */ (y('wrong type'));"
  `);
});

it("passes simple func args (new tech)", () => {
  expect(
    testTypes(`
      const func = (shouldBeString) => 1
      func('hi')
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const func = (/* String */ (shouldBeString)) => {
      return /* Number */ (1);
    };
    /* Number */ (func('hi'));"
  `);
});

it.todo("follows arguments passed to reassignments of funcs (new tech)");

it("handles polymorphic function arg types (by ignoring them)", () => {
  expect(
    testTypes(`
      let id = x => 1
      let number = id(1)
      let string = id('1')
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ let id = (/* Invalid */ (x)) => {
      return /* Number */ (1);
    };
    /* Invalid */ let number = id(1);
    /* Invalid */ let string = id('1');"
  `);
});

it("plus operator", () => {
  expect(
    testTypes(`
      const numnum = 1 + 1
      const numstr = 1 + "1"
      const strnum = "1" + 1
      const strstr = "1" + "1"
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ const numnum = 1 + 1;
    /* String */ const numstr = 1 + "1";
    /* String */ const strnum = "1" + 1;
    /* String */ const strstr = "1" + "1";"
  `);
});

it("finds usages of functions after being passed into an arg (new tech)", () => {
  expect(
    testTypes(`
      const callerWithNum = cb => cb(1)
      const callMeWithNum = num => num + 1
      callerWithNum(callMeWithNum)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const callerWithNum = (/* Function(?): Number */ (cb)) => {
      return /* Number */ (cb(1));
    };
    /* Function(?): Number */ const callMeWithNum = (/* Number */ (num)) => {
      return /* Number */ (num + 1);
    };
    /* Number */ (callerWithNum(callMeWithNum));"
  `);
});

it("finds usages of functions after being passed into an arg (2)", () => {
  expect(
    testTypesLast(`
      const callerWithNum = cb => cb(1)
      const callMeWithNum = num => num
      callerWithNum(callMeWithNum)
      callMeWithNum
    `)
  ).toMatchInlineSnapshot(`"Function(?): Number"`);
});

it("finds invalid usage of functions after being passed into an arg (new tech)", () => {
  expect(
    testTypes(`
      const callerWithNum = cb => cb(1)
      const callMeWithStr = str => str
      callMeWithStr('correct type')
      callerWithNum(callMeWithStr)
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ const callerWithNum = (/* Ptr Invalid */ (cb)) => {
      return /* Invalid */ (cb(1));
    };
    /* Ptr Invalid */ const callMeWithStr = (/* Invalid */ (str)) => {
      return /* Invalid */ (str);
    };
    /* Invalid */ (callMeWithStr('correct type'));
    /* Invalid */ (callerWithNum(callMeWithStr));"
  `);
});

it("array contents", () => {
  expect(
    testTypes(`
      const arrayNew = new Array()
      arrayNew[1] = 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = new Array();
    /* Number */ (arrayNew[1] = 1);"
  `);

  expect(
    testTypesLast(`
      const arrayNew = new Array()
      arrayNew[1] = 1
      arrayNew[0]
    `)
  ).toMatchInlineSnapshot(`"Number"`);

  expect(
    testTypes(`
      const arrayNew = [1]
      arrayNew[0]
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = [1];
    /* Number */ (arrayNew[0]);"
  `);

  expect(
    testTypes(`
      const arrayNew = [1]
      arrayNew[0] = 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = [1];
    /* Number */ (arrayNew[0] = 1);"
  `);

  expect(
    testTypes(`
      const arrayNew = [1]
      arrayNew[0]
      arrayNew[0] = 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = [1];
    /* Number */ (arrayNew[0]);
    /* Number */ (arrayNew[0] = 1);"
  `);
});

it("array contents when passed to a func", () => {
  expect(
    testTypesLast(`
      const func = (arr) => arr[1] = 2
      const arrayAssignedElsewhere = new Array()
      func(arrayAssignedElsewhere)
      arrayAssignedElsewhere
    `)
  ).toMatchInlineSnapshot(`"Array Number"`);
});

it("array methods", () => {
  expect(testTypesLast(`[].slice(1)`)).toMatchInlineSnapshot(`"Unknown"`);

  expect(testTypesLast(`[1].slice(1)`)).toMatchInlineSnapshot(`"Array Number"`);

  expect(
    testTypesLast(`
      const arr = [1]
      arr.push(1)
      arr
    `)
  ).toMatchInlineSnapshot(`"Array Number"`);
});

it("string methods", () => {
  // TODO slice/charCodeAt dont work
  expect(testTypesLast(`"".slice(1)`)).toMatchInlineSnapshot(`"String"`);

  expect(testTypesLast(`"x".charCodeAt(0)`)).toMatchInlineSnapshot(`"Number"`);
});

it.todo("array contents (when the array is leaked)");

it("functional: Sheetjs crc32 code", () => {
  expect(
    testTypes(`
      // Sheetjs crc32 code (modified)
      // from: https://cdn.sheetjs.com/crc-32-latest/package/crc32.mjs

      function signed_crc_table()/*:CRC32TableType*/ {
        let c = 0, n = 0, table/*:Array<number>*/ = new Array(256);

        for(n = 0; n != 256; ++n){
          c = n;
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          table[n] = c;
        }

        return table;
      }
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(signed_crc_table@2): Array Number */ const signed_crc_table = function signed_crc_table() {
      /* Number */ let c = 0;
      /* Number */ let n = 0;
      /* Array Number */ let table = new Array(256);
      autoLabel_1: for (n = 0; n != 256; ++n) {
        /* Number */ (c = n);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (table[n] = c);
      }
      return /* Array Number */ (table);
    };"
  `);
});

it("functional: Sheetjs crc32 code", () => {
  expect(
    testTypes(`
      // Sheetjs crc32 code (modified)
      // from: https://cdn.sheetjs.com/crc-32-latest/package/crc32.mjs

      function signed_crc_table()/*:CRC32TableType*/ {
          let c = 0, n = 0, table/*:Array<number>*/ = new Array(256);

          for(n = 0; n != 256; ++n){
              c = n;
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
              table[n] = c;
          }

          return table;
      }

      let T0 = signed_crc_table();
      function slice_by_16_tables(T) {
          let c = 0, v = 0, n = 0, table/*:Array<number>*/ = new Array(4096) ;

          for(n = 0; n != 256; ++n) table[n] = T[n];
          for(n = 0; n != 256; ++n) {
              v = T[n];
              for(c = 256 + n; c < 4096; c += 256) v = table[c] = (v >>> 8) ^ T[v & 0xFF];
          }
          let out = [];
          for(n = 1; n != 16; ++n) out[n - 1] = table.slice(n * 256, n * 256 + 256);
          return out;
      }
      let TT = slice_by_16_tables(T0);
      let T1 = TT[0],  T2 = TT[1],  T3 = TT[2],  T4 = TT[3],  T5 = TT[4];
      let T6 = TT[5],  T7 = TT[6],  T8 = TT[7],  T9 = TT[8],  Ta = TT[9];
      let Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
      function crc32_bstr(bstr/*:string*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          let C = seed/*:: ? 0 : 0 */ ^ -1;
          let i = 0, L = bstr.length
          for(; i < L;) C = (C>>>8) ^ T0[(C^bstr.charCodeAt(i++))&0xFF];
          return ~C;
      }

      function crc32_buf(B/*:ABuf*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          let C = seed/*:: ? 0 : 0 */ ^ -1, L = B.length - 15, i = 0;
          for(; i < L;) C =
              Tf[B[i++] ^ (C & 255)] ^
              Te[B[i++] ^ ((C >> 8) & 255)] ^
              Td[B[i++] ^ ((C >> 16) & 255)] ^
              Tc[B[i++] ^ (C >>> 24)] ^
              Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^
              T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^
              T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]];
          L += 15;
          while(i < L) C = (C>>>8) ^ T0[(C^B[i++])&0xFF];
          return ~C;
      }

      function crc32_str(str/*:string*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          let C = seed/*:: ? 0 : 0 */ ^ -1;
          let i = 0
          let L = str.length
          let c = 0
          let d = 0
          for(; i < L;) {
              c = str.charCodeAt(i++);
              if(c < 0x80) {
                  C = (C>>>8) ^ T0[(C^c)&0xFF];
              } else if(c < 0x800) {
                  C = (C>>>8) ^ T0[(C ^ (192|((c>>6)&31)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(c&63)))&0xFF];
              } else if(c >= 0xD800 && c < 0xE000) {
                  c = (c&1023)+64; d = str.charCodeAt(i++)&1023;
                  C = (C>>>8) ^ T0[(C ^ (240|((c>>8)&7)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((c>>2)&63)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((d>>6)&15)|((c&3)<<4)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(d&63)))&0xFF];
              } else {
                  C = (C>>>8) ^ T0[(C ^ (224|((c>>12)&15)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((c>>6)&63)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(c&63)))&0xFF];
              }
          }
          return ~C;
      }
      let table = T0;
      let bstr = crc32_bstr;
      let buf = crc32_buf;
      let str = crc32_str;

      // Calling methods so they have types!
      str("xx", 1234)
      buf([123], 1234)
      bstr("xx", 1234)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(signed_crc_table@2): Array Number */ const signed_crc_table = function signed_crc_table() {
      /* Number */ let c = 0;
      /* Number */ let n = 0;
      /* Array Number */ let table = new Array(256);
      autoLabel_1: for (n = 0; n != 256; ++n) {
        /* Number */ (c = n);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (table[n] = c);
      }
      return /* Array Number */ (table);
    };
    /* Function(slice_by_16_tables@2): Array Array Number */ const slice_by_16_tables = function slice_by_16_tables(/* Array Number */ (T)) {
      /* Number */ let c = 0;
      /* Number */ let v = 0;
      /* Number */ let n = 0;
      /* Array Number */ let table = new Array(4096);
      autoLabel_2: for (n = 0; n != 256; ++n) {
        /* Number */ (table[n] = T[n]);
      }
      autoLabel_3: for (n = 0; n != 256; ++n) {
        /* Number */ (v = T[n]);
        autoLabel_4: for (c = 256 + n; c < 4096; c += 256) {
          /* Number */ (v = table[c] = v >>> 8 ^ T[v & 0xFF]);
        }
      }
      /* Array Array Number */ let out = [];
      autoLabel_5: for (n = 1; n != 16; ++n) {
        /* Array Number */ (out[n - 1] = table.slice(n * 256, n * 256 + 256));
      }
      return /* Array Array Number */ (out);
    };
    /* Function(crc32_bstr@2): Number */ const crc32_bstr = function crc32_bstr(/* String */ (bstr), /* Number */ (seed)) {
      /* Number */ let C = seed ^ -1;
      /* Number */ let i = 0;
      /* Number */ let L = bstr.length;
      autoLabel_6: for (; i < L; ) {
        /* Number */ (C = C >>> 8 ^ T0[(C ^ bstr.charCodeAt(i++)) & 0xFF]);
      }
      return /* Number */ (~C);
    };
    /* Function(crc32_buf@2): Number */ const crc32_buf = function crc32_buf(/* Array Number */ (B), /* Number */ (seed)) {
      /* Number */ let C = seed ^ -1;
      /* Number */ let L = B.length - 15;
      /* Number */ let i = 0;
      autoLabel_7: for (; i < L; ) {
        /* Number */ (C = Tf[B[i++] ^ C & 255] ^ Te[B[i++] ^ C >> 8 & 255] ^ Td[B[i++] ^ C >> 16 & 255] ^ Tc[B[i++] ^ C >>> 24] ^ Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^ T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^ T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]]);
      }
      /* Number */ (L += 15);
      autoLabel_8: while (i < L) {
        /* Number */ (C = C >>> 8 ^ T0[(C ^ B[i++]) & 0xFF]);
      }
      return /* Number */ (~C);
    };
    /* Function(crc32_str@2): Number */ const crc32_str = function crc32_str(/* String */ (str), /* Number */ (seed)) {
      /* Number */ let C = seed ^ -1;
      /* Number */ let i = 0;
      /* Number */ let L = str.length;
      /* Number */ let c = 0;
      /* Number */ let d = 0;
      autoLabel_9: for (; i < L; ) {
        /* Number */ (c = str.charCodeAt(i++));
        if (c < 0x80) {
          /* Number */ (C = C >>> 8 ^ T0[(C ^ c) & 0xFF]);
        } else {
          if (c < 0x800) {
            /* Number */ (C = C >>> 8 ^ T0[(C ^ (192 | c >> 6 & 31)) & 0xFF]);
            /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 0xFF]);
          } else {
            if (c >= 0xD800 && c < 0xE000) {
              /* Number */ (c = (c & 1023) + 64);
              /* Number */ (d = str.charCodeAt(i++) & 1023);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (240 | c >> 8 & 7)) & 0xFF]);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | c >> 2 & 63)) & 0xFF]);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | d >> 6 & 15 | (c & 3) << 4)) & 0xFF]);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | d & 63)) & 0xFF]);
            } else {
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (224 | c >> 12 & 15)) & 0xFF]);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | c >> 6 & 63)) & 0xFF]);
              /* Number */ (C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 0xFF]);
            }
          }
        }
      }
      return /* Number */ (~C);
    };
    /* Array Number */ let T0 = signed_crc_table();
    /* Array Array Number */ let TT = slice_by_16_tables(T0);
    /* Array Number */ let T1 = TT[0];
    /* Array Number */ let T2 = TT[1];
    /* Array Number */ let T3 = TT[2];
    /* Array Number */ let T4 = TT[3];
    /* Array Number */ let T5 = TT[4];
    /* Array Number */ let T6 = TT[5];
    /* Array Number */ let T7 = TT[6];
    /* Array Number */ let T8 = TT[7];
    /* Array Number */ let T9 = TT[8];
    /* Array Number */ let Ta = TT[9];
    /* Array Number */ let Tb = TT[10];
    /* Array Number */ let Tc = TT[11];
    /* Array Number */ let Td = TT[12];
    /* Array Number */ let Te = TT[13];
    /* Array Number */ let Tf = TT[14];
    /* Array Number */ let table = T0;
    /* Function(crc32_bstr@2): Number */ let bstr = crc32_bstr;
    /* Function(crc32_buf@2): Number */ let buf = crc32_buf;
    /* Function(crc32_str@2): Number */ let str = crc32_str;
    /* Number */ (str("xx", 1234));
    /* Number */ (buf([123], 1234));
    /* Number */ (bstr("xx", 1234));"
  `);
});

function testTypes(code: string) {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram, true);
  return testShowAllTypes(env, basicProgram);
}

function testTypesLast(code: string) {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram, true);
  let last = defined(basicProgram.body.at(-1));
  invariant(last.type === "ExpressionStatement");
  return env.getNodeType(last.expression)?.toString();
}

function testTypesEnv(code: string): [Program, TypeEnvironment] {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram, true);
  return [basicProgram, env];
}

export function testShowAllTypes(env: TypeEnvironment, program: Program) {
  const wrapAll = (node: AnyNode2): AnyNode2 => {
    const wrap = (wrapped: Expression, type = env.getNodeType(wrapped)) => {
      return {
        type: "CallExpression",
        arguments: [wrapAll(wrapped)],
        callee: {
          type: "Identifier",
          name: `/* ${type?.toString()} */ `,
        },
      } as CallExpression;
    };

    if (!node || typeof node !== "object") return node;

    switch (node.type) {
      case "VariableDeclaration": {
        const shouldWrapInit = !typeEqual(
          env.getNodeType(node.declarations[0].init),
          env.getBindingType((node.declarations[0].id as any).uniqueName)
        );
        return {
          ...node,
          kind: (`/* ${env
            .getBindingTypeVar((node.declarations[0].id as any).uniqueName)
            .type?.toString()} */ ` + node.kind) as any,
          declarations: [
            {
              ...node.declarations[0],
              init: (shouldWrapInit
                ? wrap(node.declarations[0].init)
                : wrapAll(node.declarations[0].init)) as Expression,
            },
          ],
        };
      }
      case "ExpressionStatement": {
        return { ...node, expression: wrap(node.expression) };
      }
      case "ReturnStatement": {
        return { ...node, argument: wrap(defined(node.argument)) };
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        return {
          ...node,
          params: node.params.map((param) => {
            invariant(param.type === "Identifier");
            return wrap(param, env.getBindingType(param.uniqueName)) as any;
          }),
          body: wrapAll(node.body) as BlockStatement,
        };
      }
      default: {
        return Object.fromEntries(
          Object.entries(node).map(([key, value]) => {
            if (Array.isArray(value)) {
              return [key, value.map(wrapAll)];
            } else if (
              value &&
              typeof value === "object" &&
              typeof value.type === "string"
            ) {
              return [key, wrapAll(value as AnyNode2)];
            } else {
              return [key, value];
            }
          })
        ) as AnyNode2;
      }
    }
  };

  return stringifyJsFile(wrapAll(program) as Program);
}
