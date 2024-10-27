import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { ChildProcessWithoutNullStreams } from "child_process";

/** Spawn `command`, handle signals+nonzero exits, and collect stdout/stderr */
export async function simpleSpawn(command: string, args: string[], {
    timeout = 30_000,
    stdin = undefined as undefined | Readable,
} = {}): Promise<{ stdout: string, stderr: string }> {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            timeout,
            stdio: [stdin ? 'pipe' : null, 'pipe', 'pipe']
        });

        const collectedOutput = mapIOStreams(child, stdin);

        child.on('error', reject);
        child.on('exit', (code, signal) => {
            const { stdout, stderr } = collectedOutput
            if (code) {
                reject(new Error(`Command ${command} failed:\n${stderr}\n-- exited with code ${code} --`))
            } else if (signal) {
                reject(new Error(`${command} was terminated abruptly with signal ${signal}`))
            } else {
                resolve({ stdout, stderr })
            }
        });
    })
}

function mapIOStreams(c: ChildProcessWithoutNullStreams, stdin?: Readable) {
    if (stdin && c.stdin) {
        stdin.pipe(c.stdin);
    }

    const collected = { stdout: '', stderr: '' }
    c.stdout.on('data', d => collected.stdout += d);
    c.stderr.on('data', d => collected.stderr += d);
    return collected;
}

