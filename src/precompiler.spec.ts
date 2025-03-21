import { execSync } from "child_process";
import { writeFileSync } from "fs";

/**
 * What are we doing here?
 *
 * To compile JS into C, run `make` inside the vendor/quickjs folder and then run
 *
 * ./vendor/quickjs/qjsc -c -N NAME_IN_C -o out.c [file]
 *
 * These options make it output a file like
 *
 * #include <inttypes.h>
 * const uint32_t NAME_IN_C_size = 46;
 * const uint8_t NAME_IN_C[46] = { ...quickjs bytecode... };
 *
 * Then, we can craft a wrapper just to call js_std_eval_binary(*ctx, *buf, buf_len, int flags);
 *
 * The meat of this compiler project is to write some of the functions in C. So we'll be adding these in global vars.
 *
 */

jest.setTimeout(30_000) // sometimes there's lots to compile

/** Let's get started. We'll take an input JS file  */
const inputJs = `{
    let count = 5, n1 = 0, n2 = 1, output = '';
    for (let i = 1; i <= count; i++) {
        [n1, n2] = [n2, n1 + n2];
        output += ' ' + n1;
    }
    console.log(output);
}`;

it("sanity check: inputJS outputs some fibonacci numbers", () => {
  writeFileSync("/tmp/quickjs-precompiler-test.js", inputJs);
  expect(
    execSync("./vendor/quickjs/qjs /tmp/quickjs-precompiler-test.js")
      .toString()
      .trim()
  ).toEqual("1 1 2 3 5");
});

/** (We will parse this file and stringify it back after removing functions we can turn into C. For now we'll do as-is to demonstrate the base case) */

/** This will describe our bytecode as it exists in a qjsc output C file */
import { Bytecode } from "./quickjs-bytecode";

/** Now let's extract its bytecode */
import { jsToBytecode } from "./quickjs-bytecode";

it("can extract bytecode from JS", async () => {
  const generated = await jsToBytecode(inputJs, "MY_BYTECODE");
  expect(generated.cSource).toMatch(/uint32_t MY_BYTECODE_size = \d+/);
  expect(generated.cSource).toMatch(/uint8_t MY_BYTECODE\[\d+\] =/);
});

/** Now let's compile a C file capable of initiating a JSContext and evaluating this C output */
import { generateRuntimeForBytecode } from "./quickjs-bytecode";

/** Let's try to compile+run it using our tiny wrapper around GCC */
import { compileAndRunC } from "./run";

it("can compile and run C", async () => {
  const bytecode = await jsToBytecode(inputJs, "MY_BYTECODE");
  const bcShell = generateRuntimeForBytecode({ bytecode });
  const output = await compileAndRunC(bcShell);

  expect(output).toMatchInlineSnapshot(`
{
  "stderr": "",
  "stdout": " 1 1 2 3 5
",
}
`);
});
