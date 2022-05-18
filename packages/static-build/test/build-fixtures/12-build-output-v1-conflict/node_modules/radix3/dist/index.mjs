const NODE_TYPES = {
  NORMAL: 0,
  WILDCARD: 1,
  PLACEHOLDER: 2
};

function createRouter(options = {}) {
  const ctx = {
    rootNode: createRadixNode(),
    staticRoutesMap: {}
  };
  if (options.routes) {
    for (const path in options.routes) {
      insert(ctx, path, options.routes[path]);
    }
  }
  return {
    ctx,
    lookup: (path) => lookup(ctx, path),
    lookupAll: (prefix) => lookupAll(ctx, prefix),
    insert: (path, data) => insert(ctx, path, data),
    remove: (path) => remove(ctx, path)
  };
}
function lookup(ctx, path) {
  const staticPathNode = ctx.staticRoutesMap[path];
  if (staticPathNode) {
    return staticPathNode.data;
  }
  const sections = path.split("/");
  const params = {};
  let paramsFound = false;
  let wildcardNode = null;
  let node = ctx.rootNode;
  let wildCardParam = null;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (node.wildcardChildNode !== null) {
      wildcardNode = node.wildcardChildNode;
      wildCardParam = sections.slice(i).join("/");
    }
    const nextNode = node.children[section];
    if (nextNode !== void 0) {
      node = nextNode;
    } else {
      node = node.placeholderChildNode;
      if (node !== null) {
        params[node.paramName] = section;
        paramsFound = true;
      } else {
        break;
      }
    }
  }
  if ((node === null || node.data === null) && wildcardNode !== null) {
    node = wildcardNode;
    params[node.paramName || "_"] = wildCardParam;
    paramsFound = true;
  }
  if (!node) {
    return null;
  }
  if (paramsFound) {
    return {
      ...node.data,
      params: paramsFound ? params : void 0
    };
  }
  return node.data;
}
function lookupAll(ctx, prefix) {
  const sections = prefix.split("/");
  let node = ctx.rootNode;
  const resultArray = [];
  const endSections = sections.length - 1;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (node.data) {
      resultArray.push(node.data);
    }
    let nextNode = node.children[section];
    if (nextNode !== void 0) {
      node = nextNode;
    } else if (i === endSections) {
      const keys = Object.keys(node.children);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (key.startsWith(section)) {
          nextNode = node.children[key];
          if (nextNode.data) {
            resultArray.push(nextNode.data);
          }
        }
      }
    }
  }
  return resultArray;
}
function insert(ctx, path, data) {
  let isStaticRoute = true;
  const sections = path.split("/");
  let node = ctx.rootNode;
  let _unnamedPlaceholderCtr = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const children = node.children;
    let childNode;
    if (childNode = children[section]) {
      node = childNode;
    } else {
      const type = getNodeType(section);
      childNode = createRadixNode({ type, parent: node });
      node.children[section] = childNode;
      if (type === NODE_TYPES.PLACEHOLDER) {
        childNode.paramName = section === "*" ? `_${_unnamedPlaceholderCtr++}` : section.slice(1);
        node.placeholderChildNode = childNode;
        isStaticRoute = false;
      } else if (type === NODE_TYPES.WILDCARD) {
        node.wildcardChildNode = childNode;
        childNode.paramName = section.substring(3) || "_";
        isStaticRoute = false;
      }
      node = childNode;
    }
  }
  node.data = data;
  if (isStaticRoute === true) {
    ctx.staticRoutesMap[path] = node;
  }
  return node;
}
function remove(ctx, path) {
  let success = false;
  const sections = path.split("/");
  let node = ctx.rootNode;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    node = node.children[section];
    if (!node) {
      return success;
    }
  }
  if (node.data) {
    const lastSection = sections[sections.length - 1];
    node.data = null;
    if (Object.keys(node.children).length === 0) {
      const parentNode = node.parent;
      delete parentNode[lastSection];
      parentNode.wildcardChildNode = null;
      parentNode.placeholderChildNode = null;
    }
    success = true;
  }
  return success;
}
function createRadixNode(options = {}) {
  return {
    type: options.type || NODE_TYPES.NORMAL,
    parent: options.parent || null,
    children: {},
    data: options.data || null,
    paramName: options.paramName || null,
    wildcardChildNode: null,
    placeholderChildNode: null
  };
}
function getNodeType(str) {
  if (str.startsWith("**")) {
    return NODE_TYPES.WILDCARD;
  }
  if (str[0] === ":" || str === "*") {
    return NODE_TYPES.PLACEHOLDER;
  }
  return NODE_TYPES.NORMAL;
}

export { NODE_TYPES, createRouter };
