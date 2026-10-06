#!/bin/bash
# Patch @types/express-serve-static-core v5 to use string-only params (Express 4 compat)
# Express 5 types define ParamsDictionary as {[key: string]: string | string[]}
# for wildcard route support, but we use Express 4 where params are always strings.
TARGET="node_modules/@types/express-serve-static-core/index.d.ts"
if [ -f "$TARGET" ]; then
  sed -i 's/\[key: string\]: string | string\[\]/[key: string]: string/' "$TARGET"
  echo "Patched $TARGET: ParamsDictionary now uses string-only params"
fi
