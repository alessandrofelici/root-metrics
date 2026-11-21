// Vercel Function: vercel.json rewrites every path except the static icons here.
// It loads the compiled app: Vercel runs `npm run build` (tsc -> dist/) before it bundles this
// file, so the import resolves to plain JavaScript and the tracer includes all of dist/ and the
// packages it uses. (Importing src/*.ts directly does not work: the tracer cannot map
// "./app.js" to app.tsx and leaves it out.)
export { GET, HEAD, POST } from "../dist/vercel.js";
