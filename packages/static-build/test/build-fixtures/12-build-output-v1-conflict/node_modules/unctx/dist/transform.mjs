import * as acorn from 'acorn';
import MagicString from 'magic-string';
import { walk } from 'estree-walker';

function createTransformer(options = {}) {
  options = {
    asyncFunctions: ["withAsyncContext"],
    helperModule: "unctx",
    helperName: "executeAsync",
    ...options
  };
  const matchRE = new RegExp(`\\b(${options.asyncFunctions.join("|")})\\(`);
  function shouldTransform(code) {
    return typeof code === "string" && matchRE.test(code);
  }
  function transform(code, opts = {}) {
    if (!opts.force && !shouldTransform(code)) {
      return;
    }
    const ast = acorn.parse(code, {
      sourceType: "module",
      ecmaVersion: "latest",
      locations: true
    });
    const s = new MagicString(code);
    const lines = code.split("\n");
    let detected = false;
    walk(ast, {
      enter(node) {
        if (node.type === "CallExpression") {
          const functionName = getFunctionName(node.callee);
          if (options.asyncFunctions.includes(functionName)) {
            transformFunctionBody(node);
            if (functionName !== "callAsync") {
              const lastArg = node.arguments[node.arguments.length - 1];
              if (lastArg) {
                s.appendRight(toIndex(lastArg.loc.end), ",1");
              }
            }
          }
        }
      }
    });
    if (!detected) {
      return null;
    }
    s.appendLeft(0, `import { ${options.helperName} as __executeAsync } from "${options.helperModule}";`);
    return {
      code: s.toString(),
      magicString: s
    };
    function getFunctionName(node) {
      if (node.type === "Identifier") {
        return node.name;
      } else if (node.type === "MemberExpression") {
        return getFunctionName(node.property);
      }
    }
    function toIndex(pos) {
      return lines.slice(0, pos.line - 1).join("\n").length + pos.column + 1;
    }
    function transformFunctionBody(node) {
      for (const fn of node.arguments) {
        if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") {
          continue;
        }
        if (!fn.async) {
          continue;
        }
        const body = fn.body;
        let injectVariable = false;
        walk(body, {
          enter(node2, parent) {
            if (node2.type === "AwaitExpression") {
              detected = true;
              injectVariable = true;
              injectForNode(node2, parent);
            }
            if (node2.type === "ArrowFunctionExpression" || node2.type === "FunctionExpression" || node2.type === "FunctionDeclaration") {
              return this.skip();
            }
          }
        });
        if (injectVariable) {
          s.appendLeft(toIndex(body.loc.start) + 1, "let __temp, __restore;");
        }
      }
    }
    function injectForNode(node, parent) {
      const body = code.slice(toIndex(node.argument.loc.start), toIndex(node.argument.loc.end));
      const isStatement = parent?.type === "ExpressionStatement";
      s.overwrite(toIndex(node.loc.start), toIndex(node.loc.end), isStatement ? `;(([__temp,__restore]=__executeAsync(()=>${body})),await __temp,__restore());` : `(([__temp,__restore]=__executeAsync(()=>${body})),__temp=await __temp,__restore(),__temp)`);
    }
  }
  return {
    transform,
    shouldTransform
  };
}

export { createTransformer };
