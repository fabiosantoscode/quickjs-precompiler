import { mkdtemp } from "fs/promises";
import { simpleSpawn } from "./simple-spawn";
import { Readable } from "stream";
import { tmpdir } from "os";
import { rimraf } from "rimraf";
import { join } from "path";

export async function compileAndRunC(
  runtime: string,
  {
    args = [] as string[],
    stdin = undefined as Readable | undefined,
    timeout = undefined as number | undefined,
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  const folder = await mkdtemp(join(tmpdir(), "qjs-precompiler"));
  const exeFile = folder + "/a.out";
  await compileC(runtime, exeFile);

  try {
    const stdout = await simpleSpawn(exeFile, args, { stdin, timeout });
    return stdout;
  } finally {
    await rimraf(folder);
  }
}

/** Compile a big string of C code into the given executable filename */
export async function compileC(runtime: string, exeFile: string) {
  await simpleSpawn("./c-lib/compile.sh", [exeFile], {
    timeout: 0,
    stdin: Readable.from([runtime]),
  });
}
