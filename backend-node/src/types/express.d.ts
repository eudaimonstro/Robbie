// Express 4 type compatibility note:
// @types/express v5 / @types/express-serve-static-core v5 types req.params as
// string | string[] for Express 5 wildcard route support.
// Since we use Express 4 (params are always strings), we patch
// ParamsDictionary in node_modules via the postinstall script.
// See: scripts/patch-express-types.sh
export {};
