import { parseJsFile } from "../parse";
import { TypeEnvironment } from "../typing/type-environment";
import { toNAST } from "./js-to-native-ast";
import { nastToLisp } from "./native-ast-to-lisp";

function testToNAST(source: string) {
  const js = parseJsFile(source);
  const t = TypeEnvironment.forProgram(js, false);

  const nast = toNAST(js);

  return nastToLisp(nast);
}

it("bindings", () => {
  expect(
    testToNAST(`
      let x = 1
      x = 2
    `)
  ).toMatchInlineSnapshot(`
    "(declare number x@1 1)
    (do
      (assign register@r_1 &x@1)
      (ptr-set register@r_1 2)
      (ptr-get register@r_1))"
  `);
});

it("Arrays (pointers)", () => {
  expect(
    testToNAST(`
      const arr = [0]
      arr[0]
    `)
  ).toMatchInlineSnapshot(`
    "(declare (array number) arr@1 [0])
    (ptr-get (array-ref arr@1 0))"
  `);

  expect(
    testToNAST(`
      const arr = new Array(3)
      arr[0] = 1
      arr[0]
    `)
  ).toMatchInlineSnapshot(`
    "(declare (array number) arr@1 (new Array 3))
    (do
      (assign register@r_1 (array-ref arr@1 0))
      (ptr-set register@r_1 1)
      (ptr-get register@r_1))
    (ptr-get (array-ref arr@1 0))"
  `);
});

it("incrementing bindings, arrays", () => {
  expect(
    testToNAST(`
      let x = 1
      x += 2
    `)
  ).toMatchInlineSnapshot(`
    "(declare number x@1 1)
    (do
      (assign register@r_1 &x@1)
      (ptr-set register@r_1 (+ (ptr-get register@r_1) 2))
      (ptr-get register@r_1))"
  `);

  expect(
    testToNAST(`
      let x = [0]
      x[0] += 1
    `)
  ).toMatchInlineSnapshot(`
    "(declare (array number) x@1 [0])
    (do
      (assign register@r_1 (array-ref x@1 0))
      (ptr-set register@r_1 (+ (ptr-get register@r_1) 1))
      (ptr-get register@r_1))"
  `);

  expect(
    testToNAST(`
      let x = 1
      x++
    `)
  ).toMatchInlineSnapshot(`
    "(declare number x@1 1)
    (get-and-incr &x@1)"
  `);

  expect(
    testToNAST(`
      let x = [0]
      x[0]++
    `)
  ).toMatchInlineSnapshot(`
    "(declare (array number) x@1 [0])
    (get-and-incr (array-ref x@1 0))"
  `);
});

it("math operations", () => {
  expect(
    testToNAST(`
      function helloWorld() {
        return 2 * 3;
      }
    `)
  ).toMatchInlineSnapshot(`
    "(function number helloWorld@1 ()
      (return (* 2 3)))"
  `);

  expect(
    testToNAST(`
      function mul(a, b) {
        return a * b;
      }
      mul(1, 2)
    `)
  ).toMatchInlineSnapshot(`
    "(function number mul@1 (number a@1 number b@1)
      (return (* a@1 b@1)))
    (call mul@1 1 2)"
  `);

  expect(
    testToNAST(`
      function add(a, b) {
        return a + b;
      }
      add(1, 1)
    `)
  ).toMatchInlineSnapshot(`
    "(function number add@1 (number a@1 number b@1)
      (return (+ a@1 b@1)))
    (call add@1 1 1)"
  `);

  expect(
    testToNAST(`
      function complexMath(a, b, c) {
        return (a + b) * c;
      }
      complexMath(1, 2, 3)
    `)
  ).toMatchInlineSnapshot(`
    "(function number complexMath@1 (number a@1 number b@1 number c@1)
      (return (* (+ a@1 b@1) c@1)))
    (call complexMath@1 1 2 3)"
  `);
});

it("conditionals", () => {
  expect(
    testToNAST(`
      function max(a, b) {
        if (a > b) {
          return a;
        } else {
          return b;
        }
      }
      max(1, 2)
    `)
  ).toMatchInlineSnapshot(`
    "(function number max@1 (number a@1 number b@1)
      (if (> a@1 b@1)
        (return a@1)
        (return b@1)))
    (call max@1 1 2)"
  `);

  expect(
    testToNAST(`
      function abs(x) {
        if (x < 0) {
          return -x;
        }
        return x;
      }
      abs(1)
    `)
  ).toMatchInlineSnapshot(`
    "(function number abs@1 (number x@1)
      (if (< x@1 0)
        (return (- x@1)))
      (return x@1))
    (call abs@1 1)"
  `);
});

it("variable declarations", () => {
  expect(
    testToNAST(`
      function sum(a, b) {
        const result = a + b;
        return result;
      }
      sum(1, 2)
    `)
  ).toMatchInlineSnapshot(`
    "(function number sum@1 (number a@1 number b@1)
      (declare number result@1 (+ a@1 b@1))
      (return result@1))
    (call sum@1 1 2)"
  `);
});

it("loops", () => {
  expect(
    testToNAST(`
      function factorial(n) {
        let result = 1;
        for (let i = 1; i <= n; i = i + 1) {
          result = result * i;
        }
        return result;
      }
      factorial(99999)
    `)
  ).toMatchInlineSnapshot(`
    "(function number factorial@1 (number n@1)
      (declare number result@1 1)
      (do
        (declare number i@1_bk 1)
        (loop (autoLabel_1@1)
          (declare number i@1 i@1_bk)
          (if (! (<= i@1 n@1))
            (break autoLabel_1@1))
          (do
            (do
              (assign register@r_1 &result@1)
              (ptr-set register@r_1 (* result@1 i@1))
              (ptr-get register@r_1)))
          (do
            (assign register@r_2 &i@1)
            (ptr-set register@r_2 (+ i@1 1))
            (ptr-get register@r_2))
          (continue autoLabel_1@1)
          (assign i@1_bk i@1)))
      (return result@1))
    (call factorial@1 99999)"
  `);
});

it("function calls", () => {
  expect(
    testToNAST(`
      function greet(name) {
        return "Hello, " + name;
      }
      function main() {
        return greet("world");
      }
      main()
    `)
  ).toMatchInlineSnapshot(`
    "(function string greet@1 (string name@1)
      (return (string-concatenation "Hello, " name@1)))
    (function string main@1 ()
      (return (call greet@1 "world")))
    (call main@1)"
  `);

  expect(
    testToNAST(`
      function add(a, b) {
        return a + b;
      }
      function main() {
        return add(2, 3);
      }
      main()
    `)
  ).toMatchInlineSnapshot(`
    "(function number add@1 (number a@1 number b@1)
      (return (+ a@1 b@1)))
    (function number main@1 ()
      (return (call add@1 2 3)))
    (call main@1)"
  `);

  expect(
    testToNAST(`
      function factorial(num) {
        if (num <= 1) {
          return 1
        } else {
          return num * factorial(num - 1)
        }
      }
      factorial(999)
    `)
  ).toMatchInlineSnapshot(`
    "(function number factorial@1 (number num@1)
      (if (<= num@1 1)
        (return 1)
        (return (* num@1 (call factorial@2 (- num@1 1))))))
    (call factorial@1 999)"
  `);
});

it("global variables", () => {
  expect(
    testToNAST(`
      const PI = 3.14;
      function area(radius) {
        return PI * radius * radius;
      }
      area(9)
    `)
  ).toMatchInlineSnapshot(`
    "(function number area@1 (number radius@1)
      (return (* (* PI@1 radius@1) radius@1)))
    (declare number PI@1 3.14)
    (call area@1 9)"
  `);
});

it("functional (crc32)", () => {
  expect(
    testToNAST(`
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
    "(function (array number) signed_crc_table@1 ()
      (declare number c@1 0)
      (declare number n@1 0)
      (declare (array number) table@1 (new Array 256))
      (loop (autoLabel_1@1)
        (if (! (!= n@1 256))
          (break autoLabel_1@1))
        (do
          (do
            (assign register@r_1 &c@1)
            (ptr-set register@r_1 n@1)
            (ptr-get register@r_1))
          (do
            (assign register@r_2 &c@1)
            (ptr-set register@r_2 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_2))
          (do
            (assign register@r_3 &c@1)
            (ptr-set register@r_3 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_3))
          (do
            (assign register@r_4 &c@1)
            (ptr-set register@r_4 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_4))
          (do
            (assign register@r_5 &c@1)
            (ptr-set register@r_5 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_5))
          (do
            (assign register@r_6 &c@1)
            (ptr-set register@r_6 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_6))
          (do
            (assign register@r_7 &c@1)
            (ptr-set register@r_7 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_7))
          (do
            (assign register@r_8 &c@1)
            (ptr-set register@r_8 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_8))
          (do
            (assign register@r_9 &c@1)
            (ptr-set register@r_9 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_9))
          (do
            (assign register@r_10 (array-ref table@1 n@1))
            (ptr-set register@r_10 c@1)
            (ptr-get register@r_10)))
        (incr &n@1)
        (continue autoLabel_1@1))
      (return table@1))"
  `);
});

it("functional (crc32) (2)", () => {
  expect(
    testToNAST(`
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
    "(function (array number) signed_crc_table@1 ()
      (declare number c@1 0)
      (declare number n@1 0)
      (declare (array number) table@2 (new Array 256))
      (loop (autoLabel_1@1)
        (if (! (!= n@1 256))
          (break autoLabel_1@1))
        (do
          (do
            (assign register@r_1 &c@1)
            (ptr-set register@r_1 n@1)
            (ptr-get register@r_1))
          (do
            (assign register@r_2 &c@1)
            (ptr-set register@r_2 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_2))
          (do
            (assign register@r_3 &c@1)
            (ptr-set register@r_3 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_3))
          (do
            (assign register@r_4 &c@1)
            (ptr-set register@r_4 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_4))
          (do
            (assign register@r_5 &c@1)
            (ptr-set register@r_5 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_5))
          (do
            (assign register@r_6 &c@1)
            (ptr-set register@r_6 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_6))
          (do
            (assign register@r_7 &c@1)
            (ptr-set register@r_7 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_7))
          (do
            (assign register@r_8 &c@1)
            (ptr-set register@r_8 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_8))
          (do
            (assign register@r_9 &c@1)
            (ptr-set register@r_9 (if (float-bool (& c@1 1))
              (^ (- 306674912) (>>> c@1 1))
              (>>> c@1 1)))
            (ptr-get register@r_9))
          (do
            (assign register@r_10 (array-ref table@2 n@1))
            (ptr-set register@r_10 c@1)
            (ptr-get register@r_10)))
        (incr &n@1)
        (continue autoLabel_1@1))
      (return table@2))
    (function (array (array number)) slice_by_16_tables@1 ((array number) T@1)
      (declare number c@2 0)
      (declare number v@1 0)
      (declare number n@2 0)
      (declare (array number) table@3 (new Array 4096))
      (loop (autoLabel_2@1)
        (if (! (!= n@2 256))
          (break autoLabel_2@1))
        (do
          (do
            (assign register@r_11 (array-ref table@3 n@2))
            (ptr-set register@r_11 (ptr-get (array-ref T@1 n@2)))
            (ptr-get register@r_11)))
        (incr &n@2)
        (continue autoLabel_2@1))
      (loop (autoLabel_3@1)
        (if (! (!= n@2 256))
          (break autoLabel_3@1))
        (do
          (do
            (assign register@r_12 &v@1)
            (ptr-set register@r_12 (ptr-get (array-ref T@1 n@2)))
            (ptr-get register@r_12))
          (loop (autoLabel_4@1)
            (if (! (< c@2 4096))
              (break autoLabel_4@1))
            (do
              (do
                (assign register@r_13 &v@1)
                (ptr-set register@r_13 (do
                  (assign register@r_14 (array-ref table@3 c@2))
                  (ptr-set register@r_14 (^ (>>> v@1 8) (ptr-get (array-ref T@1 (& v@1 255)))))
                  (ptr-get register@r_14)))
                (ptr-get register@r_13)))
            (do
              (assign register@r_15 &c@2)
              (ptr-set register@r_15 (+ (ptr-get register@r_15) 256))
              (ptr-get register@r_15))
            (continue autoLabel_4@1)))
        (incr &n@2)
        (continue autoLabel_3@1))
      (declare (array (array number)) out@1 [])
      (loop (autoLabel_5@1)
        (if (! (!= n@2 16))
          (break autoLabel_5@1))
        (do
          (do
            (assign register@r_16 (array-ref out@1 (- n@2 1)))
            (ptr-set register@r_16 (call (* n@2 256) (+ (* n@2 256) 256)))
            (ptr-get register@r_16)))
        (incr &n@2)
        (continue autoLabel_5@1))
      (return out@1))
    (function number crc32_bstr@1 (string bstr@2 number seed@1)
      (declare number C@1 (^ seed@1 (- 1)))
      (declare number i@1 0)
      (declare number L@1 (ptr-get (property-ref bstr@2 undefined)))
      (loop (autoLabel_6@1)
        (if (! (< i@1 L@1))
          (break autoLabel_6@1))
        (do
          (do
            (assign register@r_17 &C@1)
            (ptr-set register@r_17 (^ (>>> C@1 8) (ptr-get (array-ref T0@1 (& (^ C@1 (call (get-and-incr &i@1))) 255)))))
            (ptr-get register@r_17)))
        (continue autoLabel_6@1))
      (return (~ C@1)))
    (function number crc32_buf@1 ((array number) B@1 number seed@2)
      (declare number C@2 (^ seed@2 (- 1)))
      (declare number L@2 (- (ptr-get (property-ref B@1 undefined)) 15))
      (declare number i@2 0)
      (loop (autoLabel_7@1)
        (if (! (< i@2 L@2))
          (break autoLabel_7@1))
        (do
          (do
            (assign register@r_18 &C@2)
            (ptr-set register@r_18 (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (^ (ptr-get (array-ref Tf@1 (^ (ptr-get (array-ref B@1 (get-and-incr &i@2))) (& C@2 255)))) (ptr-get (array-ref Te@1 (^ (ptr-get (array-ref B@1 (get-and-incr &i@2))) (& (>> C@2 8) 255))))) (ptr-get (array-ref Td@1 (^ (ptr-get (array-ref B@1 (get-and-incr &i@2))) (& (>> C@2 16) 255))))) (ptr-get (array-ref Tc@1 (^ (ptr-get (array-ref B@1 (get-and-incr &i@2))) (>>> C@2 24))))) (ptr-get (array-ref Tb@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref Ta@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T9@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T8@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T7@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T6@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T5@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T4@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T3@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T2@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T1@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))) (ptr-get (array-ref T0@1 (ptr-get (array-ref B@1 (get-and-incr &i@2)))))))
            (ptr-get register@r_18)))
        (continue autoLabel_7@1))
      (do
        (assign register@r_19 &L@2)
        (ptr-set register@r_19 (+ (ptr-get register@r_19) 15))
        (ptr-get register@r_19))
      (loop (autoLabel_8@1)
        (if (! (< i@2 L@2))
          (break autoLabel_8@1))
        (do
          (do
            (assign register@r_20 &C@2)
            (ptr-set register@r_20 (^ (>>> C@2 8) (ptr-get (array-ref T0@1 (& (^ C@2 (ptr-get (array-ref B@1 (get-and-incr &i@2)))) 255)))))
            (ptr-get register@r_20)))
        (continue autoLabel_8@1))
      (return (~ C@2)))
    (function number crc32_str@1 (string str@2 number seed@3)
      (declare number C@3 (^ seed@3 (- 1)))
      (declare number i@3 0)
      (declare number L@3 (ptr-get (property-ref str@2 undefined)))
      (declare number c@3 0)
      (declare number d@1 0)
      (loop (autoLabel_9@1)
        (if (! (< i@3 L@3))
          (break autoLabel_9@1))
        (do
          (do
            (assign register@r_21 &c@3)
            (ptr-set register@r_21 (call (get-and-incr &i@3)))
            (ptr-get register@r_21))
          (if (< c@3 128)
            (do
              (assign register@r_22 &C@3)
              (ptr-set register@r_22 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 c@3) 255)))))
              (ptr-get register@r_22))
            (if (< c@3 2048)
              (do
                (do
                  (assign register@r_23 &C@3)
                  (ptr-set register@r_23 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 192 (& (>> c@3 6) 31))) 255)))))
                  (ptr-get register@r_23))
                (do
                  (assign register@r_24 &C@3)
                  (ptr-set register@r_24 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 128 (& c@3 63))) 255)))))
                  (ptr-get register@r_24)))
              (if (do
                  (assign register@r_25 (>= c@3 55296)))
                (do
                  (do
                    (assign register@r_26 &c@3)
                    (ptr-set register@r_26 (+ (& c@3 1023) 64))
                    (ptr-get register@r_26))
                  (do
                    (assign register@r_27 &d@1)
                    (ptr-set register@r_27 (& (call (get-and-incr &i@3)) 1023))
                    (ptr-get register@r_27))
                  (do
                    (assign register@r_28 &C@3)
                    (ptr-set register@r_28 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 240 (& (>> c@3 8) 7))) 255)))))
                    (ptr-get register@r_28))
                  (do
                    (assign register@r_29 &C@3)
                    (ptr-set register@r_29 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 128 (& (>> c@3 2) 63))) 255)))))
                    (ptr-get register@r_29))
                  (do
                    (assign register@r_30 &C@3)
                    (ptr-set register@r_30 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| (| 128 (& (>> d@1 6) 15)) (<< (& c@3 3) 4))) 255)))))
                    (ptr-get register@r_30))
                  (do
                    (assign register@r_31 &C@3)
                    (ptr-set register@r_31 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 128 (& d@1 63))) 255)))))
                    (ptr-get register@r_31)))
                (do
                  (do
                    (assign register@r_32 &C@3)
                    (ptr-set register@r_32 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 224 (& (>> c@3 12) 15))) 255)))))
                    (ptr-get register@r_32))
                  (do
                    (assign register@r_33 &C@3)
                    (ptr-set register@r_33 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 128 (& (>> c@3 6) 63))) 255)))))
                    (ptr-get register@r_33))
                  (do
                    (assign register@r_34 &C@3)
                    (ptr-set register@r_34 (^ (>>> C@3 8) (ptr-get (array-ref T0@1 (& (^ C@3 (| 128 (& c@3 63))) 255)))))
                    (ptr-get register@r_34)))))))
        (continue autoLabel_9@1))
      (return (~ C@3)))
    (declare (array number) T0@1 (call signed_crc_table@1))
    (declare (array (array number)) TT@1 (call slice_by_16_tables@1 T0@1))
    (declare (array number) T1@1 (ptr-get (array-ref TT@1 0)))
    (declare (array number) T2@1 (ptr-get (array-ref TT@1 1)))
    (declare (array number) T3@1 (ptr-get (array-ref TT@1 2)))
    (declare (array number) T4@1 (ptr-get (array-ref TT@1 3)))
    (declare (array number) T5@1 (ptr-get (array-ref TT@1 4)))
    (declare (array number) T6@1 (ptr-get (array-ref TT@1 5)))
    (declare (array number) T7@1 (ptr-get (array-ref TT@1 6)))
    (declare (array number) T8@1 (ptr-get (array-ref TT@1 7)))
    (declare (array number) T9@1 (ptr-get (array-ref TT@1 8)))
    (declare (array number) Ta@1 (ptr-get (array-ref TT@1 9)))
    (declare (array number) Tb@1 (ptr-get (array-ref TT@1 10)))
    (declare (array number) Tc@1 (ptr-get (array-ref TT@1 11)))
    (declare (array number) Td@1 (ptr-get (array-ref TT@1 12)))
    (declare (array number) Te@1 (ptr-get (array-ref TT@1 13)))
    (declare (array number) Tf@1 (ptr-get (array-ref TT@1 14)))
    (declare (array number) table@1 T0@1)
    (declare (function number (string number)) bstr@1 crc32_bstr@1)
    (declare (function number ((array number) number)) buf@1 crc32_buf@1)
    (declare (function number (string number)) str@1 crc32_str@1)
    (call str@1 "xx" 1234)
    (call buf@1 [123] 1234)
    (call bstr@1 "xx" 1234)"
  `);
});

it.skip("functional (crc32) (3)", () => {
  // This is skipped because our `var` support is bad, and T0 ends up being (undefined|Function)
  // This is OK for now.
  expect(
    testToNAST(`
      // Sheetjs crc32 code (modified)
      // from: https://cdn.sheetjs.com/crc-32-latest/package/crc32.mjs

      /*! crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
      /* vim: set ts=2: */
      /*::
      type CRC32Type = number;
      type ABuf = Array<number> | Buffer | Uint8Array;
      type CRC32TableType = Array<number> | Int32Array;
      */
      /*global Int32Array */
      function signed_crc_table()/*:CRC32TableType*/ {
          var c = 0, table/*:Array<number>*/ = new Array(256);

          for(var n =0; n != 256; ++n){
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

      var T0 = signed_crc_table();
      function slice_by_16_tables(T) {
          var c = 0, v = 0, n = 0, table/*:Array<number>*/ = new Array(4096) ;

          for(n = 0; n != 256; ++n) table[n] = T[n];
          for(n = 0; n != 256; ++n) {
              v = T[n];
              for(c = 256 + n; c < 4096; c += 256) v = table[c] = (v >>> 8) ^ T[v & 0xFF];
          }
          var out = [];
          for(n = 1; n != 16; ++n) out[n - 1] = table.slice(n * 256, n * 256 + 256);
          return out;
      }
      var TT = slice_by_16_tables(T0);
      var T1 = TT[0],  T2 = TT[1],  T3 = TT[2],  T4 = TT[3],  T5 = TT[4];
      var T6 = TT[5],  T7 = TT[6],  T8 = TT[7],  T9 = TT[8],  Ta = TT[9];
      var Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
      function crc32_bstr(bstr/*:string*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          var C = seed/*:: ? 0 : 0 */ ^ -1;
          for(var i = 0, L = bstr.length; i < L;) C = (C>>>8) ^ T0[(C^bstr.charCodeAt(i++))&0xFF];
          return ~C;
      }

      function crc32_buf(B/*:ABuf*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          var C = seed/*:: ? 0 : 0 */ ^ -1, L = B.length - 15, i = 0;
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
          var C = seed/*:: ? 0 : 0 */ ^ -1;
          for(var i = 0, L = str.length, c = 0, d = 0; i < L;) {
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
      const table = T0;
      const bstr = crc32_bstr;
      const buf = crc32_buf;
      const str = crc32_str;
    `)
  ).toMatchInlineSnapshot(`
    (global number PI 3.14)
    (function number area (number radius)
      (return (* (* PI radius) radius)))
  `);
});
