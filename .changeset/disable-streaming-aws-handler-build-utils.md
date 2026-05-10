---
'@vercel/build-utils': patch
'@vercel/node': patch
---

Disable response streaming for lambdas with `awsLambdaHandler` set inside `getLambdaSupportsStreaming`. This closes a gap where non-Node builders (e.g. `@vercel/redwood`) constructed `NodejsLambda` with `awsLambdaHandler` but no explicit `supportsResponseStreaming`, causing `finalizeLambda` to silently flip streaming on for AWS custom handlers. With the gate now enforced centrally in `finalizeLambda`, the equivalent `@vercel/node` build-time check from #16266 is consolidated away — all builders go through the same gate.
