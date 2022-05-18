"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const t = __importStar(require("@babel/types"));
const helper_module_imports_1 = require("@babel/helper-module-imports");
const utils_1 = require("./utils");
const parseDirectives_1 = __importDefault(require("./parseDirectives"));
const xlinkRE = /^xlink([A-Z])/;
const getJSXAttributeValue = (path, state) => {
    const valuePath = path.get('value');
    if (valuePath.isJSXElement()) {
        return transformJSXElement(valuePath, state);
    }
    if (valuePath.isStringLiteral()) {
        return valuePath.node;
    }
    if (valuePath.isJSXExpressionContainer()) {
        return (0, utils_1.transformJSXExpressionContainer)(valuePath);
    }
    return null;
};
const buildProps = (path, state) => {
    const tag = (0, utils_1.getTag)(path, state);
    const isComponent = (0, utils_1.checkIsComponent)(path.get('openingElement'), state);
    const props = path.get('openingElement').get('attributes');
    const directives = [];
    const dynamicPropNames = new Set();
    let slots = null;
    let patchFlag = 0;
    if (props.length === 0) {
        return {
            tag,
            isComponent,
            slots,
            props: t.nullLiteral(),
            directives,
            patchFlag,
            dynamicPropNames,
        };
    }
    let properties = [];
    // patchFlag analysis
    let hasRef = false;
    let hasClassBinding = false;
    let hasStyleBinding = false;
    let hasHydrationEventBinding = false;
    let hasDynamicKeys = false;
    const mergeArgs = [];
    const { mergeProps = true } = state.opts;
    props
        .forEach((prop) => {
        if (prop.isJSXAttribute()) {
            let name = (0, utils_1.getJSXAttributeName)(prop);
            const attributeValue = getJSXAttributeValue(prop, state);
            if (!(0, utils_1.isConstant)(attributeValue) || name === 'ref') {
                if (!isComponent
                    && (0, utils_1.isOn)(name)
                    // omit the flag for click handlers becaues hydration gives click
                    // dedicated fast path.
                    && name.toLowerCase() !== 'onclick'
                    // omit v-model handlers
                    && name !== 'onUpdate:modelValue') {
                    hasHydrationEventBinding = true;
                }
                if (name === 'ref') {
                    hasRef = true;
                }
                else if (name === 'class' && !isComponent) {
                    hasClassBinding = true;
                }
                else if (name === 'style' && !isComponent) {
                    hasStyleBinding = true;
                }
                else if (name !== 'key'
                    && !(0, utils_1.isDirective)(name)
                    && name !== 'on') {
                    dynamicPropNames.add(name);
                }
            }
            if (state.opts.transformOn && (name === 'on' || name === 'nativeOn')) {
                if (!state.get('transformOn')) {
                    state.set('transformOn', (0, helper_module_imports_1.addDefault)(path, '@vue/babel-helper-vue-transform-on', { nameHint: '_transformOn' }));
                }
                mergeArgs.push(t.callExpression(state.get('transformOn'), [attributeValue || t.booleanLiteral(true)]));
                return;
            }
            if ((0, utils_1.isDirective)(name)) {
                const { directive, modifiers, values, args, directiveName, } = (0, parseDirectives_1.default)({
                    tag,
                    isComponent,
                    name,
                    path: prop,
                    state,
                    value: attributeValue,
                });
                if (directiveName === 'slots') {
                    slots = attributeValue;
                    return;
                }
                if (directive) {
                    directives.push(t.arrayExpression(directive));
                }
                else if (directiveName === 'html') {
                    properties.push(t.objectProperty(t.stringLiteral('innerHTML'), values[0]));
                    dynamicPropNames.add('innerHTML');
                }
                else if (directiveName === 'text') {
                    properties.push(t.objectProperty(t.stringLiteral('textContent'), values[0]));
                    dynamicPropNames.add('textContent');
                }
                if (['models', 'model'].includes(directiveName)) {
                    values.forEach((value, index) => {
                        var _a, _b, _c, _d;
                        const propName = args[index];
                        // v-model target with variable
                        const isDynamic = propName && !t.isStringLiteral(propName) && !t.isNullLiteral(propName);
                        // must be v-model or v-models and is a component
                        if (!directive) {
                            properties.push(t.objectProperty(t.isNullLiteral(propName)
                                ? t.stringLiteral('modelValue') : propName, value, isDynamic));
                            if (!isDynamic) {
                                dynamicPropNames.add(((_a = propName) === null || _a === void 0 ? void 0 : _a.value) || 'modelValue');
                            }
                            if ((_b = modifiers[index]) === null || _b === void 0 ? void 0 : _b.size) {
                                properties.push(t.objectProperty(isDynamic
                                    ? t.binaryExpression('+', propName, t.stringLiteral('Modifiers'))
                                    : t.stringLiteral(`${((_c = propName) === null || _c === void 0 ? void 0 : _c.value) || 'model'}Modifiers`), t.objectExpression([...modifiers[index]].map((modifier) => t.objectProperty(t.stringLiteral(modifier), t.booleanLiteral(true)))), isDynamic));
                            }
                        }
                        const updateName = isDynamic
                            ? t.binaryExpression('+', t.stringLiteral('onUpdate'), propName)
                            : t.stringLiteral(`onUpdate:${((_d = propName) === null || _d === void 0 ? void 0 : _d.value) || 'modelValue'}`);
                        properties.push(t.objectProperty(updateName, t.arrowFunctionExpression([t.identifier('$event')], t.assignmentExpression('=', value, t.identifier('$event'))), isDynamic));
                        if (!isDynamic) {
                            dynamicPropNames.add(updateName.value);
                        }
                        else {
                            hasDynamicKeys = true;
                        }
                    });
                }
            }
            else {
                if (name.match(xlinkRE)) {
                    name = name.replace(xlinkRE, (_, firstCharacter) => `xlink:${firstCharacter.toLowerCase()}`);
                }
                properties.push(t.objectProperty(t.stringLiteral(name), attributeValue || t.booleanLiteral(true)));
            }
        }
        else {
            if (properties.length && mergeProps) {
                mergeArgs.push(t.objectExpression((0, utils_1.dedupeProperties)(properties, mergeProps)));
                properties = [];
            }
            // JSXSpreadAttribute
            hasDynamicKeys = true;
            (0, utils_1.transformJSXSpreadAttribute)(path, prop, mergeProps, mergeProps ? mergeArgs : properties);
        }
    });
    // patchFlag analysis
    if (hasDynamicKeys) {
        patchFlag |= 16 /* FULL_PROPS */;
    }
    else {
        if (hasClassBinding) {
            patchFlag |= 2 /* CLASS */;
        }
        if (hasStyleBinding) {
            patchFlag |= 4 /* STYLE */;
        }
        if (dynamicPropNames.size) {
            patchFlag |= 8 /* PROPS */;
        }
        if (hasHydrationEventBinding) {
            patchFlag |= 32 /* HYDRATE_EVENTS */;
        }
    }
    if ((patchFlag === 0 || patchFlag === 32 /* HYDRATE_EVENTS */)
        && (hasRef || directives.length > 0)) {
        patchFlag |= 512 /* NEED_PATCH */;
    }
    let propsExpression = t.nullLiteral();
    if (mergeArgs.length) {
        if (properties.length) {
            mergeArgs.push(t.objectExpression((0, utils_1.dedupeProperties)(properties, mergeProps)));
        }
        if (mergeArgs.length > 1) {
            propsExpression = t.callExpression((0, utils_1.createIdentifier)(state, 'mergeProps'), mergeArgs);
        }
        else {
            // single no need for a mergeProps call
            propsExpression = mergeArgs[0];
        }
    }
    else if (properties.length) {
        // single no need for spread
        if (properties.length === 1 && t.isSpreadElement(properties[0])) {
            propsExpression = properties[0].argument;
        }
        else {
            propsExpression = t.objectExpression((0, utils_1.dedupeProperties)(properties, mergeProps));
        }
    }
    return {
        tag,
        props: propsExpression,
        isComponent,
        slots,
        directives,
        patchFlag,
        dynamicPropNames,
    };
};
/**
 * Get children from Array of JSX children
 * @param paths Array<JSXText | JSXExpressionContainer  | JSXElement | JSXFragment>
 * @returns Array<Expression | SpreadElement>
 */
const getChildren = (paths, state) => paths
    .map((path) => {
    if (path.isJSXText()) {
        const transformedText = (0, utils_1.transformJSXText)(path);
        if (transformedText) {
            return t.callExpression((0, utils_1.createIdentifier)(state, 'createTextVNode'), [transformedText]);
        }
        return transformedText;
    }
    if (path.isJSXExpressionContainer()) {
        const expression = (0, utils_1.transformJSXExpressionContainer)(path);
        if (t.isIdentifier(expression)) {
            const { name } = expression;
            const { referencePaths = [] } = path.scope.getBinding(name) || {};
            referencePaths.forEach((referencePath) => {
                (0, utils_1.walksScope)(referencePath, name, 2 /* DYNAMIC */);
            });
        }
        return expression;
    }
    if (t.isJSXSpreadChild(path)) {
        return (0, utils_1.transformJSXSpreadChild)(path);
    }
    if (path.isCallExpression()) {
        return path.node;
    }
    if (path.isJSXElement()) {
        return transformJSXElement(path, state);
    }
    throw new Error(`getChildren: ${path.type} is not supported`);
}).filter(((value) => (value !== undefined
    && value !== null
    && !t.isJSXEmptyExpression(value))));
const transformJSXElement = (path, state) => {
    const children = getChildren(path.get('children'), state);
    const { tag, props, isComponent, directives, patchFlag, dynamicPropNames, slots, } = buildProps(path, state);
    const { optimize = false } = state.opts;
    const slotFlag = path.getData('slotFlag') || 1 /* STABLE */;
    let VNodeChild;
    if (children.length > 1 || slots) {
        /*
          <A v-slots={slots}>{a}{b}</A>
            ---> {{ default: () => [a, b], ...slots }}
            ---> {[a, b]}
        */
        VNodeChild = isComponent
            ? children.length
                ? t.objectExpression([
                    !!children.length && t.objectProperty(t.identifier('default'), t.arrowFunctionExpression([], t.arrayExpression((0, utils_1.buildIIFE)(path, children)))),
                    ...(slots ? (t.isObjectExpression(slots)
                        ? slots.properties
                        : [t.spreadElement(slots)]) : []),
                    optimize && t.objectProperty(t.identifier('_'), t.numericLiteral(slotFlag)),
                ].filter(Boolean))
                : slots
            : t.arrayExpression(children);
    }
    else if (children.length === 1) {
        /*
          <A>{a}</A> or <A>{() => a}</A>
         */
        const { enableObjectSlots = true } = state.opts;
        const child = children[0];
        const objectExpression = t.objectExpression([
            t.objectProperty(t.identifier('default'), t.arrowFunctionExpression([], t.arrayExpression((0, utils_1.buildIIFE)(path, [child])))),
            optimize && t.objectProperty(t.identifier('_'), t.numericLiteral(slotFlag)),
        ].filter(Boolean));
        if (t.isIdentifier(child) && isComponent) {
            VNodeChild = enableObjectSlots ? t.conditionalExpression(t.callExpression(state.get('@vue/babel-plugin-jsx/runtimeIsSlot')(), [child]), child, objectExpression) : objectExpression;
        }
        else if (t.isCallExpression(child) && child.loc && isComponent) { // the element was generated and doesn't have location information
            if (enableObjectSlots) {
                const { scope } = path;
                const slotId = scope.generateUidIdentifier('slot');
                if (scope) {
                    scope.push({
                        id: slotId,
                        kind: 'let',
                    });
                }
                const alternate = t.objectExpression([
                    t.objectProperty(t.identifier('default'), t.arrowFunctionExpression([], t.arrayExpression((0, utils_1.buildIIFE)(path, [slotId])))), optimize && t.objectProperty(t.identifier('_'), t.numericLiteral(slotFlag)),
                ].filter(Boolean));
                const assignment = t.assignmentExpression('=', slotId, child);
                const condition = t.callExpression(state.get('@vue/babel-plugin-jsx/runtimeIsSlot')(), [assignment]);
                VNodeChild = t.conditionalExpression(condition, slotId, alternate);
            }
            else {
                VNodeChild = objectExpression;
            }
        }
        else if (t.isFunctionExpression(child) || t.isArrowFunctionExpression(child)) {
            VNodeChild = t.objectExpression([
                t.objectProperty(t.identifier('default'), child),
            ]);
        }
        else if (t.isObjectExpression(child)) {
            VNodeChild = t.objectExpression([
                ...child.properties,
                optimize && t.objectProperty(t.identifier('_'), t.numericLiteral(slotFlag)),
            ].filter(Boolean));
        }
        else {
            VNodeChild = isComponent ? t.objectExpression([
                t.objectProperty(t.identifier('default'), t.arrowFunctionExpression([], t.arrayExpression([child]))),
            ]) : t.arrayExpression([child]);
        }
    }
    const createVNode = t.callExpression((0, utils_1.createIdentifier)(state, 'createVNode'), [
        tag,
        props,
        VNodeChild || t.nullLiteral(),
        !!patchFlag && optimize && t.numericLiteral(patchFlag),
        !!dynamicPropNames.size && optimize
            && t.arrayExpression([...dynamicPropNames.keys()].map((name) => t.stringLiteral(name))),
    ].filter(Boolean));
    if (!directives.length) {
        return createVNode;
    }
    return t.callExpression((0, utils_1.createIdentifier)(state, 'withDirectives'), [
        createVNode,
        t.arrayExpression(directives),
    ]);
};
exports.default = ({
    JSXElement: {
        exit(path, state) {
            path.replaceWith(transformJSXElement(path, state));
        },
    },
});
//# sourceMappingURL=transform-vue-jsx.js.map