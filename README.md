# quickjs-precompiler

Precompiles your JavaScript files into C with quickjs embedded.

Note: quickjs can already output C files containing your JS turned into bytecode, but this aims to provide a faster version of this by creating C files that mirror your actual JS.

# Internal design

Firstly, the JS is parsed with Acorn, producing the ESTree AST. This is a standard format for JavaScript ASTs.

Then, we turn the ESTree AST into our internal precomp-AST. The precomp-AST is fully convertible into C with quickJS calls.

In the future, there may be a step to optimize the precomp-AST by utilizing type information.

Finally, the precomp-AST is output into C source code.

# Roadmap

 - Optimize written functions per-type
 - Extend your code with C functions
 - Precompile the generated code with TCC

# Hacking

This contains a git submodule vendor/quickjs checked out at a specific commit. You need to compile this in order to use quickjs-precompiler.

```
cd vendor/quickjs; make; make quickjs.o
```

