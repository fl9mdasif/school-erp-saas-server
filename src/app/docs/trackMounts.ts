import express from 'express';

/**
 * Express 5 does not keep the path a router was mounted at. This records it on the child router so the
 * OpenAPI generator can rebuild full paths. Imported once, before any router is created.
 */
const proto = express.Router as unknown as { use: (...args: any[]) => any; __tracked?: boolean };
if (!proto.__tracked) {
  const original = proto.use;
  proto.use = function patchedUse(this: unknown, ...args: any[]) {
    if (typeof args[0] === 'string') {
      for (const a of args.slice(1)) if (a && Array.isArray(a.stack)) a.__mountPath = args[0];
    }
    return original.apply(this, args);
  };
  proto.__tracked = true;
}
