var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// ../../node_modules/.pnpm/svelte@3.46.4/node_modules/svelte/internal/index.mjs
function noop() {
}
function run(fn) {
  return fn();
}
function blank_object() {
  return /* @__PURE__ */ Object.create(null);
}
function run_all(fns) {
  fns.forEach(run);
}
function is_function(thing) {
  return typeof thing === "function";
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || (a && typeof a === "object" || typeof a === "function");
}
function is_empty(obj) {
  return Object.keys(obj).length === 0;
}
function null_to_empty(value) {
  return value == null ? "" : value;
}
var is_hydrating = false;
function start_hydrating() {
  is_hydrating = true;
}
function end_hydrating() {
  is_hydrating = false;
}
function append(target, node) {
  target.appendChild(node);
}
function append_styles(target, style_sheet_id, styles) {
  const append_styles_to = get_root_for_style(target);
  if (!append_styles_to.getElementById(style_sheet_id)) {
    const style = element("style");
    style.id = style_sheet_id;
    style.textContent = styles;
    append_stylesheet(append_styles_to, style);
  }
}
function get_root_for_style(node) {
  if (!node)
    return document;
  const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
  if (root && root.host) {
    return root;
  }
  return node.ownerDocument;
}
function append_stylesheet(node, style) {
  append(node.head || node, style);
}
function insert(target, node, anchor) {
  target.insertBefore(node, anchor || null);
}
function detach(node) {
  node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
  for (let i = 0; i < iterations.length; i += 1) {
    if (iterations[i])
      iterations[i].d(detaching);
  }
}
function element(name) {
  return document.createElement(name);
}
function text(data) {
  return document.createTextNode(data);
}
function space() {
  return text(" ");
}
function empty() {
  return text("");
}
function listen(node, event, handler, options) {
  node.addEventListener(event, handler, options);
  return () => node.removeEventListener(event, handler, options);
}
function stop_propagation(fn) {
  return function(event) {
    event.stopPropagation();
    return fn.call(this, event);
  };
}
function attr(node, attribute, value) {
  if (value == null)
    node.removeAttribute(attribute);
  else if (node.getAttribute(attribute) !== value)
    node.setAttribute(attribute, value);
}
function children(element2) {
  return Array.from(element2.childNodes);
}
function set_data(text2, data) {
  data = "" + data;
  if (text2.wholeText !== data)
    text2.data = data;
}
function set_style(node, key, value, important) {
  if (value === null) {
    node.style.removeProperty(key);
  } else {
    node.style.setProperty(key, value, important ? "important" : "");
  }
}
var current_component;
function set_current_component(component) {
  current_component = component;
}
function bubble(component, event) {
  const callbacks = component.$$.callbacks[event.type];
  if (callbacks) {
    callbacks.slice().forEach((fn) => fn.call(this, event));
  }
}
var dirty_components = [];
var binding_callbacks = [];
var render_callbacks = [];
var flush_callbacks = [];
var resolved_promise = Promise.resolve();
var update_scheduled = false;
function schedule_update() {
  if (!update_scheduled) {
    update_scheduled = true;
    resolved_promise.then(flush);
  }
}
function add_render_callback(fn) {
  render_callbacks.push(fn);
}
var seen_callbacks = /* @__PURE__ */ new Set();
var flushidx = 0;
function flush() {
  const saved_component = current_component;
  do {
    while (flushidx < dirty_components.length) {
      const component = dirty_components[flushidx];
      flushidx++;
      set_current_component(component);
      update(component.$$);
    }
    set_current_component(null);
    dirty_components.length = 0;
    flushidx = 0;
    while (binding_callbacks.length)
      binding_callbacks.pop()();
    for (let i = 0; i < render_callbacks.length; i += 1) {
      const callback = render_callbacks[i];
      if (!seen_callbacks.has(callback)) {
        seen_callbacks.add(callback);
        callback();
      }
    }
    render_callbacks.length = 0;
  } while (dirty_components.length);
  while (flush_callbacks.length) {
    flush_callbacks.pop()();
  }
  update_scheduled = false;
  seen_callbacks.clear();
  set_current_component(saved_component);
}
function update($$) {
  if ($$.fragment !== null) {
    $$.update();
    run_all($$.before_update);
    const dirty = $$.dirty;
    $$.dirty = [-1];
    $$.fragment && $$.fragment.p($$.ctx, dirty);
    $$.after_update.forEach(add_render_callback);
  }
}
var outroing = /* @__PURE__ */ new Set();
var outros;
function group_outros() {
  outros = {
    r: 0,
    c: [],
    p: outros
  };
}
function check_outros() {
  if (!outros.r) {
    run_all(outros.c);
  }
  outros = outros.p;
}
function transition_in(block, local) {
  if (block && block.i) {
    outroing.delete(block);
    block.i(local);
  }
}
function transition_out(block, local, detach2, callback) {
  if (block && block.o) {
    if (outroing.has(block))
      return;
    outroing.add(block);
    outros.c.push(() => {
      outroing.delete(block);
      if (callback) {
        if (detach2)
          block.d(1);
        callback();
      }
    });
    block.o(local);
  }
}
var globals = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : global;
function create_component(block) {
  block && block.c();
}
function mount_component(component, target, anchor, customElement) {
  const { fragment, on_mount, on_destroy, after_update } = component.$$;
  fragment && fragment.m(target, anchor);
  if (!customElement) {
    add_render_callback(() => {
      const new_on_destroy = on_mount.map(run).filter(is_function);
      if (on_destroy) {
        on_destroy.push(...new_on_destroy);
      } else {
        run_all(new_on_destroy);
      }
      component.$$.on_mount = [];
    });
  }
  after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
  const $$ = component.$$;
  if ($$.fragment !== null) {
    run_all($$.on_destroy);
    $$.fragment && $$.fragment.d(detaching);
    $$.on_destroy = $$.fragment = null;
    $$.ctx = [];
  }
}
function make_dirty(component, i) {
  if (component.$$.dirty[0] === -1) {
    dirty_components.push(component);
    schedule_update();
    component.$$.dirty.fill(0);
  }
  component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
}
function init(component, options, instance6, create_fragment6, not_equal, props, append_styles2, dirty = [-1]) {
  const parent_component = current_component;
  set_current_component(component);
  const $$ = component.$$ = {
    fragment: null,
    ctx: null,
    props,
    update: noop,
    not_equal,
    bound: blank_object(),
    on_mount: [],
    on_destroy: [],
    on_disconnect: [],
    before_update: [],
    after_update: [],
    context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
    callbacks: blank_object(),
    dirty,
    skip_bound: false,
    root: options.target || parent_component.$$.root
  };
  append_styles2 && append_styles2($$.root);
  let ready = false;
  $$.ctx = instance6 ? instance6(component, options.props || {}, (i, ret, ...rest) => {
    const value = rest.length ? rest[0] : ret;
    if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
      if (!$$.skip_bound && $$.bound[i])
        $$.bound[i](value);
      if (ready)
        make_dirty(component, i);
    }
    return ret;
  }) : [];
  $$.update();
  ready = true;
  run_all($$.before_update);
  $$.fragment = create_fragment6 ? create_fragment6($$.ctx) : false;
  if (options.target) {
    if (options.hydrate) {
      start_hydrating();
      const nodes = children(options.target);
      $$.fragment && $$.fragment.l(nodes);
      nodes.forEach(detach);
    } else {
      $$.fragment && $$.fragment.c();
    }
    if (options.intro)
      transition_in(component.$$.fragment);
    mount_component(component, options.target, options.anchor, options.customElement);
    end_hydrating();
    flush();
  }
  set_current_component(parent_component);
}
var SvelteElement;
if (typeof HTMLElement === "function") {
  SvelteElement = class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }
    connectedCallback() {
      const { on_mount } = this.$$;
      this.$$.on_disconnect = on_mount.map(run).filter(is_function);
      for (const key in this.$$.slotted) {
        this.appendChild(this.$$.slotted[key]);
      }
    }
    attributeChangedCallback(attr2, _oldValue, newValue) {
      this[attr2] = newValue;
    }
    disconnectedCallback() {
      run_all(this.$$.on_disconnect);
    }
    $destroy() {
      destroy_component(this, 1);
      this.$destroy = noop;
    }
    $on(type, callback) {
      const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
      callbacks.push(callback);
      return () => {
        const index = callbacks.indexOf(callback);
        if (index !== -1)
          callbacks.splice(index, 1);
      };
    }
    $set($$props) {
      if (this.$$set && !is_empty($$props)) {
        this.$$.skip_bound = true;
        this.$$set($$props);
        this.$$.skip_bound = false;
      }
    }
  };
}
var SvelteComponent = class {
  $destroy() {
    destroy_component(this, 1);
    this.$destroy = noop;
  }
  $on(type, callback) {
    const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
    callbacks.push(callback);
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1)
        callbacks.splice(index, 1);
    };
  }
  $set($$props) {
    if (this.$$set && !is_empty($$props)) {
      this.$$.skip_bound = true;
      this.$$set($$props);
      this.$$.skip_bound = false;
    }
  }
};

// src/components/Diagnostic.svelte
function add_css(target) {
  append_styles(target, "svelte-1cptkb2", "li.svelte-1cptkb2{list-style:none}.message-item.svelte-1cptkb2{border-bottom:1px dotted #666;padding:12px 0 0 0}.message.svelte-1cptkb2{white-space:initial;font-weight:600}pre.svelte-1cptkb2{font-family:var(--monospace);font-size:14px;margin-top:0;margin-bottom:0;overflow-x:scroll;scrollbar-width:none}.frame.svelte-1cptkb2{margin:1em 0;padding:6px 8px;background:#16181d;margin-top:8px;border-radius:8px}.frame-code.svelte-1cptkb2{color:var(--yellow);font-family:var(--monospace)}pre.svelte-1cptkb2::-webkit-scrollbar{display:none}.message-body.svelte-1cptkb2{color:var(--red)}.message-body-0.svelte-1cptkb2{color:var(--yellow)}.message-body-1.svelte-1cptkb2{color:var(--red)}.message-body-2.svelte-1cptkb2{color:var(--blue)}.message-body-3.svelte-1cptkb2{color:var(--dim)}.file.svelte-1cptkb2{color:var(--cyan);margin-bottom:0;white-space:pre-wrap;word-break:break-all}.stack.svelte-1cptkb2{font-size:13px;color:var(--dim)}.file-link.svelte-1cptkb2{text-decoration:underline;cursor:pointer}");
}
function create_else_block(ctx) {
  let t0;
  let t1_value = ctx[2].text + "";
  let t1;
  return {
    c() {
      t0 = text("\n      ");
      t1 = text(t1_value);
    },
    m(target, anchor) {
      insert(target, t0, anchor);
      insert(target, t1, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & 4 && t1_value !== (t1_value = ctx2[2].text + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching)
        detach(t0);
      if (detaching)
        detach(t1);
    }
  };
}
function create_if_block_1(ctx) {
  let a;
  let t_value = ctx[2].textContent + "";
  let t;
  let mounted;
  let dispose;
  return {
    c() {
      a = element("a");
      t = text(t_value);
      attr(a, "class", "file-link svelte-1cptkb2");
    },
    m(target, anchor) {
      insert(target, a, anchor);
      append(a, t);
      if (!mounted) {
        dispose = listen(a, "click", function() {
          if (is_function(ctx[2].onclick))
            ctx[2].onclick.apply(this, arguments);
        });
        mounted = true;
      }
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (dirty & 4 && t_value !== (t_value = ctx[2].textContent + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching)
        detach(a);
      mounted = false;
      dispose();
    }
  };
}
function create_if_block(ctx) {
  let pre;
  let code;
  let t_value = ctx[0].frame + "";
  let t;
  return {
    c() {
      pre = element("pre");
      code = element("code");
      t = text(t_value);
      attr(code, "class", "frame-code svelte-1cptkb2");
      attr(pre, "class", "frame svelte-1cptkb2");
    },
    m(target, anchor) {
      insert(target, pre, anchor);
      append(pre, code);
      append(code, t);
    },
    p(ctx2, dirty) {
      if (dirty & 1 && t_value !== (t_value = ctx2[0].frame + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching)
        detach(pre);
    }
  };
}
function create_fragment(ctx) {
  let li;
  let pre0;
  let t0;
  let span0;
  let t1_value = `[${ctx[0].checkerId}] `;
  let t1;
  let span1;
  let t2;
  let span1_class_value;
  let t3;
  let t4;
  let pre1;
  let t5;
  let t6;
  let t7;
  let pre2;
  let t8_value = ctx[0].stack + "";
  let t8;
  function select_block_type(ctx2, dirty) {
    if (ctx2[2].linkFiles)
      return create_if_block_1;
    return create_else_block;
  }
  let current_block_type = select_block_type(ctx, -1);
  let if_block0 = current_block_type(ctx);
  let if_block1 = ctx[1] && create_if_block(ctx);
  return {
    c() {
      li = element("li");
      pre0 = element("pre");
      t0 = text("\n    ");
      span0 = element("span");
      t1 = text(t1_value);
      span1 = element("span");
      t2 = text(ctx[3]);
      t3 = text("\n  ");
      t4 = space();
      pre1 = element("pre");
      if_block0.c();
      t5 = text("\n  ");
      t6 = space();
      if (if_block1)
        if_block1.c();
      t7 = space();
      pre2 = element("pre");
      t8 = text(t8_value);
      attr(span0, "class", "plugin");
      set_style(span0, "color", ctx[4][ctx[0].checkerId]);
      attr(span1, "class", span1_class_value = null_to_empty(`message-body message-body-${ctx[0].level}`) + " svelte-1cptkb2");
      attr(pre0, "class", "message svelte-1cptkb2");
      attr(pre1, "class", "file svelte-1cptkb2");
      attr(pre2, "class", "stack svelte-1cptkb2");
      attr(li, "class", "message-item svelte-1cptkb2");
    },
    m(target, anchor) {
      insert(target, li, anchor);
      append(li, pre0);
      append(pre0, t0);
      append(pre0, span0);
      append(span0, t1);
      append(pre0, span1);
      append(span1, t2);
      append(pre0, t3);
      append(li, t4);
      append(li, pre1);
      if_block0.m(pre1, null);
      append(pre1, t5);
      append(li, t6);
      if (if_block1)
        if_block1.m(li, null);
      append(li, t7);
      append(li, pre2);
      append(pre2, t8);
    },
    p(ctx2, [dirty]) {
      if (dirty & 1 && t1_value !== (t1_value = `[${ctx2[0].checkerId}] `))
        set_data(t1, t1_value);
      if (dirty & 1) {
        set_style(span0, "color", ctx2[4][ctx2[0].checkerId]);
      }
      if (dirty & 8)
        set_data(t2, ctx2[3]);
      if (dirty & 1 && span1_class_value !== (span1_class_value = null_to_empty(`message-body message-body-${ctx2[0].level}`) + " svelte-1cptkb2")) {
        attr(span1, "class", span1_class_value);
      }
      if (current_block_type === (current_block_type = select_block_type(ctx2, dirty)) && if_block0) {
        if_block0.p(ctx2, dirty);
      } else {
        if_block0.d(1);
        if_block0 = current_block_type(ctx2);
        if (if_block0) {
          if_block0.c();
          if_block0.m(pre1, t5);
        }
      }
      if (ctx2[1]) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block(ctx2);
          if_block1.c();
          if_block1.m(li, t7);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (dirty & 1 && t8_value !== (t8_value = ctx2[0].stack + ""))
        set_data(t8, t8_value);
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching)
        detach(li);
      if_block0.d();
      if (if_block1)
        if_block1.d();
    }
  };
}
var fileRE = /(?:[a-zA-Z]:\\|\/).*?:\d+:\d+/g;
var codeframeRE = /^(?:>?\s+\d+\s+\|.*|\s+\|\s*\^.*)\r?\n/gm;
function instance($$self, $$props, $$invalidate) {
  let hasFrame;
  let message;
  let stackLinks;
  let file;
  let errorSource;
  let { diagnostic } = $$props;
  const checkerColorMap = {
    TypeScript: "#3178c6",
    ESLint: "#7b7fe3",
    VLS: "#64b587",
    "vue-tsc": "#64b587"
  };
  codeframeRE.lastIndex = 0;
  function calcLink(text2) {
    let curIndex = 0;
    let match;
    const links = [];
    while (match = fileRE.exec(text2)) {
      const { 0: file2, index } = match;
      if (index !== null) {
        const frag = text2.slice(curIndex, index);
        const link = {};
        link.textContent = file2;
        link.onclick = () => {
          fetch("/__open-in-editor?file=" + encodeURIComponent(file2));
        };
        curIndex += frag.length + file2.length;
        links.push(link);
      }
    }
    return links;
  }
  $$self.$$set = ($$props2) => {
    if ("diagnostic" in $$props2)
      $$invalidate(0, diagnostic = $$props2.diagnostic);
  };
  $$self.$$.update = () => {
    var _a;
    if ($$self.$$.dirty & 1) {
      $:
        $$invalidate(1, hasFrame = diagnostic.frame && codeframeRE.test(diagnostic.frame));
    }
    if ($$self.$$.dirty & 3) {
      $:
        $$invalidate(3, message = hasFrame ? diagnostic.message.replace(codeframeRE, "") : diagnostic.message);
    }
    if ($$self.$$.dirty & 1) {
      $:
        stackLinks = calcLink(diagnostic.stack);
    }
    if ($$self.$$.dirty & 1) {
      $:
        $$invalidate(5, [file] = (((_a = diagnostic.loc) == null ? void 0 : _a.file) || diagnostic.id || "unknown file").split(`?`), file);
    }
    if ($$self.$$.dirty & 33) {
      $:
        $$invalidate(2, errorSource = diagnostic.loc ? __spreadProps(__spreadValues({}, calcLink(`${file}:${diagnostic.loc.line}:${diagnostic.loc.column}`)[0]), {
          linkFiles: true
        }) : { text: file, linkFiles: false });
    }
  };
  return [diagnostic, hasFrame, errorSource, message, checkerColorMap, file];
}
var Diagnostic = class extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance, create_fragment, safe_not_equal, { diagnostic: 0 }, add_css);
  }
};
var Diagnostic_default = Diagnostic;

// src/components/Checker.svelte
function add_css2(target) {
  append_styles(target, "svelte-4xs6f9", "ul.svelte-4xs6f9{list-style:none}ul.svelte-4xs6f9{padding-inline:0;margin-block:0}");
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[1] = list[i];
  return child_ctx;
}
function create_each_block(ctx) {
  let diagnostic;
  let current;
  diagnostic = new Diagnostic_default({
    props: { diagnostic: ctx[1] }
  });
  return {
    c() {
      create_component(diagnostic.$$.fragment);
    },
    m(target, anchor) {
      mount_component(diagnostic, target, anchor);
      current = true;
    },
    p(ctx2, dirty) {
      const diagnostic_changes = {};
      if (dirty & 1)
        diagnostic_changes.diagnostic = ctx2[1];
      diagnostic.$set(diagnostic_changes);
    },
    i(local) {
      if (current)
        return;
      transition_in(diagnostic.$$.fragment, local);
      current = true;
    },
    o(local) {
      transition_out(diagnostic.$$.fragment, local);
      current = false;
    },
    d(detaching) {
      destroy_component(diagnostic, detaching);
    }
  };
}
function create_fragment2(ctx) {
  let ul;
  let current;
  let each_value = ctx[0];
  let each_blocks = [];
  for (let i = 0; i < each_value.length; i += 1) {
    each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
  }
  const out = (i) => transition_out(each_blocks[i], 1, 1, () => {
    each_blocks[i] = null;
  });
  return {
    c() {
      ul = element("ul");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(ul, "class", "svelte-4xs6f9");
    },
    m(target, anchor) {
      insert(target, ul, anchor);
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(ul, null);
      }
      current = true;
    },
    p(ctx2, [dirty]) {
      if (dirty & 1) {
        each_value = ctx2[0];
        let i;
        for (i = 0; i < each_value.length; i += 1) {
          const child_ctx = get_each_context(ctx2, each_value, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
            transition_in(each_blocks[i], 1);
          } else {
            each_blocks[i] = create_each_block(child_ctx);
            each_blocks[i].c();
            transition_in(each_blocks[i], 1);
            each_blocks[i].m(ul, null);
          }
        }
        group_outros();
        for (i = each_value.length; i < each_blocks.length; i += 1) {
          out(i);
        }
        check_outros();
      }
    },
    i(local) {
      if (current)
        return;
      for (let i = 0; i < each_value.length; i += 1) {
        transition_in(each_blocks[i]);
      }
      current = true;
    },
    o(local) {
      each_blocks = each_blocks.filter(Boolean);
      for (let i = 0; i < each_blocks.length; i += 1) {
        transition_out(each_blocks[i]);
      }
      current = false;
    },
    d(detaching) {
      if (detaching)
        detach(ul);
      destroy_each(each_blocks, detaching);
    }
  };
}
function instance2($$self, $$props, $$invalidate) {
  let { diagnostics } = $$props;
  $$self.$$set = ($$props2) => {
    if ("diagnostics" in $$props2)
      $$invalidate(0, diagnostics = $$props2.diagnostics);
  };
  return [diagnostics];
}
var Checker = class extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance2, create_fragment2, safe_not_equal, { diagnostics: 0 }, add_css2);
  }
};
var Checker_default = Checker;

// src/components/List.svelte
function add_css3(target) {
  append_styles(target, "svelte-9kex0m", "ul.svelte-9kex0m,li.svelte-9kex0m{list-style:none}ul.svelte-9kex0m{padding-inline:0;margin-block:0}");
}
function get_each_context2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[2] = list[i];
  child_ctx[4] = i;
  return child_ctx;
}
function create_each_block2(ctx) {
  let li;
  let checker;
  let t;
  let current;
  checker = new Checker_default({
    props: {
      diagnostics: ctx[2].diagnostics,
      index: ctx[4]
    }
  });
  return {
    c() {
      li = element("li");
      create_component(checker.$$.fragment);
      t = space();
      attr(li, "class", "svelte-9kex0m");
    },
    m(target, anchor) {
      insert(target, li, anchor);
      mount_component(checker, li, null);
      append(li, t);
      current = true;
    },
    p(ctx2, dirty) {
      const checker_changes = {};
      if (dirty & 1)
        checker_changes.diagnostics = ctx2[2].diagnostics;
      checker.$set(checker_changes);
    },
    i(local) {
      if (current)
        return;
      transition_in(checker.$$.fragment, local);
      current = true;
    },
    o(local) {
      transition_out(checker.$$.fragment, local);
      current = false;
    },
    d(detaching) {
      if (detaching)
        detach(li);
      destroy_component(checker);
    }
  };
}
function create_fragment3(ctx) {
  let ul;
  let current;
  let each_value = ctx[0];
  let each_blocks = [];
  for (let i = 0; i < each_value.length; i += 1) {
    each_blocks[i] = create_each_block2(get_each_context2(ctx, each_value, i));
  }
  const out = (i) => transition_out(each_blocks[i], 1, 1, () => {
    each_blocks[i] = null;
  });
  return {
    c() {
      ul = element("ul");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(ul, "style", ctx[1]);
      attr(ul, "class", "svelte-9kex0m");
    },
    m(target, anchor) {
      insert(target, ul, anchor);
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(ul, null);
      }
      current = true;
    },
    p(ctx2, [dirty]) {
      if (dirty & 1) {
        each_value = ctx2[0];
        let i;
        for (i = 0; i < each_value.length; i += 1) {
          const child_ctx = get_each_context2(ctx2, each_value, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
            transition_in(each_blocks[i], 1);
          } else {
            each_blocks[i] = create_each_block2(child_ctx);
            each_blocks[i].c();
            transition_in(each_blocks[i], 1);
            each_blocks[i].m(ul, null);
          }
        }
        group_outros();
        for (i = each_value.length; i < each_blocks.length; i += 1) {
          out(i);
        }
        check_outros();
      }
      if (!current || dirty & 2) {
        attr(ul, "style", ctx2[1]);
      }
    },
    i(local) {
      if (current)
        return;
      for (let i = 0; i < each_value.length; i += 1) {
        transition_in(each_blocks[i]);
      }
      current = true;
    },
    o(local) {
      each_blocks = each_blocks.filter(Boolean);
      for (let i = 0; i < each_blocks.length; i += 1) {
        transition_out(each_blocks[i]);
      }
      current = false;
    },
    d(detaching) {
      if (detaching)
        detach(ul);
      destroy_each(each_blocks, detaching);
    }
  };
}
function instance3($$self, $$props, $$invalidate) {
  let { checkerResults } = $$props;
  let { ulStyle } = $$props;
  $$self.$$set = ($$props2) => {
    if ("checkerResults" in $$props2)
      $$invalidate(0, checkerResults = $$props2.checkerResults);
    if ("ulStyle" in $$props2)
      $$invalidate(1, ulStyle = $$props2.ulStyle);
  };
  return [checkerResults, ulStyle];
}
var List = class extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance3, create_fragment3, safe_not_equal, { checkerResults: 0, ulStyle: 1 }, add_css3);
  }
};
var List_default = List;

// src/components/Badge.svelte
function add_css4(target) {
  append_styles(target, "svelte-hjneft", ".badge-base.svelte-hjneft{appearance:none;font-size:0.9em;font-weight:bold;border:0px;border-radius:0.3em;padding:0.5em;cursor:pointer;position:fixed;z-index:99999;margin:0.5em}.badge-bl.svelte-hjneft{bottom:0px;left:0px}.badge-br.svelte-hjneft{bottom:0px;right:0px}.badge-tl.svelte-hjneft{top:0px;left:0px}.badge-tr.svelte-hjneft{top:0px;right:0px}.to-collpase.svelte-hjneft{color:white;background:rgb(63, 78, 96)}.to-uncollpase.svelte-hjneft{color:white}.emoji.svelte-hjneft{margin-right:0.5ch;font-family:'apple color emoji,segoe ui emoji,noto color emoji,android emoji,emojisymbols,emojione mozilla,twemoji mozilla,segoe ui symbol'}.summary.svelte-hjneft{font-family:var(--monospace);margin-right:1ch}.summary.svelte-hjneft:last-of-type{margin-right:0}.summary-error.svelte-hjneft{background:var(--red)}.summary-warning.svelte-hjneft{background:var(--yellow)}");
}
function create_else_block2(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "Close";
    },
    m(target, anchor) {
      insert(target, span, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching)
        detach(span);
    }
  };
}
function create_if_block2(ctx) {
  let if_block_anchor;
  let if_block = ctx[4].errorCount + ctx[4].warningCount > 0 && create_if_block_12(ctx);
  return {
    c() {
      if (if_block)
        if_block.c();
      if_block_anchor = empty();
    },
    m(target, anchor) {
      if (if_block)
        if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (ctx2[4].errorCount + ctx2[4].warningCount > 0) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_12(ctx2);
          if_block.c();
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },
    d(detaching) {
      if (if_block)
        if_block.d(detaching);
      if (detaching)
        detach(if_block_anchor);
    }
  };
}
function create_if_block_12(ctx) {
  let span1;
  let span0;
  let t1_value = ctx[4].errorCount + "";
  let t1;
  let t2;
  let span3;
  let span2;
  let t4_value = ctx[4].warningCount + "";
  let t4;
  return {
    c() {
      span1 = element("span");
      span0 = element("span");
      span0.textContent = "\u2757\uFE0F";
      t1 = text(t1_value);
      t2 = space();
      span3 = element("span");
      span2 = element("span");
      span2.textContent = "\u26A0\uFE0F";
      t4 = text(t4_value);
      attr(span0, "class", "emoji svelte-hjneft");
      attr(span1, "class", "summary svelte-hjneft");
      attr(span2, "class", "emoji svelte-hjneft");
      attr(span3, "class", "summary svelte-hjneft");
    },
    m(target, anchor) {
      insert(target, span1, anchor);
      append(span1, span0);
      append(span1, t1);
      insert(target, t2, anchor);
      insert(target, span3, anchor);
      append(span3, span2);
      append(span3, t4);
    },
    p(ctx2, dirty) {
      if (dirty & 16 && t1_value !== (t1_value = ctx2[4].errorCount + ""))
        set_data(t1, t1_value);
      if (dirty & 16 && t4_value !== (t4_value = ctx2[4].warningCount + ""))
        set_data(t4, t4_value);
    },
    d(detaching) {
      if (detaching)
        detach(span1);
      if (detaching)
        detach(t2);
      if (detaching)
        detach(span3);
    }
  };
}
function create_fragment4(ctx) {
  let button;
  let button_class_value;
  let mounted;
  let dispose;
  function select_block_type(ctx2, dirty) {
    if (ctx2[0])
      return create_if_block2;
    return create_else_block2;
  }
  let current_block_type = select_block_type(ctx, -1);
  let if_block = current_block_type(ctx);
  return {
    c() {
      button = element("button");
      if_block.c();
      attr(button, "class", button_class_value = null_to_empty(`badge-base ${ctx[0] ? `to-uncollpase ${ctx[5]}` : "to-collpase"} badge-${ctx[2]}`) + " svelte-hjneft");
      attr(button, "style", ctx[3]);
    },
    m(target, anchor) {
      insert(target, button, anchor);
      if_block.m(button, null);
      if (!mounted) {
        dispose = listen(button, "click", stop_propagation(function() {
          if (is_function(ctx[1]))
            ctx[1].apply(this, arguments);
        }));
        mounted = true;
      }
    },
    p(new_ctx, [dirty]) {
      ctx = new_ctx;
      if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
        if_block.p(ctx, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx);
        if (if_block) {
          if_block.c();
          if_block.m(button, null);
        }
      }
      if (dirty & 37 && button_class_value !== (button_class_value = null_to_empty(`badge-base ${ctx[0] ? `to-uncollpase ${ctx[5]}` : "to-collpase"} badge-${ctx[2]}`) + " svelte-hjneft")) {
        attr(button, "class", button_class_value);
      }
      if (dirty & 8) {
        attr(button, "style", ctx[3]);
      }
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching)
        detach(button);
      if_block.d();
      mounted = false;
      dispose();
    }
  };
}
function calcSummary(results) {
  let errorCount = 0;
  let warningCount = 0;
  results.forEach((result) => {
    result.diagnostics.forEach((d) => {
      if (d.level === 1)
        errorCount++;
      if (d.level === 0)
        warningCount++;
    });
  });
  return { errorCount, warningCount };
}
function instance4($$self, $$props, $$invalidate) {
  let summary;
  let calcBgColorClass;
  let bgColorClass;
  let { collapsed } = $$props;
  let { checkerResults } = $$props;
  let { onClick } = $$props;
  let { position = "bl" } = $$props;
  let { badgeStyle = "" } = $$props;
  $$self.$$set = ($$props2) => {
    if ("collapsed" in $$props2)
      $$invalidate(0, collapsed = $$props2.collapsed);
    if ("checkerResults" in $$props2)
      $$invalidate(6, checkerResults = $$props2.checkerResults);
    if ("onClick" in $$props2)
      $$invalidate(1, onClick = $$props2.onClick);
    if ("position" in $$props2)
      $$invalidate(2, position = $$props2.position);
    if ("badgeStyle" in $$props2)
      $$invalidate(3, badgeStyle = $$props2.badgeStyle);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty & 64) {
      $:
        $$invalidate(4, summary = calcSummary(checkerResults));
    }
    if ($$self.$$.dirty & 16) {
      $:
        $$invalidate(7, calcBgColorClass = () => {
          if (!summary)
            return "";
          if (summary.errorCount > 0)
            return "summary-error";
          if (summary.warningCount > 0)
            return "summary-warning";
          return "summary-success";
        });
    }
    if ($$self.$$.dirty & 128) {
      $:
        $$invalidate(5, bgColorClass = calcBgColorClass());
    }
  };
  return [
    collapsed,
    onClick,
    position,
    badgeStyle,
    summary,
    bgColorClass,
    checkerResults,
    calcBgColorClass
  ];
}
var Badge = class extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance4, create_fragment4, safe_not_equal, {
      collapsed: 0,
      checkerResults: 6,
      onClick: 1,
      position: 2,
      badgeStyle: 3
    }, add_css4);
  }
};
var Badge_default = Badge;

// src/App.svelte
function add_css5(target) {
  append_styles(target, "svelte-zrwou", ":host{--monospace:'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;--red:#ff5555;--yellow:#e2aa53;--purple:#cfa4ff;--blue:#a4c1ff;--cyan:#2dd9da;--dim:#c9c9c9}.window.svelte-zrwou{font-family:sans-serif;background-color:rgb(11, 21, 33);color:white;position:fixed;bottom:0px;right:0px;z-index:99998;width:100%;height:500px;max-height:90%;box-shadow:rgb(0 0 0 / 30%) 0px 0px 20px;border-top:1px solid rgb(63, 78, 96);transform-origin:center top;visibility:visible;transition:all 0.2s ease 0s;opacity:1;pointer-events:all;transform:translateY(0px) scale(1)}.window-collapsed.svelte-zrwou{transform:translateY(0px) scale(1);visibility:hidden;transition:all 0.2s ease 0s;opacity:0;pointer-events:none;transform:translateY(15px) scale(1.02)}.list-scroll.svelte-zrwou{height:100%;overflow:scroll;flex-grow:1}main.svelte-zrwou{padding:16px;width:100%;box-sizing:border-box}");
}
function create_fragment5(ctx) {
  let badge;
  let t;
  let main;
  let div;
  let list;
  let main_class_value;
  let current;
  let mounted;
  let dispose;
  badge = new Badge_default({
    props: {
      checkerResults: ctx[1],
      collapsed: ctx[2],
      position: ctx[0].position,
      badgeStyle: ctx[0].badgeStyle,
      onClick: ctx[3]
    }
  });
  list = new List_default({
    props: {
      checkerResults: ctx[1],
      ulStyle: "margin-bottom: 36px;"
    }
  });
  return {
    c() {
      create_component(badge.$$.fragment);
      t = space();
      main = element("main");
      div = element("div");
      create_component(list.$$.fragment);
      attr(div, "class", "list-scroll svelte-zrwou");
      attr(main, "class", main_class_value = null_to_empty(`window ${ctx[2] ? "window-collapsed" : ""}`) + " svelte-zrwou");
    },
    m(target, anchor) {
      mount_component(badge, target, anchor);
      insert(target, t, anchor);
      insert(target, main, anchor);
      append(main, div);
      mount_component(list, div, null);
      current = true;
      if (!mounted) {
        dispose = listen(main, "click", stop_propagation(ctx[4]));
        mounted = true;
      }
    },
    p(ctx2, [dirty]) {
      const badge_changes = {};
      if (dirty & 2)
        badge_changes.checkerResults = ctx2[1];
      if (dirty & 4)
        badge_changes.collapsed = ctx2[2];
      if (dirty & 1)
        badge_changes.position = ctx2[0].position;
      if (dirty & 1)
        badge_changes.badgeStyle = ctx2[0].badgeStyle;
      badge.$set(badge_changes);
      const list_changes = {};
      if (dirty & 2)
        list_changes.checkerResults = ctx2[1];
      list.$set(list_changes);
      if (!current || dirty & 4 && main_class_value !== (main_class_value = null_to_empty(`window ${ctx2[2] ? "window-collapsed" : ""}`) + " svelte-zrwou")) {
        attr(main, "class", main_class_value);
      }
    },
    i(local) {
      if (current)
        return;
      transition_in(badge.$$.fragment, local);
      transition_in(list.$$.fragment, local);
      current = true;
    },
    o(local) {
      transition_out(badge.$$.fragment, local);
      transition_out(list.$$.fragment, local);
      current = false;
    },
    d(detaching) {
      destroy_component(badge, detaching);
      if (detaching)
        detach(t);
      if (detaching)
        detach(main);
      destroy_component(list);
      mounted = false;
      dispose();
    }
  };
}
function instance5($$self, $$props, $$invalidate) {
  var _a;
  let collapsed;
  let { overlayConfig: overlayConfig2 = {} } = $$props;
  let { checkerResults } = $$props;
  const initialIsOpen = (_a = overlayConfig2 == null ? void 0 : overlayConfig2.initialIsOpen) != null ? _a : true;
  const toggle = () => {
    $$invalidate(2, collapsed = !collapsed);
  };
  function click_handler(event) {
    bubble.call(this, $$self, event);
  }
  $$self.$$set = ($$props2) => {
    if ("overlayConfig" in $$props2)
      $$invalidate(0, overlayConfig2 = $$props2.overlayConfig);
    if ("checkerResults" in $$props2)
      $$invalidate(1, checkerResults = $$props2.checkerResults);
  };
  $:
    $$invalidate(2, collapsed = !initialIsOpen);
  return [overlayConfig2, checkerResults, collapsed, toggle, click_handler];
}
var App = class extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance5, create_fragment5, safe_not_equal, { overlayConfig: 0, checkerResults: 1 }, add_css5);
  }
};
var App_default = App;

// src/ws.js
var socketProtocol = __HMR_PROTOCOL__ || (location.protocol === "https:" ? "wss" : "ws");
var socketHost = __HMR_PORT__ ? `${__HMR_HOSTNAME__ || location.hostname}:${__HMR_PORT__}` : `${__HMR_HOSTNAME__ || location.hostname}`;
var socket = new WebSocket(`${socketProtocol}://${socketHost}`, "vite-hmr");
var WS_CHECKER_ERROR_EVENT = "vite-plugin-checker:error";
var WS_CHECKER_RECONNECT_EVENT = "vite-plugin-checker:reconnect";
var WS_CHECKER_CONFIG_RUNTIME_EVENT = "vite-plugin-checker:config-runtime";
var onCustomMessage = [];
var onReconnectMessage = [];
var onConfigMessage = [];
function listenToConfigMessage(cb) {
  onConfigMessage.push(cb);
}
function listenToCustomMessage(cb) {
  onCustomMessage.push(cb);
}
function listenToReconnectMessage(cb) {
  onReconnectMessage.push(cb);
}
function prepareListen() {
  const onMessage = (_0) => __async(this, [_0], function* ({ data: dataStr }) {
    const data = JSON.parse(dataStr);
    switch (data.type) {
      case "update":
        break;
      case "full-reload":
        break;
    }
    if (data.type === "custom") {
      switch (data.event) {
        case WS_CHECKER_ERROR_EVENT:
          onCustomMessage.forEach((callbackfn) => callbackfn(data.data));
          break;
        case WS_CHECKER_RECONNECT_EVENT:
          onReconnectMessage.forEach((callbackfn) => callbackfn(data.data));
          break;
        case WS_CHECKER_CONFIG_RUNTIME_EVENT:
          onConfigMessage.forEach((callbackfn) => callbackfn(data.data));
          break;
      }
    }
  });
  return {
    start: () => socket.addEventListener("message", onMessage)
  };
}

// src/main.js
var enableOverlay = true;
var overlayEle = null;
var app = null;
var checkerResultsStore = [];
var overlayConfig = {};
var ErrorOverlay = class extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.addEventListener("click", () => {
      clearErrorOverlay();
    });
  }
  close() {
    var _a;
    (_a = this.parentNode) == null ? void 0 : _a.removeChild(this);
  }
};
var overlayId = "vite-plugin-checker-error-overlay";
if (customElements && !customElements.get(overlayId)) {
  customElements.define(overlayId, ErrorOverlay);
}
function updateErrorOverlay(payloads) {
  if (!enableOverlay)
    return;
  const payloadArray = Array.isArray(payloads) ? payloads : [payloads];
  checkerResultsStore = checkerResultsStore.filter((existCheckerResult) => {
    return !payloadArray.map((p) => p.checkerId).includes(existCheckerResult.checkerId);
  });
  checkerResultsStore = [...checkerResultsStore, ...payloadArray];
  const hasDiagnosticToShowInOverlay = checkerResultsStore.some((p) => p.diagnostics.length);
  if (!hasDiagnosticToShowInOverlay) {
    clearErrorOverlay();
    overlayEle = null;
    app = null;
    return;
  }
  if (!overlayEle) {
    overlayEle = new ErrorOverlay();
    document.body.appendChild(overlayEle);
    app = new App_default({
      target: overlayEle.root,
      props: {
        checkerResults: checkerResultsStore,
        overlayConfig
      }
    });
  } else {
    app.$$set({
      checkerResults: checkerResultsStore
    });
  }
}
function resumeErrorOverlay(data) {
  const payloadsToResume = data.map((d) => d.data);
  updateErrorOverlay(payloadsToResume);
}
function configOverlay(data) {
  overlayConfig = data;
}
function clearErrorOverlay() {
  document.querySelectorAll(overlayId).forEach((n) => n.close());
  overlayEle = null;
  app = null;
}
function inject() {
  const ws = prepareListen();
  listenToCustomMessage(updateErrorOverlay);
  listenToReconnectMessage(resumeErrorOverlay);
  listenToConfigMessage(configOverlay);
  ws.start();
}
export {
  inject
};
