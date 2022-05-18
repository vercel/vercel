var drawChart = (function (exports) {
    'use strict';

    var n,l$1,u$1,t$1,r$1,o$2,f$1,e$2={},c$1=[],s$1=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;function a$1(n,l){for(var u in l)n[u]=l[u];return n}function h(n){var l=n.parentNode;l&&l.removeChild(n);}function v$1(l,u,i){var t,r,o,f={};for(o in u)"key"==o?t=u[o]:"ref"==o?r=u[o]:f[o]=u[o];if(arguments.length>2&&(f.children=arguments.length>3?n.call(arguments,2):i),"function"==typeof l&&null!=l.defaultProps)for(o in l.defaultProps)void 0===f[o]&&(f[o]=l.defaultProps[o]);return y$1(l,f,t,r,null)}function y$1(n,i,t,r,o){var f={type:n,props:i,key:t,ref:r,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,__h:null,constructor:void 0,__v:null==o?++u$1:o};return null==o&&null!=l$1.vnode&&l$1.vnode(f),f}function d$1(n){return n.children}function _(n,l){this.props=n,this.context=l;}function k$1(n,l){if(null==l)return n.__?k$1(n.__,n.__.__k.indexOf(n)+1):null;for(var u;l<n.__k.length;l++)if(null!=(u=n.__k[l])&&null!=u.__e)return u.__e;return "function"==typeof n.type?k$1(n):null}function b$1(n){var l,u;if(null!=(n=n.__)&&null!=n.__c){for(n.__e=n.__c.base=null,l=0;l<n.__k.length;l++)if(null!=(u=n.__k[l])&&null!=u.__e){n.__e=n.__c.base=u.__e;break}return b$1(n)}}function m$1(n){(!n.__d&&(n.__d=!0)&&t$1.push(n)&&!g$1.__r++||o$2!==l$1.debounceRendering)&&((o$2=l$1.debounceRendering)||r$1)(g$1);}function g$1(){for(var n;g$1.__r=t$1.length;)n=t$1.sort(function(n,l){return n.__v.__b-l.__v.__b}),t$1=[],n.some(function(n){var l,u,i,t,r,o;n.__d&&(r=(t=(l=n).__v).__e,(o=l.__P)&&(u=[],(i=a$1({},t)).__v=t.__v+1,j$1(o,t,i,l.__n,void 0!==o.ownerSVGElement,null!=t.__h?[r]:null,u,null==r?k$1(t):r,t.__h),z(u,t),t.__e!=r&&b$1(t)));});}function w$1(n,l,u,i,t,r,o,f,s,a){var h,v,p,_,b,m,g,w=i&&i.__k||c$1,A=w.length;for(u.__k=[],h=0;h<l.length;h++)if(null!=(_=u.__k[h]=null==(_=l[h])||"boolean"==typeof _?null:"string"==typeof _||"number"==typeof _||"bigint"==typeof _?y$1(null,_,null,null,_):Array.isArray(_)?y$1(d$1,{children:_},null,null,null):_.__b>0?y$1(_.type,_.props,_.key,null,_.__v):_)){if(_.__=u,_.__b=u.__b+1,null===(p=w[h])||p&&_.key==p.key&&_.type===p.type)w[h]=void 0;else for(v=0;v<A;v++){if((p=w[v])&&_.key==p.key&&_.type===p.type){w[v]=void 0;break}p=null;}j$1(n,_,p=p||e$2,t,r,o,f,s,a),b=_.__e,(v=_.ref)&&p.ref!=v&&(g||(g=[]),p.ref&&g.push(p.ref,null,_),g.push(v,_.__c||b,_)),null!=b?(null==m&&(m=b),"function"==typeof _.type&&_.__k===p.__k?_.__d=s=x$1(_,s,n):s=P(n,_,p,w,b,s),"function"==typeof u.type&&(u.__d=s)):s&&p.__e==s&&s.parentNode!=n&&(s=k$1(p));}for(u.__e=m,h=A;h--;)null!=w[h]&&("function"==typeof u.type&&null!=w[h].__e&&w[h].__e==u.__d&&(u.__d=k$1(i,h+1)),N(w[h],w[h]));if(g)for(h=0;h<g.length;h++)M(g[h],g[++h],g[++h]);}function x$1(n,l,u){for(var i,t=n.__k,r=0;t&&r<t.length;r++)(i=t[r])&&(i.__=n,l="function"==typeof i.type?x$1(i,l,u):P(u,i,i,t,i.__e,l));return l}function P(n,l,u,i,t,r){var o,f,e;if(void 0!==l.__d)o=l.__d,l.__d=void 0;else if(null==u||t!=r||null==t.parentNode)n:if(null==r||r.parentNode!==n)n.appendChild(t),o=null;else {for(f=r,e=0;(f=f.nextSibling)&&e<i.length;e+=2)if(f==t)break n;n.insertBefore(t,r),o=r;}return void 0!==o?o:t.nextSibling}function C(n,l,u,i,t){var r;for(r in u)"children"===r||"key"===r||r in l||H(n,r,null,u[r],i);for(r in l)t&&"function"!=typeof l[r]||"children"===r||"key"===r||"value"===r||"checked"===r||u[r]===l[r]||H(n,r,l[r],u[r],i);}function $(n,l,u){"-"===l[0]?n.setProperty(l,u):n[l]=null==u?"":"number"!=typeof u||s$1.test(l)?u:u+"px";}function H(n,l,u,i,t){var r;n:if("style"===l)if("string"==typeof u)n.style.cssText=u;else {if("string"==typeof i&&(n.style.cssText=i=""),i)for(l in i)u&&l in u||$(n.style,l,"");if(u)for(l in u)i&&u[l]===i[l]||$(n.style,l,u[l]);}else if("o"===l[0]&&"n"===l[1])r=l!==(l=l.replace(/Capture$/,"")),l=l.toLowerCase()in n?l.toLowerCase().slice(2):l.slice(2),n.l||(n.l={}),n.l[l+r]=u,u?i||n.addEventListener(l,r?T:I,r):n.removeEventListener(l,r?T:I,r);else if("dangerouslySetInnerHTML"!==l){if(t)l=l.replace(/xlink[H:h]/,"h").replace(/sName$/,"s");else if("href"!==l&&"list"!==l&&"form"!==l&&"tabIndex"!==l&&"download"!==l&&l in n)try{n[l]=null==u?"":u;break n}catch(n){}"function"==typeof u||(null!=u&&(!1!==u||"a"===l[0]&&"r"===l[1])?n.setAttribute(l,u):n.removeAttribute(l));}}function I(n){this.l[n.type+!1](l$1.event?l$1.event(n):n);}function T(n){this.l[n.type+!0](l$1.event?l$1.event(n):n);}function j$1(n,u,i,t,r,o,f,e,c){var s,h,v,y,p,k,b,m,g,x,A,P=u.type;if(void 0!==u.constructor)return null;null!=i.__h&&(c=i.__h,e=u.__e=i.__e,u.__h=null,o=[e]),(s=l$1.__b)&&s(u);try{n:if("function"==typeof P){if(m=u.props,g=(s=P.contextType)&&t[s.__c],x=s?g?g.props.value:s.__:t,i.__c?b=(h=u.__c=i.__c).__=h.__E:("prototype"in P&&P.prototype.render?u.__c=h=new P(m,x):(u.__c=h=new _(m,x),h.constructor=P,h.render=O),g&&g.sub(h),h.props=m,h.state||(h.state={}),h.context=x,h.__n=t,v=h.__d=!0,h.__h=[]),null==h.__s&&(h.__s=h.state),null!=P.getDerivedStateFromProps&&(h.__s==h.state&&(h.__s=a$1({},h.__s)),a$1(h.__s,P.getDerivedStateFromProps(m,h.__s))),y=h.props,p=h.state,v)null==P.getDerivedStateFromProps&&null!=h.componentWillMount&&h.componentWillMount(),null!=h.componentDidMount&&h.__h.push(h.componentDidMount);else {if(null==P.getDerivedStateFromProps&&m!==y&&null!=h.componentWillReceiveProps&&h.componentWillReceiveProps(m,x),!h.__e&&null!=h.shouldComponentUpdate&&!1===h.shouldComponentUpdate(m,h.__s,x)||u.__v===i.__v){h.props=m,h.state=h.__s,u.__v!==i.__v&&(h.__d=!1),h.__v=u,u.__e=i.__e,u.__k=i.__k,u.__k.forEach(function(n){n&&(n.__=u);}),h.__h.length&&f.push(h);break n}null!=h.componentWillUpdate&&h.componentWillUpdate(m,h.__s,x),null!=h.componentDidUpdate&&h.__h.push(function(){h.componentDidUpdate(y,p,k);});}h.context=x,h.props=m,h.state=h.__s,(s=l$1.__r)&&s(u),h.__d=!1,h.__v=u,h.__P=n,s=h.render(h.props,h.state,h.context),h.state=h.__s,null!=h.getChildContext&&(t=a$1(a$1({},t),h.getChildContext())),v||null==h.getSnapshotBeforeUpdate||(k=h.getSnapshotBeforeUpdate(y,p)),A=null!=s&&s.type===d$1&&null==s.key?s.props.children:s,w$1(n,Array.isArray(A)?A:[A],u,i,t,r,o,f,e,c),h.base=u.__e,u.__h=null,h.__h.length&&f.push(h),b&&(h.__E=h.__=null),h.__e=!1;}else null==o&&u.__v===i.__v?(u.__k=i.__k,u.__e=i.__e):u.__e=L(i.__e,u,i,t,r,o,f,c);(s=l$1.diffed)&&s(u);}catch(n){u.__v=null,(c||null!=o)&&(u.__e=e,u.__h=!!c,o[o.indexOf(e)]=null),l$1.__e(n,u,i);}}function z(n,u){l$1.__c&&l$1.__c(u,n),n.some(function(u){try{n=u.__h,u.__h=[],n.some(function(n){n.call(u);});}catch(n){l$1.__e(n,u.__v);}});}function L(l,u,i,t,r,o,f,c){var s,a,v,y=i.props,p=u.props,d=u.type,_=0;if("svg"===d&&(r=!0),null!=o)for(;_<o.length;_++)if((s=o[_])&&"setAttribute"in s==!!d&&(d?s.localName===d:3===s.nodeType)){l=s,o[_]=null;break}if(null==l){if(null===d)return document.createTextNode(p);l=r?document.createElementNS("http://www.w3.org/2000/svg",d):document.createElement(d,p.is&&p),o=null,c=!1;}if(null===d)y===p||c&&l.data===p||(l.data=p);else {if(o=o&&n.call(l.childNodes),a=(y=i.props||e$2).dangerouslySetInnerHTML,v=p.dangerouslySetInnerHTML,!c){if(null!=o)for(y={},_=0;_<l.attributes.length;_++)y[l.attributes[_].name]=l.attributes[_].value;(v||a)&&(v&&(a&&v.__html==a.__html||v.__html===l.innerHTML)||(l.innerHTML=v&&v.__html||""));}if(C(l,p,y,r,c),v)u.__k=[];else if(_=u.props.children,w$1(l,Array.isArray(_)?_:[_],u,i,t,r&&"foreignObject"!==d,o,f,o?o[0]:i.__k&&k$1(i,0),c),null!=o)for(_=o.length;_--;)null!=o[_]&&h(o[_]);c||("value"in p&&void 0!==(_=p.value)&&(_!==y.value||_!==l.value||"progress"===d&&!_)&&H(l,"value",_,y.value,!1),"checked"in p&&void 0!==(_=p.checked)&&_!==l.checked&&H(l,"checked",_,y.checked,!1));}return l}function M(n,u,i){try{"function"==typeof n?n(u):n.current=u;}catch(n){l$1.__e(n,i);}}function N(n,u,i){var t,r;if(l$1.unmount&&l$1.unmount(n),(t=n.ref)&&(t.current&&t.current!==n.__e||M(t,null,u)),null!=(t=n.__c)){if(t.componentWillUnmount)try{t.componentWillUnmount();}catch(n){l$1.__e(n,u);}t.base=t.__P=null;}if(t=n.__k)for(r=0;r<t.length;r++)t[r]&&N(t[r],u,"function"!=typeof n.type);i||null==n.__e||h(n.__e),n.__e=n.__d=void 0;}function O(n,l,u){return this.constructor(n,u)}function S(u,i,t){var r,o,f;l$1.__&&l$1.__(u,i),o=(r="function"==typeof t)?null:t&&t.__k||i.__k,f=[],j$1(i,u=(!r&&t||i).__k=v$1(d$1,null,[u]),o||e$2,e$2,void 0!==i.ownerSVGElement,!r&&t?[t]:o?null:i.firstChild?n.call(i.childNodes):null,f,!r&&t?t:o?o.__e:i.firstChild,r),z(f,u);}function D(n,l){var u={__c:l="__cC"+f$1++,__:n,Consumer:function(n,l){return n.children(l)},Provider:function(n){var u,i;return this.getChildContext||(u=[],(i={})[l]=this,this.getChildContext=function(){return i},this.shouldComponentUpdate=function(n){this.props.value!==n.value&&u.some(m$1);},this.sub=function(n){u.push(n);var l=n.componentWillUnmount;n.componentWillUnmount=function(){u.splice(u.indexOf(n),1),l&&l.call(n);};}),n.children}};return u.Provider.__=u.Consumer.contextType=u}n=c$1.slice,l$1={__e:function(n,l){for(var u,i,t;l=l.__;)if((u=l.__c)&&!u.__)try{if((i=u.constructor)&&null!=i.getDerivedStateFromError&&(u.setState(i.getDerivedStateFromError(n)),t=u.__d),null!=u.componentDidCatch&&(u.componentDidCatch(n),t=u.__d),t)return u.__E=u}catch(l){n=l;}throw n}},u$1=0,_.prototype.setState=function(n,l){var u;u=null!=this.__s&&this.__s!==this.state?this.__s:this.__s=a$1({},this.state),"function"==typeof n&&(n=n(a$1({},u),this.props)),n&&a$1(u,n),null!=n&&this.__v&&(l&&this.__h.push(l),m$1(this));},_.prototype.forceUpdate=function(n){this.__v&&(this.__e=!0,n&&this.__h.push(n),m$1(this));},_.prototype.render=d$1,t$1=[],r$1="function"==typeof Promise?Promise.prototype.then.bind(Promise.resolve()):setTimeout,g$1.__r=0,f$1=0;

    var o$1=0;function e$1(_,e,n,t,f){var l,s,u={};for(s in e)"ref"==s?l=e[s]:u[s]=e[s];var a={type:_,props:u,key:n,ref:l,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,__h:null,constructor:void 0,__v:--o$1,__source:t,__self:f};if("function"==typeof _&&(l=_.defaultProps))for(s in l)void 0===u[s]&&(u[s]=l[s]);return l$1.vnode&&l$1.vnode(a),a}

    const LABELS = {
        renderedLength: "Rendered",
        gzipLength: "Gzip",
        brotliLength: "Brotli",
    };
    const getAvailableSizeOptions = (options) => {
        const availableSizeProperties = ["renderedLength"];
        if (options.gzip) {
            availableSizeProperties.push("gzipLength");
        }
        if (options.brotli) {
            availableSizeProperties.push("brotliLength");
        }
        return availableSizeProperties;
    };

    var t,u,r,o=0,i=[],c=l$1.__b,f=l$1.__r,e=l$1.diffed,a=l$1.__c,v=l$1.unmount;function m(t,r){l$1.__h&&l$1.__h(u,t,o||r),o=0;var i=u.__H||(u.__H={__:[],__h:[]});return t>=i.__.length&&i.__.push({}),i.__[t]}function l(n){return o=1,p(w,n)}function p(n,r,o){var i=m(t++,2);return i.t=n,i.__c||(i.__=[o?o(r):w(void 0,r),function(n){var t=i.t(i.__[0],n);i.__[0]!==t&&(i.__=[t,i.__[1]],i.__c.setState({}));}],i.__c=u),i.__}function y(r,o){var i=m(t++,3);!l$1.__s&&k(i.__H,o)&&(i.__=r,i.__H=o,u.__H.__h.push(i));}function s(n){return o=5,d(function(){return {current:n}},[])}function d(n,u){var r=m(t++,7);return k(r.__H,u)&&(r.__=n(),r.__H=u,r.__h=n),r.__}function F(n){var r=u.context[n.__c],o=m(t++,9);return o.c=n,r?(null==o.__&&(o.__=!0,r.sub(u)),r.props.value):n.__}function x(){var t;for(i.sort(function(n,t){return n.__v.__b-t.__v.__b});t=i.pop();)if(t.__P)try{t.__H.__h.forEach(g),t.__H.__h.forEach(j),t.__H.__h=[];}catch(u){t.__H.__h=[],l$1.__e(u,t.__v);}}l$1.__b=function(n){u=null,c&&c(n);},l$1.__r=function(n){f&&f(n),t=0;var r=(u=n.__c).__H;r&&(r.__h.forEach(g),r.__h.forEach(j),r.__h=[]);},l$1.diffed=function(t){e&&e(t);var o=t.__c;o&&o.__H&&o.__H.__h.length&&(1!==i.push(o)&&r===l$1.requestAnimationFrame||((r=l$1.requestAnimationFrame)||function(n){var t,u=function(){clearTimeout(r),b&&cancelAnimationFrame(t),setTimeout(n);},r=setTimeout(u,100);b&&(t=requestAnimationFrame(u));})(x)),u=null;},l$1.__c=function(t,u){u.some(function(t){try{t.__h.forEach(g),t.__h=t.__h.filter(function(n){return !n.__||j(n)});}catch(r){u.some(function(n){n.__h&&(n.__h=[]);}),u=[],l$1.__e(r,t.__v);}}),a&&a(t,u);},l$1.unmount=function(t){v&&v(t);var u,r=t.__c;r&&r.__H&&(r.__H.__.forEach(function(n){try{g(n);}catch(n){u=n;}}),u&&l$1.__e(u,r.__v));};var b="function"==typeof requestAnimationFrame;function g(n){var t=u,r=n.__c;"function"==typeof r&&(n.__c=void 0,r()),u=t;}function j(n){var t=u;n.__c=n.__(),u=t;}function k(n,t){return !n||n.length!==t.length||t.some(function(t,u){return t!==n[u]})}function w(n,t){return "function"==typeof t?t(n):t}

    function ascending(a, b) {
      return a == null || b == null ? NaN : a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector(f) {
      let delta = f;
      let compare1 = f;
      let compare2 = f;

      if (f.length !== 2) {
        delta = (d, x) => f(d) - x;
        compare1 = ascending;
        compare2 = (d, x) => ascending(f(d), x);
      }

      function left(a, x, lo = 0, hi = a.length) {
        if (lo < hi) {
          if (compare1(x, x) !== 0) return hi;
          do {
            const mid = (lo + hi) >>> 1;
            if (compare2(a[mid], x) < 0) lo = mid + 1;
            else hi = mid;
          } while (lo < hi);
        }
        return lo;
      }

      function right(a, x, lo = 0, hi = a.length) {
        if (lo < hi) {
          if (compare1(x, x) !== 0) return hi;
          do {
            const mid = (lo + hi) >>> 1;
            if (compare2(a[mid], x) <= 0) lo = mid + 1;
            else hi = mid;
          } while (lo < hi);
        }
        return lo;
      }

      function center(a, x, lo = 0, hi = a.length) {
        const i = left(a, x, lo, hi - 1);
        return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
      }

      return {left, center, right};
    }

    function number$1(x) {
      return x === null ? NaN : +x;
    }

    const ascendingBisect = bisector(ascending);
    const bisectRight = ascendingBisect.right;
    bisector(number$1).center;
    var bisect = bisectRight;

    var e10 = Math.sqrt(50),
        e5 = Math.sqrt(10),
        e2 = Math.sqrt(2);

    function ticks(start, stop, count) {
      var reverse,
          i = -1,
          n,
          ticks,
          step;

      stop = +stop, start = +start, count = +count;
      if (start === stop && count > 0) return [start];
      if (reverse = stop < start) n = start, start = stop, stop = n;
      if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

      if (step > 0) {
        let r0 = Math.round(start / step), r1 = Math.round(stop / step);
        if (r0 * step < start) ++r0;
        if (r1 * step > stop) --r1;
        ticks = new Array(n = r1 - r0 + 1);
        while (++i < n) ticks[i] = (r0 + i) * step;
      } else {
        step = -step;
        let r0 = Math.round(start * step), r1 = Math.round(stop * step);
        if (r0 / step < start) ++r0;
        if (r1 / step > stop) --r1;
        ticks = new Array(n = r1 - r0 + 1);
        while (++i < n) ticks[i] = (r0 + i) / step;
      }

      if (reverse) ticks.reverse();

      return ticks;
    }

    function tickIncrement(start, stop, count) {
      var step = (stop - start) / Math.max(0, count),
          power = Math.floor(Math.log(step) / Math.LN10),
          error = step / Math.pow(10, power);
      return power >= 0
          ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
          : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
    }

    function tickStep(start, stop, count) {
      var step0 = Math.abs(stop - start) / Math.max(0, count),
          step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
          error = step0 / step1;
      if (error >= e10) step1 *= 10;
      else if (error >= e5) step1 *= 5;
      else if (error >= e2) step1 *= 2;
      return stop < start ? -step1 : step1;
    }

    function max(values, valueof) {
      let max;
      if (valueof === undefined) {
        for (const value of values) {
          if (value != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      } else {
        let index = -1;
        for (let value of values) {
          if ((value = valueof(value, ++index, values)) != null
              && (max < value || (max === undefined && value >= value))) {
            max = value;
          }
        }
      }
      return max;
    }

    function initRange(domain, range) {
      switch (arguments.length) {
        case 0: break;
        case 1: this.range(domain); break;
        default: this.range(range).domain(domain); break;
      }
      return this;
    }

    function define(constructor, factory, prototype) {
      constructor.prototype = factory.prototype = prototype;
      prototype.constructor = constructor;
    }

    function extend(parent, definition) {
      var prototype = Object.create(parent.prototype);
      for (var key in definition) prototype[key] = definition[key];
      return prototype;
    }

    function Color() {}

    var darker = 0.7;
    var brighter = 1 / darker;

    var reI = "\\s*([+-]?\\d+)\\s*",
        reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
        reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
        reHex = /^#([0-9a-f]{3,8})$/,
        reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
        reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
        reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
        reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
        reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
        reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

    var named = {
      aliceblue: 0xf0f8ff,
      antiquewhite: 0xfaebd7,
      aqua: 0x00ffff,
      aquamarine: 0x7fffd4,
      azure: 0xf0ffff,
      beige: 0xf5f5dc,
      bisque: 0xffe4c4,
      black: 0x000000,
      blanchedalmond: 0xffebcd,
      blue: 0x0000ff,
      blueviolet: 0x8a2be2,
      brown: 0xa52a2a,
      burlywood: 0xdeb887,
      cadetblue: 0x5f9ea0,
      chartreuse: 0x7fff00,
      chocolate: 0xd2691e,
      coral: 0xff7f50,
      cornflowerblue: 0x6495ed,
      cornsilk: 0xfff8dc,
      crimson: 0xdc143c,
      cyan: 0x00ffff,
      darkblue: 0x00008b,
      darkcyan: 0x008b8b,
      darkgoldenrod: 0xb8860b,
      darkgray: 0xa9a9a9,
      darkgreen: 0x006400,
      darkgrey: 0xa9a9a9,
      darkkhaki: 0xbdb76b,
      darkmagenta: 0x8b008b,
      darkolivegreen: 0x556b2f,
      darkorange: 0xff8c00,
      darkorchid: 0x9932cc,
      darkred: 0x8b0000,
      darksalmon: 0xe9967a,
      darkseagreen: 0x8fbc8f,
      darkslateblue: 0x483d8b,
      darkslategray: 0x2f4f4f,
      darkslategrey: 0x2f4f4f,
      darkturquoise: 0x00ced1,
      darkviolet: 0x9400d3,
      deeppink: 0xff1493,
      deepskyblue: 0x00bfff,
      dimgray: 0x696969,
      dimgrey: 0x696969,
      dodgerblue: 0x1e90ff,
      firebrick: 0xb22222,
      floralwhite: 0xfffaf0,
      forestgreen: 0x228b22,
      fuchsia: 0xff00ff,
      gainsboro: 0xdcdcdc,
      ghostwhite: 0xf8f8ff,
      gold: 0xffd700,
      goldenrod: 0xdaa520,
      gray: 0x808080,
      green: 0x008000,
      greenyellow: 0xadff2f,
      grey: 0x808080,
      honeydew: 0xf0fff0,
      hotpink: 0xff69b4,
      indianred: 0xcd5c5c,
      indigo: 0x4b0082,
      ivory: 0xfffff0,
      khaki: 0xf0e68c,
      lavender: 0xe6e6fa,
      lavenderblush: 0xfff0f5,
      lawngreen: 0x7cfc00,
      lemonchiffon: 0xfffacd,
      lightblue: 0xadd8e6,
      lightcoral: 0xf08080,
      lightcyan: 0xe0ffff,
      lightgoldenrodyellow: 0xfafad2,
      lightgray: 0xd3d3d3,
      lightgreen: 0x90ee90,
      lightgrey: 0xd3d3d3,
      lightpink: 0xffb6c1,
      lightsalmon: 0xffa07a,
      lightseagreen: 0x20b2aa,
      lightskyblue: 0x87cefa,
      lightslategray: 0x778899,
      lightslategrey: 0x778899,
      lightsteelblue: 0xb0c4de,
      lightyellow: 0xffffe0,
      lime: 0x00ff00,
      limegreen: 0x32cd32,
      linen: 0xfaf0e6,
      magenta: 0xff00ff,
      maroon: 0x800000,
      mediumaquamarine: 0x66cdaa,
      mediumblue: 0x0000cd,
      mediumorchid: 0xba55d3,
      mediumpurple: 0x9370db,
      mediumseagreen: 0x3cb371,
      mediumslateblue: 0x7b68ee,
      mediumspringgreen: 0x00fa9a,
      mediumturquoise: 0x48d1cc,
      mediumvioletred: 0xc71585,
      midnightblue: 0x191970,
      mintcream: 0xf5fffa,
      mistyrose: 0xffe4e1,
      moccasin: 0xffe4b5,
      navajowhite: 0xffdead,
      navy: 0x000080,
      oldlace: 0xfdf5e6,
      olive: 0x808000,
      olivedrab: 0x6b8e23,
      orange: 0xffa500,
      orangered: 0xff4500,
      orchid: 0xda70d6,
      palegoldenrod: 0xeee8aa,
      palegreen: 0x98fb98,
      paleturquoise: 0xafeeee,
      palevioletred: 0xdb7093,
      papayawhip: 0xffefd5,
      peachpuff: 0xffdab9,
      peru: 0xcd853f,
      pink: 0xffc0cb,
      plum: 0xdda0dd,
      powderblue: 0xb0e0e6,
      purple: 0x800080,
      rebeccapurple: 0x663399,
      red: 0xff0000,
      rosybrown: 0xbc8f8f,
      royalblue: 0x4169e1,
      saddlebrown: 0x8b4513,
      salmon: 0xfa8072,
      sandybrown: 0xf4a460,
      seagreen: 0x2e8b57,
      seashell: 0xfff5ee,
      sienna: 0xa0522d,
      silver: 0xc0c0c0,
      skyblue: 0x87ceeb,
      slateblue: 0x6a5acd,
      slategray: 0x708090,
      slategrey: 0x708090,
      snow: 0xfffafa,
      springgreen: 0x00ff7f,
      steelblue: 0x4682b4,
      tan: 0xd2b48c,
      teal: 0x008080,
      thistle: 0xd8bfd8,
      tomato: 0xff6347,
      turquoise: 0x40e0d0,
      violet: 0xee82ee,
      wheat: 0xf5deb3,
      white: 0xffffff,
      whitesmoke: 0xf5f5f5,
      yellow: 0xffff00,
      yellowgreen: 0x9acd32
    };

    define(Color, color, {
      copy: function(channels) {
        return Object.assign(new this.constructor, this, channels);
      },
      displayable: function() {
        return this.rgb().displayable();
      },
      hex: color_formatHex, // Deprecated! Use color.formatHex.
      formatHex: color_formatHex,
      formatHsl: color_formatHsl,
      formatRgb: color_formatRgb,
      toString: color_formatRgb
    });

    function color_formatHex() {
      return this.rgb().formatHex();
    }

    function color_formatHsl() {
      return hslConvert(this).formatHsl();
    }

    function color_formatRgb() {
      return this.rgb().formatRgb();
    }

    function color(format) {
      var m, l;
      format = (format + "").trim().toLowerCase();
      return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
          : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
          : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
          : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
          : null) // invalid hex
          : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
          : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
          : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
          : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
          : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
          : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
          : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
          : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
          : null;
    }

    function rgbn(n) {
      return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
    }

    function rgba(r, g, b, a) {
      if (a <= 0) r = g = b = NaN;
      return new Rgb(r, g, b, a);
    }

    function rgbConvert(o) {
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Rgb;
      o = o.rgb();
      return new Rgb(o.r, o.g, o.b, o.opacity);
    }

    function rgb$1(r, g, b, opacity) {
      return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
    }

    function Rgb(r, g, b, opacity) {
      this.r = +r;
      this.g = +g;
      this.b = +b;
      this.opacity = +opacity;
    }

    define(Rgb, rgb$1, extend(Color, {
      brighter: function(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      darker: function(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      rgb: function() {
        return this;
      },
      displayable: function() {
        return (-0.5 <= this.r && this.r < 255.5)
            && (-0.5 <= this.g && this.g < 255.5)
            && (-0.5 <= this.b && this.b < 255.5)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      hex: rgb_formatHex, // Deprecated! Use color.formatHex.
      formatHex: rgb_formatHex,
      formatRgb: rgb_formatRgb,
      toString: rgb_formatRgb
    }));

    function rgb_formatHex() {
      return "#" + hex(this.r) + hex(this.g) + hex(this.b);
    }

    function rgb_formatRgb() {
      var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
      return (a === 1 ? "rgb(" : "rgba(")
          + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
          + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
          + Math.max(0, Math.min(255, Math.round(this.b) || 0))
          + (a === 1 ? ")" : ", " + a + ")");
    }

    function hex(value) {
      value = Math.max(0, Math.min(255, Math.round(value) || 0));
      return (value < 16 ? "0" : "") + value.toString(16);
    }

    function hsla(h, s, l, a) {
      if (a <= 0) h = s = l = NaN;
      else if (l <= 0 || l >= 1) h = s = NaN;
      else if (s <= 0) h = NaN;
      return new Hsl(h, s, l, a);
    }

    function hslConvert(o) {
      if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Hsl;
      if (o instanceof Hsl) return o;
      o = o.rgb();
      var r = o.r / 255,
          g = o.g / 255,
          b = o.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          h = NaN,
          s = max - min,
          l = (max + min) / 2;
      if (s) {
        if (r === max) h = (g - b) / s + (g < b) * 6;
        else if (g === max) h = (b - r) / s + 2;
        else h = (r - g) / s + 4;
        s /= l < 0.5 ? max + min : 2 - max - min;
        h *= 60;
      } else {
        s = l > 0 && l < 1 ? 0 : h;
      }
      return new Hsl(h, s, l, o.opacity);
    }

    function hsl(h, s, l, opacity) {
      return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
    }

    function Hsl(h, s, l, opacity) {
      this.h = +h;
      this.s = +s;
      this.l = +l;
      this.opacity = +opacity;
    }

    define(Hsl, hsl, extend(Color, {
      brighter: function(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      darker: function(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      rgb: function() {
        var h = this.h % 360 + (this.h < 0) * 360,
            s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
            l = this.l,
            m2 = l + (l < 0.5 ? l : 1 - l) * s,
            m1 = 2 * l - m2;
        return new Rgb(
          hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
          hsl2rgb(h, m1, m2),
          hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
          this.opacity
        );
      },
      displayable: function() {
        return (0 <= this.s && this.s <= 1 || isNaN(this.s))
            && (0 <= this.l && this.l <= 1)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      formatHsl: function() {
        var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
        return (a === 1 ? "hsl(" : "hsla(")
            + (this.h || 0) + ", "
            + (this.s || 0) * 100 + "%, "
            + (this.l || 0) * 100 + "%"
            + (a === 1 ? ")" : ", " + a + ")");
      }
    }));

    /* From FvD 13.37, CSS Color Module Level 3 */
    function hsl2rgb(h, m1, m2) {
      return (h < 60 ? m1 + (m2 - m1) * h / 60
          : h < 180 ? m2
          : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
          : m1) * 255;
    }

    var constant = x => () => x;

    function linear(a, d) {
      return function(t) {
        return a + t * d;
      };
    }

    function exponential(a, b, y) {
      return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
        return Math.pow(a + t * b, y);
      };
    }

    function gamma(y) {
      return (y = +y) === 1 ? nogamma : function(a, b) {
        return b - a ? exponential(a, b, y) : constant(isNaN(a) ? b : a);
      };
    }

    function nogamma(a, b) {
      var d = b - a;
      return d ? linear(a, d) : constant(isNaN(a) ? b : a);
    }

    var rgb = (function rgbGamma(y) {
      var color = gamma(y);

      function rgb(start, end) {
        var r = color((start = rgb$1(start)).r, (end = rgb$1(end)).r),
            g = color(start.g, end.g),
            b = color(start.b, end.b),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.r = r(t);
          start.g = g(t);
          start.b = b(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }

      rgb.gamma = rgbGamma;

      return rgb;
    })(1);

    function numberArray(a, b) {
      if (!b) b = [];
      var n = a ? Math.min(b.length, a.length) : 0,
          c = b.slice(),
          i;
      return function(t) {
        for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
        return c;
      };
    }

    function isNumberArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }

    function genericArray(a, b) {
      var nb = b ? b.length : 0,
          na = a ? Math.min(nb, a.length) : 0,
          x = new Array(na),
          c = new Array(nb),
          i;

      for (i = 0; i < na; ++i) x[i] = interpolate(a[i], b[i]);
      for (; i < nb; ++i) c[i] = b[i];

      return function(t) {
        for (i = 0; i < na; ++i) c[i] = x[i](t);
        return c;
      };
    }

    function date(a, b) {
      var d = new Date;
      return a = +a, b = +b, function(t) {
        return d.setTime(a * (1 - t) + b * t), d;
      };
    }

    function interpolateNumber(a, b) {
      return a = +a, b = +b, function(t) {
        return a * (1 - t) + b * t;
      };
    }

    function object(a, b) {
      var i = {},
          c = {},
          k;

      if (a === null || typeof a !== "object") a = {};
      if (b === null || typeof b !== "object") b = {};

      for (k in b) {
        if (k in a) {
          i[k] = interpolate(a[k], b[k]);
        } else {
          c[k] = b[k];
        }
      }

      return function(t) {
        for (k in i) c[k] = i[k](t);
        return c;
      };
    }

    var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
        reB = new RegExp(reA.source, "g");

    function zero(b) {
      return function() {
        return b;
      };
    }

    function one(b) {
      return function(t) {
        return b(t) + "";
      };
    }

    function string(a, b) {
      var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
          am, // current match in a
          bm, // current match in b
          bs, // string preceding current number in b, if any
          i = -1, // index in s
          s = [], // string constants and placeholders
          q = []; // number interpolators

      // Coerce inputs to strings.
      a = a + "", b = b + "";

      // Interpolate pairs of numbers in a & b.
      while ((am = reA.exec(a))
          && (bm = reB.exec(b))) {
        if ((bs = bm.index) > bi) { // a string precedes the next number in b
          bs = b.slice(bi, bs);
          if (s[i]) s[i] += bs; // coalesce with previous string
          else s[++i] = bs;
        }
        if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
          if (s[i]) s[i] += bm; // coalesce with previous string
          else s[++i] = bm;
        } else { // interpolate non-matching numbers
          s[++i] = null;
          q.push({i: i, x: interpolateNumber(am, bm)});
        }
        bi = reB.lastIndex;
      }

      // Add remains of b.
      if (bi < b.length) {
        bs = b.slice(bi);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      }

      // Special optimization for only a single match.
      // Otherwise, interpolate each of the numbers and rejoin the string.
      return s.length < 2 ? (q[0]
          ? one(q[0].x)
          : zero(b))
          : (b = q.length, function(t) {
              for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
              return s.join("");
            });
    }

    function interpolate(a, b) {
      var t = typeof b, c;
      return b == null || t === "boolean" ? constant(b)
          : (t === "number" ? interpolateNumber
          : t === "string" ? ((c = color(b)) ? (b = c, rgb) : string)
          : b instanceof color ? rgb
          : b instanceof Date ? date
          : isNumberArray(b) ? numberArray
          : Array.isArray(b) ? genericArray
          : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
          : interpolateNumber)(a, b);
    }

    function interpolateRound(a, b) {
      return a = +a, b = +b, function(t) {
        return Math.round(a * (1 - t) + b * t);
      };
    }

    function constants(x) {
      return function() {
        return x;
      };
    }

    function number(x) {
      return +x;
    }

    var unit = [0, 1];

    function identity$1(x) {
      return x;
    }

    function normalize(a, b) {
      return (b -= (a = +a))
          ? function(x) { return (x - a) / b; }
          : constants(isNaN(b) ? NaN : 0.5);
    }

    function clamper(a, b) {
      var t;
      if (a > b) t = a, a = b, b = t;
      return function(x) { return Math.max(a, Math.min(b, x)); };
    }

    // normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
    // interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
    function bimap(domain, range, interpolate) {
      var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
      if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);
      else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
      return function(x) { return r0(d0(x)); };
    }

    function polymap(domain, range, interpolate) {
      var j = Math.min(domain.length, range.length) - 1,
          d = new Array(j),
          r = new Array(j),
          i = -1;

      // Reverse descending domains.
      if (domain[j] < domain[0]) {
        domain = domain.slice().reverse();
        range = range.slice().reverse();
      }

      while (++i < j) {
        d[i] = normalize(domain[i], domain[i + 1]);
        r[i] = interpolate(range[i], range[i + 1]);
      }

      return function(x) {
        var i = bisect(domain, x, 1, j) - 1;
        return r[i](d[i](x));
      };
    }

    function copy(source, target) {
      return target
          .domain(source.domain())
          .range(source.range())
          .interpolate(source.interpolate())
          .clamp(source.clamp())
          .unknown(source.unknown());
    }

    function transformer() {
      var domain = unit,
          range = unit,
          interpolate$1 = interpolate,
          transform,
          untransform,
          unknown,
          clamp = identity$1,
          piecewise,
          output,
          input;

      function rescale() {
        var n = Math.min(domain.length, range.length);
        if (clamp !== identity$1) clamp = clamper(domain[0], domain[n - 1]);
        piecewise = n > 2 ? polymap : bimap;
        output = input = null;
        return scale;
      }

      function scale(x) {
        return x == null || isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate$1)))(transform(clamp(x)));
      }

      scale.invert = function(y) {
        return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
      };

      scale.domain = function(_) {
        return arguments.length ? (domain = Array.from(_, number), rescale()) : domain.slice();
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), rescale()) : range.slice();
      };

      scale.rangeRound = function(_) {
        return range = Array.from(_), interpolate$1 = interpolateRound, rescale();
      };

      scale.clamp = function(_) {
        return arguments.length ? (clamp = _ ? true : identity$1, rescale()) : clamp !== identity$1;
      };

      scale.interpolate = function(_) {
        return arguments.length ? (interpolate$1 = _, rescale()) : interpolate$1;
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      return function(t, u) {
        transform = t, untransform = u;
        return rescale();
      };
    }

    function formatDecimal(x) {
      return Math.abs(x = Math.round(x)) >= 1e21
          ? x.toLocaleString("en").replace(/,/g, "")
          : x.toString(10);
    }

    // Computes the decimal coefficient and exponent of the specified number x with
    // significant digits p, where x is positive and p is in [1, 21] or undefined.
    // For example, formatDecimalParts(1.23) returns ["123", 0].
    function formatDecimalParts(x, p) {
      if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
      var i, coefficient = x.slice(0, i);

      // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
      // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
      return [
        coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
        +x.slice(i + 1)
      ];
    }

    function exponent(x) {
      return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
    }

    function formatGroup(grouping, thousands) {
      return function(value, width) {
        var i = value.length,
            t = [],
            j = 0,
            g = grouping[0],
            length = 0;

        while (i > 0 && g > 0) {
          if (length + g + 1 > width) g = Math.max(1, width - length);
          t.push(value.substring(i -= g, i + g));
          if ((length += g + 1) > width) break;
          g = grouping[j = (j + 1) % grouping.length];
        }

        return t.reverse().join(thousands);
      };
    }

    function formatNumerals(numerals) {
      return function(value) {
        return value.replace(/[0-9]/g, function(i) {
          return numerals[+i];
        });
      };
    }

    // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
    var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

    function formatSpecifier(specifier) {
      if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
      var match;
      return new FormatSpecifier({
        fill: match[1],
        align: match[2],
        sign: match[3],
        symbol: match[4],
        zero: match[5],
        width: match[6],
        comma: match[7],
        precision: match[8] && match[8].slice(1),
        trim: match[9],
        type: match[10]
      });
    }

    formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

    function FormatSpecifier(specifier) {
      this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
      this.align = specifier.align === undefined ? ">" : specifier.align + "";
      this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
      this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
      this.zero = !!specifier.zero;
      this.width = specifier.width === undefined ? undefined : +specifier.width;
      this.comma = !!specifier.comma;
      this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
      this.trim = !!specifier.trim;
      this.type = specifier.type === undefined ? "" : specifier.type + "";
    }

    FormatSpecifier.prototype.toString = function() {
      return this.fill
          + this.align
          + this.sign
          + this.symbol
          + (this.zero ? "0" : "")
          + (this.width === undefined ? "" : Math.max(1, this.width | 0))
          + (this.comma ? "," : "")
          + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
          + (this.trim ? "~" : "")
          + this.type;
    };

    // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
    function formatTrim(s) {
      out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
        switch (s[i]) {
          case ".": i0 = i1 = i; break;
          case "0": if (i0 === 0) i0 = i; i1 = i; break;
          default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
        }
      }
      return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    var prefixExponent;

    function formatPrefixAuto(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1],
          i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
          n = coefficient.length;
      return i === n ? coefficient
          : i > n ? coefficient + new Array(i - n + 1).join("0")
          : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
          : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
    }

    function formatRounded(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1];
      return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
          : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
          : coefficient + new Array(exponent - coefficient.length + 2).join("0");
    }

    var formatTypes = {
      "%": (x, p) => (x * 100).toFixed(p),
      "b": (x) => Math.round(x).toString(2),
      "c": (x) => x + "",
      "d": formatDecimal,
      "e": (x, p) => x.toExponential(p),
      "f": (x, p) => x.toFixed(p),
      "g": (x, p) => x.toPrecision(p),
      "o": (x) => Math.round(x).toString(8),
      "p": (x, p) => formatRounded(x * 100, p),
      "r": formatRounded,
      "s": formatPrefixAuto,
      "X": (x) => Math.round(x).toString(16).toUpperCase(),
      "x": (x) => Math.round(x).toString(16)
    };

    function identity(x) {
      return x;
    }

    var map$1 = Array.prototype.map,
        prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

    function formatLocale(locale) {
      var group = locale.grouping === undefined || locale.thousands === undefined ? identity : formatGroup(map$1.call(locale.grouping, Number), locale.thousands + ""),
          currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
          currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
          decimal = locale.decimal === undefined ? "." : locale.decimal + "",
          numerals = locale.numerals === undefined ? identity : formatNumerals(map$1.call(locale.numerals, String)),
          percent = locale.percent === undefined ? "%" : locale.percent + "",
          minus = locale.minus === undefined ? "−" : locale.minus + "",
          nan = locale.nan === undefined ? "NaN" : locale.nan + "";

      function newFormat(specifier) {
        specifier = formatSpecifier(specifier);

        var fill = specifier.fill,
            align = specifier.align,
            sign = specifier.sign,
            symbol = specifier.symbol,
            zero = specifier.zero,
            width = specifier.width,
            comma = specifier.comma,
            precision = specifier.precision,
            trim = specifier.trim,
            type = specifier.type;

        // The "n" type is an alias for ",g".
        if (type === "n") comma = true, type = "g";

        // The "" type, and any invalid type, is an alias for ".12~g".
        else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

        // If zero fill is specified, padding goes after sign and before digits.
        if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

        // Compute the prefix and suffix.
        // For SI-prefix, the suffix is lazily computed.
        var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
            suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

        // What format function should we use?
        // Is this an integer type?
        // Can this type generate exponential notation?
        var formatType = formatTypes[type],
            maybeSuffix = /[defgprs%]/.test(type);

        // Set the default precision if not specified,
        // or clamp the specified precision to the supported range.
        // For significant precision, it must be in [1, 21].
        // For fixed precision, it must be in [0, 20].
        precision = precision === undefined ? 6
            : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
            : Math.max(0, Math.min(20, precision));

        function format(value) {
          var valuePrefix = prefix,
              valueSuffix = suffix,
              i, n, c;

          if (type === "c") {
            valueSuffix = formatType(value) + valueSuffix;
            value = "";
          } else {
            value = +value;

            // Determine the sign. -0 is not less than 0, but 1 / -0 is!
            var valueNegative = value < 0 || 1 / value < 0;

            // Perform the initial formatting.
            value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

            // Trim insignificant zeros.
            if (trim) value = formatTrim(value);

            // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.
            if (valueNegative && +value === 0 && sign !== "+") valueNegative = false;

            // Compute the prefix and suffix.
            valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
            valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

            // Break the formatted value into the integer “value” part that can be
            // grouped, and fractional or exponential “suffix” part that is not.
            if (maybeSuffix) {
              i = -1, n = value.length;
              while (++i < n) {
                if (c = value.charCodeAt(i), 48 > c || c > 57) {
                  valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                  value = value.slice(0, i);
                  break;
                }
              }
            }
          }

          // If the fill character is not "0", grouping is applied before padding.
          if (comma && !zero) value = group(value, Infinity);

          // Compute the padding.
          var length = valuePrefix.length + value.length + valueSuffix.length,
              padding = length < width ? new Array(width - length + 1).join(fill) : "";

          // If the fill character is "0", grouping is applied after padding.
          if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

          // Reconstruct the final output based on the desired alignment.
          switch (align) {
            case "<": value = valuePrefix + value + valueSuffix + padding; break;
            case "=": value = valuePrefix + padding + value + valueSuffix; break;
            case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
            default: value = padding + valuePrefix + value + valueSuffix; break;
          }

          return numerals(value);
        }

        format.toString = function() {
          return specifier + "";
        };

        return format;
      }

      function formatPrefix(specifier, value) {
        var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
            e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
            k = Math.pow(10, -e),
            prefix = prefixes[8 + e / 3];
        return function(value) {
          return f(k * value) + prefix;
        };
      }

      return {
        format: newFormat,
        formatPrefix: formatPrefix
      };
    }

    var locale;
    var format$1;
    var formatPrefix;

    defaultLocale({
      thousands: ",",
      grouping: [3],
      currency: ["$", ""]
    });

    function defaultLocale(definition) {
      locale = formatLocale(definition);
      format$1 = locale.format;
      formatPrefix = locale.formatPrefix;
      return locale;
    }

    function precisionFixed(step) {
      return Math.max(0, -exponent(Math.abs(step)));
    }

    function precisionPrefix(step, value) {
      return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
    }

    function precisionRound(step, max) {
      step = Math.abs(step), max = Math.abs(max) - step;
      return Math.max(0, exponent(max) - exponent(step)) + 1;
    }

    function tickFormat(start, stop, count, specifier) {
      var step = tickStep(start, stop, count),
          precision;
      specifier = formatSpecifier(specifier == null ? ",f" : specifier);
      switch (specifier.type) {
        case "s": {
          var value = Math.max(Math.abs(start), Math.abs(stop));
          if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
          return formatPrefix(specifier, value);
        }
        case "":
        case "e":
        case "g":
        case "p":
        case "r": {
          if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
          break;
        }
        case "f":
        case "%": {
          if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
          break;
        }
      }
      return format$1(specifier);
    }

    function linearish(scale) {
      var domain = scale.domain;

      scale.ticks = function(count) {
        var d = domain();
        return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
      };

      scale.tickFormat = function(count, specifier) {
        var d = domain();
        return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
      };

      scale.nice = function(count) {
        if (count == null) count = 10;

        var d = domain();
        var i0 = 0;
        var i1 = d.length - 1;
        var start = d[i0];
        var stop = d[i1];
        var prestep;
        var step;
        var maxIter = 10;

        if (stop < start) {
          step = start, start = stop, stop = step;
          step = i0, i0 = i1, i1 = step;
        }
        
        while (maxIter-- > 0) {
          step = tickIncrement(start, stop, count);
          if (step === prestep) {
            d[i0] = start;
            d[i1] = stop;
            return domain(d);
          } else if (step > 0) {
            start = Math.floor(start / step) * step;
            stop = Math.ceil(stop / step) * step;
          } else if (step < 0) {
            start = Math.ceil(start * step) / step;
            stop = Math.floor(stop * step) / step;
          } else {
            break;
          }
          prestep = step;
        }

        return scale;
      };

      return scale;
    }

    function transformPow(exponent) {
      return function(x) {
        return x < 0 ? -Math.pow(-x, exponent) : Math.pow(x, exponent);
      };
    }

    function transformSqrt(x) {
      return x < 0 ? -Math.sqrt(-x) : Math.sqrt(x);
    }

    function transformSquare(x) {
      return x < 0 ? -x * x : x * x;
    }

    function powish(transform) {
      var scale = transform(identity$1, identity$1),
          exponent = 1;

      function rescale() {
        return exponent === 1 ? transform(identity$1, identity$1)
            : exponent === 0.5 ? transform(transformSqrt, transformSquare)
            : transform(transformPow(exponent), transformPow(1 / exponent));
      }

      scale.exponent = function(_) {
        return arguments.length ? (exponent = +_, rescale()) : exponent;
      };

      return linearish(scale);
    }

    function pow() {
      var scale = powish(transformer());

      scale.copy = function() {
        return copy(scale, pow()).exponent(scale.exponent());
      };

      initRange.apply(scale, arguments);

      return scale;
    }

    function sqrt() {
      return pow.apply(null, arguments).exponent(0.5);
    }

    function getDefaultExportFromCjs (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    var dist = {};

    var adaptor$1 = {};

    var layout = {};

    var powergraph = {};

    Object.defineProperty(powergraph, "__esModule", { value: true });
    var PowerEdge = (function () {
        function PowerEdge(source, target, type) {
            this.source = source;
            this.target = target;
            this.type = type;
        }
        return PowerEdge;
    }());
    powergraph.PowerEdge = PowerEdge;
    var Configuration = (function () {
        function Configuration(n, edges, linkAccessor, rootGroup) {
            var _this = this;
            this.linkAccessor = linkAccessor;
            this.modules = new Array(n);
            this.roots = [];
            if (rootGroup) {
                this.initModulesFromGroup(rootGroup);
            }
            else {
                this.roots.push(new ModuleSet());
                for (var i = 0; i < n; ++i)
                    this.roots[0].add(this.modules[i] = new Module(i));
            }
            this.R = edges.length;
            edges.forEach(function (e) {
                var s = _this.modules[linkAccessor.getSourceIndex(e)], t = _this.modules[linkAccessor.getTargetIndex(e)], type = linkAccessor.getType(e);
                s.outgoing.add(type, t);
                t.incoming.add(type, s);
            });
        }
        Configuration.prototype.initModulesFromGroup = function (group) {
            var moduleSet = new ModuleSet();
            this.roots.push(moduleSet);
            for (var i = 0; i < group.leaves.length; ++i) {
                var node = group.leaves[i];
                var module = new Module(node.id);
                this.modules[node.id] = module;
                moduleSet.add(module);
            }
            if (group.groups) {
                for (var j = 0; j < group.groups.length; ++j) {
                    var child = group.groups[j];
                    var definition = {};
                    for (var prop in child)
                        if (prop !== "leaves" && prop !== "groups" && child.hasOwnProperty(prop))
                            definition[prop] = child[prop];
                    moduleSet.add(new Module(-1 - j, new LinkSets(), new LinkSets(), this.initModulesFromGroup(child), definition));
                }
            }
            return moduleSet;
        };
        Configuration.prototype.merge = function (a, b, k) {
            if (k === void 0) { k = 0; }
            var inInt = a.incoming.intersection(b.incoming), outInt = a.outgoing.intersection(b.outgoing);
            var children = new ModuleSet();
            children.add(a);
            children.add(b);
            var m = new Module(this.modules.length, outInt, inInt, children);
            this.modules.push(m);
            var update = function (s, i, o) {
                s.forAll(function (ms, linktype) {
                    ms.forAll(function (n) {
                        var nls = n[i];
                        nls.add(linktype, m);
                        nls.remove(linktype, a);
                        nls.remove(linktype, b);
                        a[o].remove(linktype, n);
                        b[o].remove(linktype, n);
                    });
                });
            };
            update(outInt, "incoming", "outgoing");
            update(inInt, "outgoing", "incoming");
            this.R -= inInt.count() + outInt.count();
            this.roots[k].remove(a);
            this.roots[k].remove(b);
            this.roots[k].add(m);
            return m;
        };
        Configuration.prototype.rootMerges = function (k) {
            if (k === void 0) { k = 0; }
            var rs = this.roots[k].modules();
            var n = rs.length;
            var merges = new Array(n * (n - 1));
            var ctr = 0;
            for (var i = 0, i_ = n - 1; i < i_; ++i) {
                for (var j = i + 1; j < n; ++j) {
                    var a = rs[i], b = rs[j];
                    merges[ctr] = { id: ctr, nEdges: this.nEdges(a, b), a: a, b: b };
                    ctr++;
                }
            }
            return merges;
        };
        Configuration.prototype.greedyMerge = function () {
            for (var i = 0; i < this.roots.length; ++i) {
                if (this.roots[i].modules().length < 2)
                    continue;
                var ms = this.rootMerges(i).sort(function (a, b) { return a.nEdges == b.nEdges ? a.id - b.id : a.nEdges - b.nEdges; });
                var m = ms[0];
                if (m.nEdges >= this.R)
                    continue;
                this.merge(m.a, m.b, i);
                return true;
            }
        };
        Configuration.prototype.nEdges = function (a, b) {
            var inInt = a.incoming.intersection(b.incoming), outInt = a.outgoing.intersection(b.outgoing);
            return this.R - inInt.count() - outInt.count();
        };
        Configuration.prototype.getGroupHierarchy = function (retargetedEdges) {
            var _this = this;
            var groups = [];
            var root = {};
            toGroups(this.roots[0], root, groups);
            var es = this.allEdges();
            es.forEach(function (e) {
                var a = _this.modules[e.source];
                var b = _this.modules[e.target];
                retargetedEdges.push(new PowerEdge(typeof a.gid === "undefined" ? e.source : groups[a.gid], typeof b.gid === "undefined" ? e.target : groups[b.gid], e.type));
            });
            return groups;
        };
        Configuration.prototype.allEdges = function () {
            var es = [];
            Configuration.getEdges(this.roots[0], es);
            return es;
        };
        Configuration.getEdges = function (modules, es) {
            modules.forAll(function (m) {
                m.getEdges(es);
                Configuration.getEdges(m.children, es);
            });
        };
        return Configuration;
    }());
    powergraph.Configuration = Configuration;
    function toGroups(modules, group, groups) {
        modules.forAll(function (m) {
            if (m.isLeaf()) {
                if (!group.leaves)
                    group.leaves = [];
                group.leaves.push(m.id);
            }
            else {
                var g = group;
                m.gid = groups.length;
                if (!m.isIsland() || m.isPredefined()) {
                    g = { id: m.gid };
                    if (m.isPredefined())
                        for (var prop in m.definition)
                            g[prop] = m.definition[prop];
                    if (!group.groups)
                        group.groups = [];
                    group.groups.push(m.gid);
                    groups.push(g);
                }
                toGroups(m.children, g, groups);
            }
        });
    }
    var Module = (function () {
        function Module(id, outgoing, incoming, children, definition) {
            if (outgoing === void 0) { outgoing = new LinkSets(); }
            if (incoming === void 0) { incoming = new LinkSets(); }
            if (children === void 0) { children = new ModuleSet(); }
            this.id = id;
            this.outgoing = outgoing;
            this.incoming = incoming;
            this.children = children;
            this.definition = definition;
        }
        Module.prototype.getEdges = function (es) {
            var _this = this;
            this.outgoing.forAll(function (ms, edgetype) {
                ms.forAll(function (target) {
                    es.push(new PowerEdge(_this.id, target.id, edgetype));
                });
            });
        };
        Module.prototype.isLeaf = function () {
            return this.children.count() === 0;
        };
        Module.prototype.isIsland = function () {
            return this.outgoing.count() === 0 && this.incoming.count() === 0;
        };
        Module.prototype.isPredefined = function () {
            return typeof this.definition !== "undefined";
        };
        return Module;
    }());
    powergraph.Module = Module;
    function intersection(m, n) {
        var i = {};
        for (var v in m)
            if (v in n)
                i[v] = m[v];
        return i;
    }
    var ModuleSet = (function () {
        function ModuleSet() {
            this.table = {};
        }
        ModuleSet.prototype.count = function () {
            return Object.keys(this.table).length;
        };
        ModuleSet.prototype.intersection = function (other) {
            var result = new ModuleSet();
            result.table = intersection(this.table, other.table);
            return result;
        };
        ModuleSet.prototype.intersectionCount = function (other) {
            return this.intersection(other).count();
        };
        ModuleSet.prototype.contains = function (id) {
            return id in this.table;
        };
        ModuleSet.prototype.add = function (m) {
            this.table[m.id] = m;
        };
        ModuleSet.prototype.remove = function (m) {
            delete this.table[m.id];
        };
        ModuleSet.prototype.forAll = function (f) {
            for (var mid in this.table) {
                f(this.table[mid]);
            }
        };
        ModuleSet.prototype.modules = function () {
            var vs = [];
            this.forAll(function (m) {
                if (!m.isPredefined())
                    vs.push(m);
            });
            return vs;
        };
        return ModuleSet;
    }());
    powergraph.ModuleSet = ModuleSet;
    var LinkSets = (function () {
        function LinkSets() {
            this.sets = {};
            this.n = 0;
        }
        LinkSets.prototype.count = function () {
            return this.n;
        };
        LinkSets.prototype.contains = function (id) {
            var result = false;
            this.forAllModules(function (m) {
                if (!result && m.id == id) {
                    result = true;
                }
            });
            return result;
        };
        LinkSets.prototype.add = function (linktype, m) {
            var s = linktype in this.sets ? this.sets[linktype] : this.sets[linktype] = new ModuleSet();
            s.add(m);
            ++this.n;
        };
        LinkSets.prototype.remove = function (linktype, m) {
            var ms = this.sets[linktype];
            ms.remove(m);
            if (ms.count() === 0) {
                delete this.sets[linktype];
            }
            --this.n;
        };
        LinkSets.prototype.forAll = function (f) {
            for (var linktype in this.sets) {
                f(this.sets[linktype], Number(linktype));
            }
        };
        LinkSets.prototype.forAllModules = function (f) {
            this.forAll(function (ms, lt) { return ms.forAll(f); });
        };
        LinkSets.prototype.intersection = function (other) {
            var result = new LinkSets();
            this.forAll(function (ms, lt) {
                if (lt in other.sets) {
                    var i = ms.intersection(other.sets[lt]), n = i.count();
                    if (n > 0) {
                        result.sets[lt] = i;
                        result.n += n;
                    }
                }
            });
            return result;
        };
        return LinkSets;
    }());
    powergraph.LinkSets = LinkSets;
    function getGroups(nodes, links, la, rootGroup) {
        var n = nodes.length, c = new Configuration(n, links, la, rootGroup);
        while (c.greedyMerge())
            ;
        var powerEdges = [];
        var g = c.getGroupHierarchy(powerEdges);
        powerEdges.forEach(function (e) {
            var f = function (end) {
                var g = e[end];
                if (typeof g == "number")
                    e[end] = nodes[g];
            };
            f("source");
            f("target");
        });
        return { groups: g, powerEdges: powerEdges };
    }
    powergraph.getGroups = getGroups;

    var linklengths = {};

    Object.defineProperty(linklengths, "__esModule", { value: true });
    function unionCount(a, b) {
        var u = {};
        for (var i in a)
            u[i] = {};
        for (var i in b)
            u[i] = {};
        return Object.keys(u).length;
    }
    function intersectionCount(a, b) {
        var n = 0;
        for (var i in a)
            if (typeof b[i] !== 'undefined')
                ++n;
        return n;
    }
    function getNeighbours(links, la) {
        var neighbours = {};
        var addNeighbours = function (u, v) {
            if (typeof neighbours[u] === 'undefined')
                neighbours[u] = {};
            neighbours[u][v] = {};
        };
        links.forEach(function (e) {
            var u = la.getSourceIndex(e), v = la.getTargetIndex(e);
            addNeighbours(u, v);
            addNeighbours(v, u);
        });
        return neighbours;
    }
    function computeLinkLengths(links, w, f, la) {
        var neighbours = getNeighbours(links, la);
        links.forEach(function (l) {
            var a = neighbours[la.getSourceIndex(l)];
            var b = neighbours[la.getTargetIndex(l)];
            la.setLength(l, 1 + w * f(a, b));
        });
    }
    function symmetricDiffLinkLengths(links, la, w) {
        if (w === void 0) { w = 1; }
        computeLinkLengths(links, w, function (a, b) { return Math.sqrt(unionCount(a, b) - intersectionCount(a, b)); }, la);
    }
    linklengths.symmetricDiffLinkLengths = symmetricDiffLinkLengths;
    function jaccardLinkLengths(links, la, w) {
        if (w === void 0) { w = 1; }
        computeLinkLengths(links, w, function (a, b) {
            return Math.min(Object.keys(a).length, Object.keys(b).length) < 1.1 ? 0 : intersectionCount(a, b) / unionCount(a, b);
        }, la);
    }
    linklengths.jaccardLinkLengths = jaccardLinkLengths;
    function generateDirectedEdgeConstraints(n, links, axis, la) {
        var components = stronglyConnectedComponents(n, links, la);
        var nodes = {};
        components.forEach(function (c, i) {
            return c.forEach(function (v) { return nodes[v] = i; });
        });
        var constraints = [];
        links.forEach(function (l) {
            var ui = la.getSourceIndex(l), vi = la.getTargetIndex(l), u = nodes[ui], v = nodes[vi];
            if (u !== v) {
                constraints.push({
                    axis: axis,
                    left: ui,
                    right: vi,
                    gap: la.getMinSeparation(l)
                });
            }
        });
        return constraints;
    }
    linklengths.generateDirectedEdgeConstraints = generateDirectedEdgeConstraints;
    function stronglyConnectedComponents(numVertices, edges, la) {
        var nodes = [];
        var index = 0;
        var stack = [];
        var components = [];
        function strongConnect(v) {
            v.index = v.lowlink = index++;
            stack.push(v);
            v.onStack = true;
            for (var _i = 0, _a = v.out; _i < _a.length; _i++) {
                var w = _a[_i];
                if (typeof w.index === 'undefined') {
                    strongConnect(w);
                    v.lowlink = Math.min(v.lowlink, w.lowlink);
                }
                else if (w.onStack) {
                    v.lowlink = Math.min(v.lowlink, w.index);
                }
            }
            if (v.lowlink === v.index) {
                var component = [];
                while (stack.length) {
                    w = stack.pop();
                    w.onStack = false;
                    component.push(w);
                    if (w === v)
                        break;
                }
                components.push(component.map(function (v) { return v.id; }));
            }
        }
        for (var i = 0; i < numVertices; i++) {
            nodes.push({ id: i, out: [] });
        }
        for (var _i = 0, edges_1 = edges; _i < edges_1.length; _i++) {
            var e = edges_1[_i];
            var v_1 = nodes[la.getSourceIndex(e)], w = nodes[la.getTargetIndex(e)];
            v_1.out.push(w);
        }
        for (var _a = 0, nodes_1 = nodes; _a < nodes_1.length; _a++) {
            var v = nodes_1[_a];
            if (typeof v.index === 'undefined')
                strongConnect(v);
        }
        return components;
    }
    linklengths.stronglyConnectedComponents = stronglyConnectedComponents;

    var descent = {};

    Object.defineProperty(descent, "__esModule", { value: true });
    var Locks = (function () {
        function Locks() {
            this.locks = {};
        }
        Locks.prototype.add = function (id, x) {
            this.locks[id] = x;
        };
        Locks.prototype.clear = function () {
            this.locks = {};
        };
        Locks.prototype.isEmpty = function () {
            for (var l in this.locks)
                return false;
            return true;
        };
        Locks.prototype.apply = function (f) {
            for (var l in this.locks) {
                f(Number(l), this.locks[l]);
            }
        };
        return Locks;
    }());
    descent.Locks = Locks;
    var Descent = (function () {
        function Descent(x, D, G) {
            if (G === void 0) { G = null; }
            this.D = D;
            this.G = G;
            this.threshold = 0.0001;
            this.numGridSnapNodes = 0;
            this.snapGridSize = 100;
            this.snapStrength = 1000;
            this.scaleSnapByMaxH = false;
            this.random = new PseudoRandom();
            this.project = null;
            this.x = x;
            this.k = x.length;
            var n = this.n = x[0].length;
            this.H = new Array(this.k);
            this.g = new Array(this.k);
            this.Hd = new Array(this.k);
            this.a = new Array(this.k);
            this.b = new Array(this.k);
            this.c = new Array(this.k);
            this.d = new Array(this.k);
            this.e = new Array(this.k);
            this.ia = new Array(this.k);
            this.ib = new Array(this.k);
            this.xtmp = new Array(this.k);
            this.locks = new Locks();
            this.minD = Number.MAX_VALUE;
            var i = n, j;
            while (i--) {
                j = n;
                while (--j > i) {
                    var d = D[i][j];
                    if (d > 0 && d < this.minD) {
                        this.minD = d;
                    }
                }
            }
            if (this.minD === Number.MAX_VALUE)
                this.minD = 1;
            i = this.k;
            while (i--) {
                this.g[i] = new Array(n);
                this.H[i] = new Array(n);
                j = n;
                while (j--) {
                    this.H[i][j] = new Array(n);
                }
                this.Hd[i] = new Array(n);
                this.a[i] = new Array(n);
                this.b[i] = new Array(n);
                this.c[i] = new Array(n);
                this.d[i] = new Array(n);
                this.e[i] = new Array(n);
                this.ia[i] = new Array(n);
                this.ib[i] = new Array(n);
                this.xtmp[i] = new Array(n);
            }
        }
        Descent.createSquareMatrix = function (n, f) {
            var M = new Array(n);
            for (var i = 0; i < n; ++i) {
                M[i] = new Array(n);
                for (var j = 0; j < n; ++j) {
                    M[i][j] = f(i, j);
                }
            }
            return M;
        };
        Descent.prototype.offsetDir = function () {
            var _this = this;
            var u = new Array(this.k);
            var l = 0;
            for (var i = 0; i < this.k; ++i) {
                var x = u[i] = this.random.getNextBetween(0.01, 1) - 0.5;
                l += x * x;
            }
            l = Math.sqrt(l);
            return u.map(function (x) { return x *= _this.minD / l; });
        };
        Descent.prototype.computeDerivatives = function (x) {
            var _this = this;
            var n = this.n;
            if (n < 1)
                return;
            var i;
            var d = new Array(this.k);
            var d2 = new Array(this.k);
            var Huu = new Array(this.k);
            var maxH = 0;
            for (var u = 0; u < n; ++u) {
                for (i = 0; i < this.k; ++i)
                    Huu[i] = this.g[i][u] = 0;
                for (var v = 0; v < n; ++v) {
                    if (u === v)
                        continue;
                    var maxDisplaces = n;
                    while (maxDisplaces--) {
                        var sd2 = 0;
                        for (i = 0; i < this.k; ++i) {
                            var dx = d[i] = x[i][u] - x[i][v];
                            sd2 += d2[i] = dx * dx;
                        }
                        if (sd2 > 1e-9)
                            break;
                        var rd = this.offsetDir();
                        for (i = 0; i < this.k; ++i)
                            x[i][v] += rd[i];
                    }
                    var l = Math.sqrt(sd2);
                    var D = this.D[u][v];
                    var weight = this.G != null ? this.G[u][v] : 1;
                    if (weight > 1 && l > D || !isFinite(D)) {
                        for (i = 0; i < this.k; ++i)
                            this.H[i][u][v] = 0;
                        continue;
                    }
                    if (weight > 1) {
                        weight = 1;
                    }
                    var D2 = D * D;
                    var gs = 2 * weight * (l - D) / (D2 * l);
                    var l3 = l * l * l;
                    var hs = 2 * -weight / (D2 * l3);
                    if (!isFinite(gs))
                        console.log(gs);
                    for (i = 0; i < this.k; ++i) {
                        this.g[i][u] += d[i] * gs;
                        Huu[i] -= this.H[i][u][v] = hs * (l3 + D * (d2[i] - sd2) + l * sd2);
                    }
                }
                for (i = 0; i < this.k; ++i)
                    maxH = Math.max(maxH, this.H[i][u][u] = Huu[i]);
            }
            var r = this.snapGridSize / 2;
            var g = this.snapGridSize;
            var w = this.snapStrength;
            var k = w / (r * r);
            var numNodes = this.numGridSnapNodes;
            for (var u = 0; u < numNodes; ++u) {
                for (i = 0; i < this.k; ++i) {
                    var xiu = this.x[i][u];
                    var m = xiu / g;
                    var f = m % 1;
                    var q = m - f;
                    var a = Math.abs(f);
                    var dx = (a <= 0.5) ? xiu - q * g :
                        (xiu > 0) ? xiu - (q + 1) * g : xiu - (q - 1) * g;
                    if (-r < dx && dx <= r) {
                        if (this.scaleSnapByMaxH) {
                            this.g[i][u] += maxH * k * dx;
                            this.H[i][u][u] += maxH * k;
                        }
                        else {
                            this.g[i][u] += k * dx;
                            this.H[i][u][u] += k;
                        }
                    }
                }
            }
            if (!this.locks.isEmpty()) {
                this.locks.apply(function (u, p) {
                    for (i = 0; i < _this.k; ++i) {
                        _this.H[i][u][u] += maxH;
                        _this.g[i][u] -= maxH * (p[i] - x[i][u]);
                    }
                });
            }
        };
        Descent.dotProd = function (a, b) {
            var x = 0, i = a.length;
            while (i--)
                x += a[i] * b[i];
            return x;
        };
        Descent.rightMultiply = function (m, v, r) {
            var i = m.length;
            while (i--)
                r[i] = Descent.dotProd(m[i], v);
        };
        Descent.prototype.computeStepSize = function (d) {
            var numerator = 0, denominator = 0;
            for (var i = 0; i < this.k; ++i) {
                numerator += Descent.dotProd(this.g[i], d[i]);
                Descent.rightMultiply(this.H[i], d[i], this.Hd[i]);
                denominator += Descent.dotProd(d[i], this.Hd[i]);
            }
            if (denominator === 0 || !isFinite(denominator))
                return 0;
            return 1 * numerator / denominator;
        };
        Descent.prototype.reduceStress = function () {
            this.computeDerivatives(this.x);
            var alpha = this.computeStepSize(this.g);
            for (var i = 0; i < this.k; ++i) {
                this.takeDescentStep(this.x[i], this.g[i], alpha);
            }
            return this.computeStress();
        };
        Descent.copy = function (a, b) {
            var m = a.length, n = b[0].length;
            for (var i = 0; i < m; ++i) {
                for (var j = 0; j < n; ++j) {
                    b[i][j] = a[i][j];
                }
            }
        };
        Descent.prototype.stepAndProject = function (x0, r, d, stepSize) {
            Descent.copy(x0, r);
            this.takeDescentStep(r[0], d[0], stepSize);
            if (this.project)
                this.project[0](x0[0], x0[1], r[0]);
            this.takeDescentStep(r[1], d[1], stepSize);
            if (this.project)
                this.project[1](r[0], x0[1], r[1]);
            for (var i = 2; i < this.k; i++)
                this.takeDescentStep(r[i], d[i], stepSize);
        };
        Descent.mApply = function (m, n, f) {
            var i = m;
            while (i-- > 0) {
                var j = n;
                while (j-- > 0)
                    f(i, j);
            }
        };
        Descent.prototype.matrixApply = function (f) {
            Descent.mApply(this.k, this.n, f);
        };
        Descent.prototype.computeNextPosition = function (x0, r) {
            var _this = this;
            this.computeDerivatives(x0);
            var alpha = this.computeStepSize(this.g);
            this.stepAndProject(x0, r, this.g, alpha);
            if (this.project) {
                this.matrixApply(function (i, j) { return _this.e[i][j] = x0[i][j] - r[i][j]; });
                var beta = this.computeStepSize(this.e);
                beta = Math.max(0.2, Math.min(beta, 1));
                this.stepAndProject(x0, r, this.e, beta);
            }
        };
        Descent.prototype.run = function (iterations) {
            var stress = Number.MAX_VALUE, converged = false;
            while (!converged && iterations-- > 0) {
                var s = this.rungeKutta();
                converged = Math.abs(stress / s - 1) < this.threshold;
                stress = s;
            }
            return stress;
        };
        Descent.prototype.rungeKutta = function () {
            var _this = this;
            this.computeNextPosition(this.x, this.a);
            Descent.mid(this.x, this.a, this.ia);
            this.computeNextPosition(this.ia, this.b);
            Descent.mid(this.x, this.b, this.ib);
            this.computeNextPosition(this.ib, this.c);
            this.computeNextPosition(this.c, this.d);
            var disp = 0;
            this.matrixApply(function (i, j) {
                var x = (_this.a[i][j] + 2.0 * _this.b[i][j] + 2.0 * _this.c[i][j] + _this.d[i][j]) / 6.0, d = _this.x[i][j] - x;
                disp += d * d;
                _this.x[i][j] = x;
            });
            return disp;
        };
        Descent.mid = function (a, b, m) {
            Descent.mApply(a.length, a[0].length, function (i, j) {
                return m[i][j] = a[i][j] + (b[i][j] - a[i][j]) / 2.0;
            });
        };
        Descent.prototype.takeDescentStep = function (x, d, stepSize) {
            for (var i = 0; i < this.n; ++i) {
                x[i] = x[i] - stepSize * d[i];
            }
        };
        Descent.prototype.computeStress = function () {
            var stress = 0;
            for (var u = 0, nMinus1 = this.n - 1; u < nMinus1; ++u) {
                for (var v = u + 1, n = this.n; v < n; ++v) {
                    var l = 0;
                    for (var i = 0; i < this.k; ++i) {
                        var dx = this.x[i][u] - this.x[i][v];
                        l += dx * dx;
                    }
                    l = Math.sqrt(l);
                    var d = this.D[u][v];
                    if (!isFinite(d))
                        continue;
                    var rl = d - l;
                    var d2 = d * d;
                    stress += rl * rl / d2;
                }
            }
            return stress;
        };
        Descent.zeroDistance = 1e-10;
        return Descent;
    }());
    descent.Descent = Descent;
    var PseudoRandom = (function () {
        function PseudoRandom(seed) {
            if (seed === void 0) { seed = 1; }
            this.seed = seed;
            this.a = 214013;
            this.c = 2531011;
            this.m = 2147483648;
            this.range = 32767;
        }
        PseudoRandom.prototype.getNext = function () {
            this.seed = (this.seed * this.a + this.c) % this.m;
            return (this.seed >> 16) / this.range;
        };
        PseudoRandom.prototype.getNextBetween = function (min, max) {
            return min + this.getNext() * (max - min);
        };
        return PseudoRandom;
    }());
    descent.PseudoRandom = PseudoRandom;

    var rectangle = {};

    var vpsc = {};

    Object.defineProperty(vpsc, "__esModule", { value: true });
    var PositionStats = (function () {
        function PositionStats(scale) {
            this.scale = scale;
            this.AB = 0;
            this.AD = 0;
            this.A2 = 0;
        }
        PositionStats.prototype.addVariable = function (v) {
            var ai = this.scale / v.scale;
            var bi = v.offset / v.scale;
            var wi = v.weight;
            this.AB += wi * ai * bi;
            this.AD += wi * ai * v.desiredPosition;
            this.A2 += wi * ai * ai;
        };
        PositionStats.prototype.getPosn = function () {
            return (this.AD - this.AB) / this.A2;
        };
        return PositionStats;
    }());
    vpsc.PositionStats = PositionStats;
    var Constraint = (function () {
        function Constraint(left, right, gap, equality) {
            if (equality === void 0) { equality = false; }
            this.left = left;
            this.right = right;
            this.gap = gap;
            this.equality = equality;
            this.active = false;
            this.unsatisfiable = false;
            this.left = left;
            this.right = right;
            this.gap = gap;
            this.equality = equality;
        }
        Constraint.prototype.slack = function () {
            return this.unsatisfiable ? Number.MAX_VALUE
                : this.right.scale * this.right.position() - this.gap
                    - this.left.scale * this.left.position();
        };
        return Constraint;
    }());
    vpsc.Constraint = Constraint;
    var Variable = (function () {
        function Variable(desiredPosition, weight, scale) {
            if (weight === void 0) { weight = 1; }
            if (scale === void 0) { scale = 1; }
            this.desiredPosition = desiredPosition;
            this.weight = weight;
            this.scale = scale;
            this.offset = 0;
        }
        Variable.prototype.dfdv = function () {
            return 2.0 * this.weight * (this.position() - this.desiredPosition);
        };
        Variable.prototype.position = function () {
            return (this.block.ps.scale * this.block.posn + this.offset) / this.scale;
        };
        Variable.prototype.visitNeighbours = function (prev, f) {
            var ff = function (c, next) { return c.active && prev !== next && f(c, next); };
            this.cOut.forEach(function (c) { return ff(c, c.right); });
            this.cIn.forEach(function (c) { return ff(c, c.left); });
        };
        return Variable;
    }());
    vpsc.Variable = Variable;
    var Block = (function () {
        function Block(v) {
            this.vars = [];
            v.offset = 0;
            this.ps = new PositionStats(v.scale);
            this.addVariable(v);
        }
        Block.prototype.addVariable = function (v) {
            v.block = this;
            this.vars.push(v);
            this.ps.addVariable(v);
            this.posn = this.ps.getPosn();
        };
        Block.prototype.updateWeightedPosition = function () {
            this.ps.AB = this.ps.AD = this.ps.A2 = 0;
            for (var i = 0, n = this.vars.length; i < n; ++i)
                this.ps.addVariable(this.vars[i]);
            this.posn = this.ps.getPosn();
        };
        Block.prototype.compute_lm = function (v, u, postAction) {
            var _this = this;
            var dfdv = v.dfdv();
            v.visitNeighbours(u, function (c, next) {
                var _dfdv = _this.compute_lm(next, v, postAction);
                if (next === c.right) {
                    dfdv += _dfdv * c.left.scale;
                    c.lm = _dfdv;
                }
                else {
                    dfdv += _dfdv * c.right.scale;
                    c.lm = -_dfdv;
                }
                postAction(c);
            });
            return dfdv / v.scale;
        };
        Block.prototype.populateSplitBlock = function (v, prev) {
            var _this = this;
            v.visitNeighbours(prev, function (c, next) {
                next.offset = v.offset + (next === c.right ? c.gap : -c.gap);
                _this.addVariable(next);
                _this.populateSplitBlock(next, v);
            });
        };
        Block.prototype.traverse = function (visit, acc, v, prev) {
            var _this = this;
            if (v === void 0) { v = this.vars[0]; }
            if (prev === void 0) { prev = null; }
            v.visitNeighbours(prev, function (c, next) {
                acc.push(visit(c));
                _this.traverse(visit, acc, next, v);
            });
        };
        Block.prototype.findMinLM = function () {
            var m = null;
            this.compute_lm(this.vars[0], null, function (c) {
                if (!c.equality && (m === null || c.lm < m.lm))
                    m = c;
            });
            return m;
        };
        Block.prototype.findMinLMBetween = function (lv, rv) {
            this.compute_lm(lv, null, function () { });
            var m = null;
            this.findPath(lv, null, rv, function (c, next) {
                if (!c.equality && c.right === next && (m === null || c.lm < m.lm))
                    m = c;
            });
            return m;
        };
        Block.prototype.findPath = function (v, prev, to, visit) {
            var _this = this;
            var endFound = false;
            v.visitNeighbours(prev, function (c, next) {
                if (!endFound && (next === to || _this.findPath(next, v, to, visit))) {
                    endFound = true;
                    visit(c, next);
                }
            });
            return endFound;
        };
        Block.prototype.isActiveDirectedPathBetween = function (u, v) {
            if (u === v)
                return true;
            var i = u.cOut.length;
            while (i--) {
                var c = u.cOut[i];
                if (c.active && this.isActiveDirectedPathBetween(c.right, v))
                    return true;
            }
            return false;
        };
        Block.split = function (c) {
            c.active = false;
            return [Block.createSplitBlock(c.left), Block.createSplitBlock(c.right)];
        };
        Block.createSplitBlock = function (startVar) {
            var b = new Block(startVar);
            b.populateSplitBlock(startVar, null);
            return b;
        };
        Block.prototype.splitBetween = function (vl, vr) {
            var c = this.findMinLMBetween(vl, vr);
            if (c !== null) {
                var bs = Block.split(c);
                return { constraint: c, lb: bs[0], rb: bs[1] };
            }
            return null;
        };
        Block.prototype.mergeAcross = function (b, c, dist) {
            c.active = true;
            for (var i = 0, n = b.vars.length; i < n; ++i) {
                var v = b.vars[i];
                v.offset += dist;
                this.addVariable(v);
            }
            this.posn = this.ps.getPosn();
        };
        Block.prototype.cost = function () {
            var sum = 0, i = this.vars.length;
            while (i--) {
                var v = this.vars[i], d = v.position() - v.desiredPosition;
                sum += d * d * v.weight;
            }
            return sum;
        };
        return Block;
    }());
    vpsc.Block = Block;
    var Blocks = (function () {
        function Blocks(vs) {
            this.vs = vs;
            var n = vs.length;
            this.list = new Array(n);
            while (n--) {
                var b = new Block(vs[n]);
                this.list[n] = b;
                b.blockInd = n;
            }
        }
        Blocks.prototype.cost = function () {
            var sum = 0, i = this.list.length;
            while (i--)
                sum += this.list[i].cost();
            return sum;
        };
        Blocks.prototype.insert = function (b) {
            b.blockInd = this.list.length;
            this.list.push(b);
        };
        Blocks.prototype.remove = function (b) {
            var last = this.list.length - 1;
            var swapBlock = this.list[last];
            this.list.length = last;
            if (b !== swapBlock) {
                this.list[b.blockInd] = swapBlock;
                swapBlock.blockInd = b.blockInd;
            }
        };
        Blocks.prototype.merge = function (c) {
            var l = c.left.block, r = c.right.block;
            var dist = c.right.offset - c.left.offset - c.gap;
            if (l.vars.length < r.vars.length) {
                r.mergeAcross(l, c, dist);
                this.remove(l);
            }
            else {
                l.mergeAcross(r, c, -dist);
                this.remove(r);
            }
        };
        Blocks.prototype.forEach = function (f) {
            this.list.forEach(f);
        };
        Blocks.prototype.updateBlockPositions = function () {
            this.list.forEach(function (b) { return b.updateWeightedPosition(); });
        };
        Blocks.prototype.split = function (inactive) {
            var _this = this;
            this.updateBlockPositions();
            this.list.forEach(function (b) {
                var v = b.findMinLM();
                if (v !== null && v.lm < Solver.LAGRANGIAN_TOLERANCE) {
                    b = v.left.block;
                    Block.split(v).forEach(function (nb) { return _this.insert(nb); });
                    _this.remove(b);
                    inactive.push(v);
                }
            });
        };
        return Blocks;
    }());
    vpsc.Blocks = Blocks;
    var Solver = (function () {
        function Solver(vs, cs) {
            this.vs = vs;
            this.cs = cs;
            this.vs = vs;
            vs.forEach(function (v) {
                v.cIn = [], v.cOut = [];
            });
            this.cs = cs;
            cs.forEach(function (c) {
                c.left.cOut.push(c);
                c.right.cIn.push(c);
            });
            this.inactive = cs.map(function (c) { c.active = false; return c; });
            this.bs = null;
        }
        Solver.prototype.cost = function () {
            return this.bs.cost();
        };
        Solver.prototype.setStartingPositions = function (ps) {
            this.inactive = this.cs.map(function (c) { c.active = false; return c; });
            this.bs = new Blocks(this.vs);
            this.bs.forEach(function (b, i) { return b.posn = ps[i]; });
        };
        Solver.prototype.setDesiredPositions = function (ps) {
            this.vs.forEach(function (v, i) { return v.desiredPosition = ps[i]; });
        };
        Solver.prototype.mostViolated = function () {
            var minSlack = Number.MAX_VALUE, v = null, l = this.inactive, n = l.length, deletePoint = n;
            for (var i = 0; i < n; ++i) {
                var c = l[i];
                if (c.unsatisfiable)
                    continue;
                var slack = c.slack();
                if (c.equality || slack < minSlack) {
                    minSlack = slack;
                    v = c;
                    deletePoint = i;
                    if (c.equality)
                        break;
                }
            }
            if (deletePoint !== n &&
                (minSlack < Solver.ZERO_UPPERBOUND && !v.active || v.equality)) {
                l[deletePoint] = l[n - 1];
                l.length = n - 1;
            }
            return v;
        };
        Solver.prototype.satisfy = function () {
            if (this.bs == null) {
                this.bs = new Blocks(this.vs);
            }
            this.bs.split(this.inactive);
            var v = null;
            while ((v = this.mostViolated()) && (v.equality || v.slack() < Solver.ZERO_UPPERBOUND && !v.active)) {
                var lb = v.left.block, rb = v.right.block;
                if (lb !== rb) {
                    this.bs.merge(v);
                }
                else {
                    if (lb.isActiveDirectedPathBetween(v.right, v.left)) {
                        v.unsatisfiable = true;
                        continue;
                    }
                    var split = lb.splitBetween(v.left, v.right);
                    if (split !== null) {
                        this.bs.insert(split.lb);
                        this.bs.insert(split.rb);
                        this.bs.remove(lb);
                        this.inactive.push(split.constraint);
                    }
                    else {
                        v.unsatisfiable = true;
                        continue;
                    }
                    if (v.slack() >= 0) {
                        this.inactive.push(v);
                    }
                    else {
                        this.bs.merge(v);
                    }
                }
            }
        };
        Solver.prototype.solve = function () {
            this.satisfy();
            var lastcost = Number.MAX_VALUE, cost = this.bs.cost();
            while (Math.abs(lastcost - cost) > 0.0001) {
                this.satisfy();
                lastcost = cost;
                cost = this.bs.cost();
            }
            return cost;
        };
        Solver.LAGRANGIAN_TOLERANCE = -1e-4;
        Solver.ZERO_UPPERBOUND = -1e-10;
        return Solver;
    }());
    vpsc.Solver = Solver;
    function removeOverlapInOneDimension(spans, lowerBound, upperBound) {
        var vs = spans.map(function (s) { return new Variable(s.desiredCenter); });
        var cs = [];
        var n = spans.length;
        for (var i = 0; i < n - 1; i++) {
            var left = spans[i], right = spans[i + 1];
            cs.push(new Constraint(vs[i], vs[i + 1], (left.size + right.size) / 2));
        }
        var leftMost = vs[0], rightMost = vs[n - 1], leftMostSize = spans[0].size / 2, rightMostSize = spans[n - 1].size / 2;
        var vLower = null, vUpper = null;
        if (lowerBound) {
            vLower = new Variable(lowerBound, leftMost.weight * 1000);
            vs.push(vLower);
            cs.push(new Constraint(vLower, leftMost, leftMostSize));
        }
        if (upperBound) {
            vUpper = new Variable(upperBound, rightMost.weight * 1000);
            vs.push(vUpper);
            cs.push(new Constraint(rightMost, vUpper, rightMostSize));
        }
        var solver = new Solver(vs, cs);
        solver.solve();
        return {
            newCenters: vs.slice(0, spans.length).map(function (v) { return v.position(); }),
            lowerBound: vLower ? vLower.position() : leftMost.position() - leftMostSize,
            upperBound: vUpper ? vUpper.position() : rightMost.position() + rightMostSize
        };
    }
    vpsc.removeOverlapInOneDimension = removeOverlapInOneDimension;

    var rbtree = {};

    var __extends$5 = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(rbtree, "__esModule", { value: true });
    var TreeBase = (function () {
        function TreeBase() {
            this.findIter = function (data) {
                var res = this._root;
                var iter = this.iterator();
                while (res !== null) {
                    var c = this._comparator(data, res.data);
                    if (c === 0) {
                        iter._cursor = res;
                        return iter;
                    }
                    else {
                        iter._ancestors.push(res);
                        res = res.get_child(c > 0);
                    }
                }
                return null;
            };
        }
        TreeBase.prototype.clear = function () {
            this._root = null;
            this.size = 0;
        };
        TreeBase.prototype.find = function (data) {
            var res = this._root;
            while (res !== null) {
                var c = this._comparator(data, res.data);
                if (c === 0) {
                    return res.data;
                }
                else {
                    res = res.get_child(c > 0);
                }
            }
            return null;
        };
        TreeBase.prototype.lowerBound = function (data) {
            return this._bound(data, this._comparator);
        };
        TreeBase.prototype.upperBound = function (data) {
            var cmp = this._comparator;
            function reverse_cmp(a, b) {
                return cmp(b, a);
            }
            return this._bound(data, reverse_cmp);
        };
        TreeBase.prototype.min = function () {
            var res = this._root;
            if (res === null) {
                return null;
            }
            while (res.left !== null) {
                res = res.left;
            }
            return res.data;
        };
        TreeBase.prototype.max = function () {
            var res = this._root;
            if (res === null) {
                return null;
            }
            while (res.right !== null) {
                res = res.right;
            }
            return res.data;
        };
        TreeBase.prototype.iterator = function () {
            return new Iterator(this);
        };
        TreeBase.prototype.each = function (cb) {
            var it = this.iterator(), data;
            while ((data = it.next()) !== null) {
                cb(data);
            }
        };
        TreeBase.prototype.reach = function (cb) {
            var it = this.iterator(), data;
            while ((data = it.prev()) !== null) {
                cb(data);
            }
        };
        TreeBase.prototype._bound = function (data, cmp) {
            var cur = this._root;
            var iter = this.iterator();
            while (cur !== null) {
                var c = this._comparator(data, cur.data);
                if (c === 0) {
                    iter._cursor = cur;
                    return iter;
                }
                iter._ancestors.push(cur);
                cur = cur.get_child(c > 0);
            }
            for (var i = iter._ancestors.length - 1; i >= 0; --i) {
                cur = iter._ancestors[i];
                if (cmp(data, cur.data) > 0) {
                    iter._cursor = cur;
                    iter._ancestors.length = i;
                    return iter;
                }
            }
            iter._ancestors.length = 0;
            return iter;
        };
        return TreeBase;
    }());
    rbtree.TreeBase = TreeBase;
    var Iterator = (function () {
        function Iterator(tree) {
            this._tree = tree;
            this._ancestors = [];
            this._cursor = null;
        }
        Iterator.prototype.data = function () {
            return this._cursor !== null ? this._cursor.data : null;
        };
        Iterator.prototype.next = function () {
            if (this._cursor === null) {
                var root = this._tree._root;
                if (root !== null) {
                    this._minNode(root);
                }
            }
            else {
                if (this._cursor.right === null) {
                    var save;
                    do {
                        save = this._cursor;
                        if (this._ancestors.length) {
                            this._cursor = this._ancestors.pop();
                        }
                        else {
                            this._cursor = null;
                            break;
                        }
                    } while (this._cursor.right === save);
                }
                else {
                    this._ancestors.push(this._cursor);
                    this._minNode(this._cursor.right);
                }
            }
            return this._cursor !== null ? this._cursor.data : null;
        };
        Iterator.prototype.prev = function () {
            if (this._cursor === null) {
                var root = this._tree._root;
                if (root !== null) {
                    this._maxNode(root);
                }
            }
            else {
                if (this._cursor.left === null) {
                    var save;
                    do {
                        save = this._cursor;
                        if (this._ancestors.length) {
                            this._cursor = this._ancestors.pop();
                        }
                        else {
                            this._cursor = null;
                            break;
                        }
                    } while (this._cursor.left === save);
                }
                else {
                    this._ancestors.push(this._cursor);
                    this._maxNode(this._cursor.left);
                }
            }
            return this._cursor !== null ? this._cursor.data : null;
        };
        Iterator.prototype._minNode = function (start) {
            while (start.left !== null) {
                this._ancestors.push(start);
                start = start.left;
            }
            this._cursor = start;
        };
        Iterator.prototype._maxNode = function (start) {
            while (start.right !== null) {
                this._ancestors.push(start);
                start = start.right;
            }
            this._cursor = start;
        };
        return Iterator;
    }());
    rbtree.Iterator = Iterator;
    var Node$2 = (function () {
        function Node(data) {
            this.data = data;
            this.left = null;
            this.right = null;
            this.red = true;
        }
        Node.prototype.get_child = function (dir) {
            return dir ? this.right : this.left;
        };
        Node.prototype.set_child = function (dir, val) {
            if (dir) {
                this.right = val;
            }
            else {
                this.left = val;
            }
        };
        return Node;
    }());
    var RBTree = (function (_super) {
        __extends$5(RBTree, _super);
        function RBTree(comparator) {
            var _this = _super.call(this) || this;
            _this._root = null;
            _this._comparator = comparator;
            _this.size = 0;
            return _this;
        }
        RBTree.prototype.insert = function (data) {
            var ret = false;
            if (this._root === null) {
                this._root = new Node$2(data);
                ret = true;
                this.size++;
            }
            else {
                var head = new Node$2(undefined);
                var dir = false;
                var last = false;
                var gp = null;
                var ggp = head;
                var p = null;
                var node = this._root;
                ggp.right = this._root;
                while (true) {
                    if (node === null) {
                        node = new Node$2(data);
                        p.set_child(dir, node);
                        ret = true;
                        this.size++;
                    }
                    else if (RBTree.is_red(node.left) && RBTree.is_red(node.right)) {
                        node.red = true;
                        node.left.red = false;
                        node.right.red = false;
                    }
                    if (RBTree.is_red(node) && RBTree.is_red(p)) {
                        var dir2 = ggp.right === gp;
                        if (node === p.get_child(last)) {
                            ggp.set_child(dir2, RBTree.single_rotate(gp, !last));
                        }
                        else {
                            ggp.set_child(dir2, RBTree.double_rotate(gp, !last));
                        }
                    }
                    var cmp = this._comparator(node.data, data);
                    if (cmp === 0) {
                        break;
                    }
                    last = dir;
                    dir = cmp < 0;
                    if (gp !== null) {
                        ggp = gp;
                    }
                    gp = p;
                    p = node;
                    node = node.get_child(dir);
                }
                this._root = head.right;
            }
            this._root.red = false;
            return ret;
        };
        RBTree.prototype.remove = function (data) {
            if (this._root === null) {
                return false;
            }
            var head = new Node$2(undefined);
            var node = head;
            node.right = this._root;
            var p = null;
            var gp = null;
            var found = null;
            var dir = true;
            while (node.get_child(dir) !== null) {
                var last = dir;
                gp = p;
                p = node;
                node = node.get_child(dir);
                var cmp = this._comparator(data, node.data);
                dir = cmp > 0;
                if (cmp === 0) {
                    found = node;
                }
                if (!RBTree.is_red(node) && !RBTree.is_red(node.get_child(dir))) {
                    if (RBTree.is_red(node.get_child(!dir))) {
                        var sr = RBTree.single_rotate(node, dir);
                        p.set_child(last, sr);
                        p = sr;
                    }
                    else if (!RBTree.is_red(node.get_child(!dir))) {
                        var sibling = p.get_child(!last);
                        if (sibling !== null) {
                            if (!RBTree.is_red(sibling.get_child(!last)) && !RBTree.is_red(sibling.get_child(last))) {
                                p.red = false;
                                sibling.red = true;
                                node.red = true;
                            }
                            else {
                                var dir2 = gp.right === p;
                                if (RBTree.is_red(sibling.get_child(last))) {
                                    gp.set_child(dir2, RBTree.double_rotate(p, last));
                                }
                                else if (RBTree.is_red(sibling.get_child(!last))) {
                                    gp.set_child(dir2, RBTree.single_rotate(p, last));
                                }
                                var gpc = gp.get_child(dir2);
                                gpc.red = true;
                                node.red = true;
                                gpc.left.red = false;
                                gpc.right.red = false;
                            }
                        }
                    }
                }
            }
            if (found !== null) {
                found.data = node.data;
                p.set_child(p.right === node, node.get_child(node.left === null));
                this.size--;
            }
            this._root = head.right;
            if (this._root !== null) {
                this._root.red = false;
            }
            return found !== null;
        };
        RBTree.is_red = function (node) {
            return node !== null && node.red;
        };
        RBTree.single_rotate = function (root, dir) {
            var save = root.get_child(!dir);
            root.set_child(!dir, save.get_child(dir));
            save.set_child(dir, root);
            root.red = true;
            save.red = false;
            return save;
        };
        RBTree.double_rotate = function (root, dir) {
            root.set_child(!dir, RBTree.single_rotate(root.get_child(!dir), !dir));
            return RBTree.single_rotate(root, dir);
        };
        return RBTree;
    }(TreeBase));
    rbtree.RBTree = RBTree;

    var __extends$4 = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(rectangle, "__esModule", { value: true });
    var vpsc_1$1 = vpsc;
    var rbtree_1 = rbtree;
    function computeGroupBounds(g) {
        g.bounds = typeof g.leaves !== "undefined" ?
            g.leaves.reduce(function (r, c) { return c.bounds.union(r); }, Rectangle.empty()) :
            Rectangle.empty();
        if (typeof g.groups !== "undefined")
            g.bounds = g.groups.reduce(function (r, c) { return computeGroupBounds(c).union(r); }, g.bounds);
        g.bounds = g.bounds.inflate(g.padding);
        return g.bounds;
    }
    rectangle.computeGroupBounds = computeGroupBounds;
    var Rectangle = (function () {
        function Rectangle(x, X, y, Y) {
            this.x = x;
            this.X = X;
            this.y = y;
            this.Y = Y;
        }
        Rectangle.empty = function () { return new Rectangle(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY); };
        Rectangle.prototype.cx = function () { return (this.x + this.X) / 2; };
        Rectangle.prototype.cy = function () { return (this.y + this.Y) / 2; };
        Rectangle.prototype.overlapX = function (r) {
            var ux = this.cx(), vx = r.cx();
            if (ux <= vx && r.x < this.X)
                return this.X - r.x;
            if (vx <= ux && this.x < r.X)
                return r.X - this.x;
            return 0;
        };
        Rectangle.prototype.overlapY = function (r) {
            var uy = this.cy(), vy = r.cy();
            if (uy <= vy && r.y < this.Y)
                return this.Y - r.y;
            if (vy <= uy && this.y < r.Y)
                return r.Y - this.y;
            return 0;
        };
        Rectangle.prototype.setXCentre = function (cx) {
            var dx = cx - this.cx();
            this.x += dx;
            this.X += dx;
        };
        Rectangle.prototype.setYCentre = function (cy) {
            var dy = cy - this.cy();
            this.y += dy;
            this.Y += dy;
        };
        Rectangle.prototype.width = function () {
            return this.X - this.x;
        };
        Rectangle.prototype.height = function () {
            return this.Y - this.y;
        };
        Rectangle.prototype.union = function (r) {
            return new Rectangle(Math.min(this.x, r.x), Math.max(this.X, r.X), Math.min(this.y, r.y), Math.max(this.Y, r.Y));
        };
        Rectangle.prototype.lineIntersections = function (x1, y1, x2, y2) {
            var sides = [[this.x, this.y, this.X, this.y],
                [this.X, this.y, this.X, this.Y],
                [this.X, this.Y, this.x, this.Y],
                [this.x, this.Y, this.x, this.y]];
            var intersections = [];
            for (var i = 0; i < 4; ++i) {
                var r = Rectangle.lineIntersection(x1, y1, x2, y2, sides[i][0], sides[i][1], sides[i][2], sides[i][3]);
                if (r !== null)
                    intersections.push({ x: r.x, y: r.y });
            }
            return intersections;
        };
        Rectangle.prototype.rayIntersection = function (x2, y2) {
            var ints = this.lineIntersections(this.cx(), this.cy(), x2, y2);
            return ints.length > 0 ? ints[0] : null;
        };
        Rectangle.prototype.vertices = function () {
            return [
                { x: this.x, y: this.y },
                { x: this.X, y: this.y },
                { x: this.X, y: this.Y },
                { x: this.x, y: this.Y }
            ];
        };
        Rectangle.lineIntersection = function (x1, y1, x2, y2, x3, y3, x4, y4) {
            var dx12 = x2 - x1, dx34 = x4 - x3, dy12 = y2 - y1, dy34 = y4 - y3, denominator = dy34 * dx12 - dx34 * dy12;
            if (denominator == 0)
                return null;
            var dx31 = x1 - x3, dy31 = y1 - y3, numa = dx34 * dy31 - dy34 * dx31, a = numa / denominator, numb = dx12 * dy31 - dy12 * dx31, b = numb / denominator;
            if (a >= 0 && a <= 1 && b >= 0 && b <= 1) {
                return {
                    x: x1 + a * dx12,
                    y: y1 + a * dy12
                };
            }
            return null;
        };
        Rectangle.prototype.inflate = function (pad) {
            return new Rectangle(this.x - pad, this.X + pad, this.y - pad, this.Y + pad);
        };
        return Rectangle;
    }());
    rectangle.Rectangle = Rectangle;
    function makeEdgeBetween(source, target, ah) {
        var si = source.rayIntersection(target.cx(), target.cy()) || { x: source.cx(), y: source.cy() }, ti = target.rayIntersection(source.cx(), source.cy()) || { x: target.cx(), y: target.cy() }, dx = ti.x - si.x, dy = ti.y - si.y, l = Math.sqrt(dx * dx + dy * dy), al = l - ah;
        return {
            sourceIntersection: si,
            targetIntersection: ti,
            arrowStart: { x: si.x + al * dx / l, y: si.y + al * dy / l }
        };
    }
    rectangle.makeEdgeBetween = makeEdgeBetween;
    function makeEdgeTo(s, target, ah) {
        var ti = target.rayIntersection(s.x, s.y);
        if (!ti)
            ti = { x: target.cx(), y: target.cy() };
        var dx = ti.x - s.x, dy = ti.y - s.y, l = Math.sqrt(dx * dx + dy * dy);
        return { x: ti.x - ah * dx / l, y: ti.y - ah * dy / l };
    }
    rectangle.makeEdgeTo = makeEdgeTo;
    var Node$1 = (function () {
        function Node(v, r, pos) {
            this.v = v;
            this.r = r;
            this.pos = pos;
            this.prev = makeRBTree();
            this.next = makeRBTree();
        }
        return Node;
    }());
    var Event = (function () {
        function Event(isOpen, v, pos) {
            this.isOpen = isOpen;
            this.v = v;
            this.pos = pos;
        }
        return Event;
    }());
    function compareEvents(a, b) {
        if (a.pos > b.pos) {
            return 1;
        }
        if (a.pos < b.pos) {
            return -1;
        }
        if (a.isOpen) {
            return -1;
        }
        if (b.isOpen) {
            return 1;
        }
        return 0;
    }
    function makeRBTree() {
        return new rbtree_1.RBTree(function (a, b) { return a.pos - b.pos; });
    }
    var xRect = {
        getCentre: function (r) { return r.cx(); },
        getOpen: function (r) { return r.y; },
        getClose: function (r) { return r.Y; },
        getSize: function (r) { return r.width(); },
        makeRect: function (open, close, center, size) { return new Rectangle(center - size / 2, center + size / 2, open, close); },
        findNeighbours: findXNeighbours
    };
    var yRect = {
        getCentre: function (r) { return r.cy(); },
        getOpen: function (r) { return r.x; },
        getClose: function (r) { return r.X; },
        getSize: function (r) { return r.height(); },
        makeRect: function (open, close, center, size) { return new Rectangle(open, close, center - size / 2, center + size / 2); },
        findNeighbours: findYNeighbours
    };
    function generateGroupConstraints(root, f, minSep, isContained) {
        if (isContained === void 0) { isContained = false; }
        var padding = root.padding, gn = typeof root.groups !== 'undefined' ? root.groups.length : 0, ln = typeof root.leaves !== 'undefined' ? root.leaves.length : 0, childConstraints = !gn ? []
            : root.groups.reduce(function (ccs, g) { return ccs.concat(generateGroupConstraints(g, f, minSep, true)); }, []), n = (isContained ? 2 : 0) + ln + gn, vs = new Array(n), rs = new Array(n), i = 0, add = function (r, v) { rs[i] = r; vs[i++] = v; };
        if (isContained) {
            var b = root.bounds, c = f.getCentre(b), s = f.getSize(b) / 2, open = f.getOpen(b), close = f.getClose(b), min = c - s + padding / 2, max = c + s - padding / 2;
            root.minVar.desiredPosition = min;
            add(f.makeRect(open, close, min, padding), root.minVar);
            root.maxVar.desiredPosition = max;
            add(f.makeRect(open, close, max, padding), root.maxVar);
        }
        if (ln)
            root.leaves.forEach(function (l) { return add(l.bounds, l.variable); });
        if (gn)
            root.groups.forEach(function (g) {
                var b = g.bounds;
                add(f.makeRect(f.getOpen(b), f.getClose(b), f.getCentre(b), f.getSize(b)), g.minVar);
            });
        var cs = generateConstraints(rs, vs, f, minSep);
        if (gn) {
            vs.forEach(function (v) { v.cOut = [], v.cIn = []; });
            cs.forEach(function (c) { c.left.cOut.push(c), c.right.cIn.push(c); });
            root.groups.forEach(function (g) {
                var gapAdjustment = (g.padding - f.getSize(g.bounds)) / 2;
                g.minVar.cIn.forEach(function (c) { return c.gap += gapAdjustment; });
                g.minVar.cOut.forEach(function (c) { c.left = g.maxVar; c.gap += gapAdjustment; });
            });
        }
        return childConstraints.concat(cs);
    }
    function generateConstraints(rs, vars, rect, minSep) {
        var i, n = rs.length;
        var N = 2 * n;
        console.assert(vars.length >= n);
        var events = new Array(N);
        for (i = 0; i < n; ++i) {
            var r = rs[i];
            var v = new Node$1(vars[i], r, rect.getCentre(r));
            events[i] = new Event(true, v, rect.getOpen(r));
            events[i + n] = new Event(false, v, rect.getClose(r));
        }
        events.sort(compareEvents);
        var cs = new Array();
        var scanline = makeRBTree();
        for (i = 0; i < N; ++i) {
            var e = events[i];
            var v = e.v;
            if (e.isOpen) {
                scanline.insert(v);
                rect.findNeighbours(v, scanline);
            }
            else {
                scanline.remove(v);
                var makeConstraint = function (l, r) {
                    var sep = (rect.getSize(l.r) + rect.getSize(r.r)) / 2 + minSep;
                    cs.push(new vpsc_1$1.Constraint(l.v, r.v, sep));
                };
                var visitNeighbours = function (forward, reverse, mkcon) {
                    var u, it = v[forward].iterator();
                    while ((u = it[forward]()) !== null) {
                        mkcon(u, v);
                        u[reverse].remove(v);
                    }
                };
                visitNeighbours("prev", "next", function (u, v) { return makeConstraint(u, v); });
                visitNeighbours("next", "prev", function (u, v) { return makeConstraint(v, u); });
            }
        }
        console.assert(scanline.size === 0);
        return cs;
    }
    function findXNeighbours(v, scanline) {
        var f = function (forward, reverse) {
            var it = scanline.findIter(v);
            var u;
            while ((u = it[forward]()) !== null) {
                var uovervX = u.r.overlapX(v.r);
                if (uovervX <= 0 || uovervX <= u.r.overlapY(v.r)) {
                    v[forward].insert(u);
                    u[reverse].insert(v);
                }
                if (uovervX <= 0) {
                    break;
                }
            }
        };
        f("next", "prev");
        f("prev", "next");
    }
    function findYNeighbours(v, scanline) {
        var f = function (forward, reverse) {
            var u = scanline.findIter(v)[forward]();
            if (u !== null && u.r.overlapX(v.r) > 0) {
                v[forward].insert(u);
                u[reverse].insert(v);
            }
        };
        f("next", "prev");
        f("prev", "next");
    }
    function generateXConstraints(rs, vars) {
        return generateConstraints(rs, vars, xRect, 1e-6);
    }
    rectangle.generateXConstraints = generateXConstraints;
    function generateYConstraints(rs, vars) {
        return generateConstraints(rs, vars, yRect, 1e-6);
    }
    rectangle.generateYConstraints = generateYConstraints;
    function generateXGroupConstraints(root) {
        return generateGroupConstraints(root, xRect, 1e-6);
    }
    rectangle.generateXGroupConstraints = generateXGroupConstraints;
    function generateYGroupConstraints(root) {
        return generateGroupConstraints(root, yRect, 1e-6);
    }
    rectangle.generateYGroupConstraints = generateYGroupConstraints;
    function removeOverlaps(rs) {
        var vs = rs.map(function (r) { return new vpsc_1$1.Variable(r.cx()); });
        var cs = generateXConstraints(rs, vs);
        var solver = new vpsc_1$1.Solver(vs, cs);
        solver.solve();
        vs.forEach(function (v, i) { return rs[i].setXCentre(v.position()); });
        vs = rs.map(function (r) { return new vpsc_1$1.Variable(r.cy()); });
        cs = generateYConstraints(rs, vs);
        solver = new vpsc_1$1.Solver(vs, cs);
        solver.solve();
        vs.forEach(function (v, i) { return rs[i].setYCentre(v.position()); });
    }
    rectangle.removeOverlaps = removeOverlaps;
    var IndexedVariable = (function (_super) {
        __extends$4(IndexedVariable, _super);
        function IndexedVariable(index, w) {
            var _this = _super.call(this, 0, w) || this;
            _this.index = index;
            return _this;
        }
        return IndexedVariable;
    }(vpsc_1$1.Variable));
    rectangle.IndexedVariable = IndexedVariable;
    var Projection = (function () {
        function Projection(nodes, groups, rootGroup, constraints, avoidOverlaps) {
            var _this = this;
            if (rootGroup === void 0) { rootGroup = null; }
            if (constraints === void 0) { constraints = null; }
            if (avoidOverlaps === void 0) { avoidOverlaps = false; }
            this.nodes = nodes;
            this.groups = groups;
            this.rootGroup = rootGroup;
            this.avoidOverlaps = avoidOverlaps;
            this.variables = nodes.map(function (v, i) {
                return v.variable = new IndexedVariable(i, 1);
            });
            if (constraints)
                this.createConstraints(constraints);
            if (avoidOverlaps && rootGroup && typeof rootGroup.groups !== 'undefined') {
                nodes.forEach(function (v) {
                    if (!v.width || !v.height) {
                        v.bounds = new Rectangle(v.x, v.x, v.y, v.y);
                        return;
                    }
                    var w2 = v.width / 2, h2 = v.height / 2;
                    v.bounds = new Rectangle(v.x - w2, v.x + w2, v.y - h2, v.y + h2);
                });
                computeGroupBounds(rootGroup);
                var i = nodes.length;
                groups.forEach(function (g) {
                    _this.variables[i] = g.minVar = new IndexedVariable(i++, typeof g.stiffness !== "undefined" ? g.stiffness : 0.01);
                    _this.variables[i] = g.maxVar = new IndexedVariable(i++, typeof g.stiffness !== "undefined" ? g.stiffness : 0.01);
                });
            }
        }
        Projection.prototype.createSeparation = function (c) {
            return new vpsc_1$1.Constraint(this.nodes[c.left].variable, this.nodes[c.right].variable, c.gap, typeof c.equality !== "undefined" ? c.equality : false);
        };
        Projection.prototype.makeFeasible = function (c) {
            var _this = this;
            if (!this.avoidOverlaps)
                return;
            var axis = 'x', dim = 'width';
            if (c.axis === 'x')
                axis = 'y', dim = 'height';
            var vs = c.offsets.map(function (o) { return _this.nodes[o.node]; }).sort(function (a, b) { return a[axis] - b[axis]; });
            var p = null;
            vs.forEach(function (v) {
                if (p) {
                    var nextPos = p[axis] + p[dim];
                    if (nextPos > v[axis]) {
                        v[axis] = nextPos;
                    }
                }
                p = v;
            });
        };
        Projection.prototype.createAlignment = function (c) {
            var _this = this;
            var u = this.nodes[c.offsets[0].node].variable;
            this.makeFeasible(c);
            var cs = c.axis === 'x' ? this.xConstraints : this.yConstraints;
            c.offsets.slice(1).forEach(function (o) {
                var v = _this.nodes[o.node].variable;
                cs.push(new vpsc_1$1.Constraint(u, v, o.offset, true));
            });
        };
        Projection.prototype.createConstraints = function (constraints) {
            var _this = this;
            var isSep = function (c) { return typeof c.type === 'undefined' || c.type === 'separation'; };
            this.xConstraints = constraints
                .filter(function (c) { return c.axis === "x" && isSep(c); })
                .map(function (c) { return _this.createSeparation(c); });
            this.yConstraints = constraints
                .filter(function (c) { return c.axis === "y" && isSep(c); })
                .map(function (c) { return _this.createSeparation(c); });
            constraints
                .filter(function (c) { return c.type === 'alignment'; })
                .forEach(function (c) { return _this.createAlignment(c); });
        };
        Projection.prototype.setupVariablesAndBounds = function (x0, y0, desired, getDesired) {
            this.nodes.forEach(function (v, i) {
                if (v.fixed) {
                    v.variable.weight = v.fixedWeight ? v.fixedWeight : 1000;
                    desired[i] = getDesired(v);
                }
                else {
                    v.variable.weight = 1;
                }
                var w = (v.width || 0) / 2, h = (v.height || 0) / 2;
                var ix = x0[i], iy = y0[i];
                v.bounds = new Rectangle(ix - w, ix + w, iy - h, iy + h);
            });
        };
        Projection.prototype.xProject = function (x0, y0, x) {
            if (!this.rootGroup && !(this.avoidOverlaps || this.xConstraints))
                return;
            this.project(x0, y0, x0, x, function (v) { return v.px; }, this.xConstraints, generateXGroupConstraints, function (v) { return v.bounds.setXCentre(x[v.variable.index] = v.variable.position()); }, function (g) {
                var xmin = x[g.minVar.index] = g.minVar.position();
                var xmax = x[g.maxVar.index] = g.maxVar.position();
                var p2 = g.padding / 2;
                g.bounds.x = xmin - p2;
                g.bounds.X = xmax + p2;
            });
        };
        Projection.prototype.yProject = function (x0, y0, y) {
            if (!this.rootGroup && !this.yConstraints)
                return;
            this.project(x0, y0, y0, y, function (v) { return v.py; }, this.yConstraints, generateYGroupConstraints, function (v) { return v.bounds.setYCentre(y[v.variable.index] = v.variable.position()); }, function (g) {
                var ymin = y[g.minVar.index] = g.minVar.position();
                var ymax = y[g.maxVar.index] = g.maxVar.position();
                var p2 = g.padding / 2;
                g.bounds.y = ymin - p2;
                g.bounds.Y = ymax + p2;
            });
        };
        Projection.prototype.projectFunctions = function () {
            var _this = this;
            return [
                function (x0, y0, x) { return _this.xProject(x0, y0, x); },
                function (x0, y0, y) { return _this.yProject(x0, y0, y); }
            ];
        };
        Projection.prototype.project = function (x0, y0, start, desired, getDesired, cs, generateConstraints, updateNodeBounds, updateGroupBounds) {
            this.setupVariablesAndBounds(x0, y0, desired, getDesired);
            if (this.rootGroup && this.avoidOverlaps) {
                computeGroupBounds(this.rootGroup);
                cs = cs.concat(generateConstraints(this.rootGroup));
            }
            this.solve(this.variables, cs, start, desired);
            this.nodes.forEach(updateNodeBounds);
            if (this.rootGroup && this.avoidOverlaps) {
                this.groups.forEach(updateGroupBounds);
                computeGroupBounds(this.rootGroup);
            }
        };
        Projection.prototype.solve = function (vs, cs, starting, desired) {
            var solver = new vpsc_1$1.Solver(vs, cs);
            solver.setStartingPositions(starting);
            solver.setDesiredPositions(desired);
            solver.solve();
        };
        return Projection;
    }());
    rectangle.Projection = Projection;

    var shortestpaths = {};

    var pqueue = {};

    Object.defineProperty(pqueue, "__esModule", { value: true });
    var PairingHeap = (function () {
        function PairingHeap(elem) {
            this.elem = elem;
            this.subheaps = [];
        }
        PairingHeap.prototype.toString = function (selector) {
            var str = "", needComma = false;
            for (var i = 0; i < this.subheaps.length; ++i) {
                var subheap = this.subheaps[i];
                if (!subheap.elem) {
                    needComma = false;
                    continue;
                }
                if (needComma) {
                    str = str + ",";
                }
                str = str + subheap.toString(selector);
                needComma = true;
            }
            if (str !== "") {
                str = "(" + str + ")";
            }
            return (this.elem ? selector(this.elem) : "") + str;
        };
        PairingHeap.prototype.forEach = function (f) {
            if (!this.empty()) {
                f(this.elem, this);
                this.subheaps.forEach(function (s) { return s.forEach(f); });
            }
        };
        PairingHeap.prototype.count = function () {
            return this.empty() ? 0 : 1 + this.subheaps.reduce(function (n, h) {
                return n + h.count();
            }, 0);
        };
        PairingHeap.prototype.min = function () {
            return this.elem;
        };
        PairingHeap.prototype.empty = function () {
            return this.elem == null;
        };
        PairingHeap.prototype.contains = function (h) {
            if (this === h)
                return true;
            for (var i = 0; i < this.subheaps.length; i++) {
                if (this.subheaps[i].contains(h))
                    return true;
            }
            return false;
        };
        PairingHeap.prototype.isHeap = function (lessThan) {
            var _this = this;
            return this.subheaps.every(function (h) { return lessThan(_this.elem, h.elem) && h.isHeap(lessThan); });
        };
        PairingHeap.prototype.insert = function (obj, lessThan) {
            return this.merge(new PairingHeap(obj), lessThan);
        };
        PairingHeap.prototype.merge = function (heap2, lessThan) {
            if (this.empty())
                return heap2;
            else if (heap2.empty())
                return this;
            else if (lessThan(this.elem, heap2.elem)) {
                this.subheaps.push(heap2);
                return this;
            }
            else {
                heap2.subheaps.push(this);
                return heap2;
            }
        };
        PairingHeap.prototype.removeMin = function (lessThan) {
            if (this.empty())
                return null;
            else
                return this.mergePairs(lessThan);
        };
        PairingHeap.prototype.mergePairs = function (lessThan) {
            if (this.subheaps.length == 0)
                return new PairingHeap(null);
            else if (this.subheaps.length == 1) {
                return this.subheaps[0];
            }
            else {
                var firstPair = this.subheaps.pop().merge(this.subheaps.pop(), lessThan);
                var remaining = this.mergePairs(lessThan);
                return firstPair.merge(remaining, lessThan);
            }
        };
        PairingHeap.prototype.decreaseKey = function (subheap, newValue, setHeapNode, lessThan) {
            var newHeap = subheap.removeMin(lessThan);
            subheap.elem = newHeap.elem;
            subheap.subheaps = newHeap.subheaps;
            if (setHeapNode !== null && newHeap.elem !== null) {
                setHeapNode(subheap.elem, subheap);
            }
            var pairingNode = new PairingHeap(newValue);
            if (setHeapNode !== null) {
                setHeapNode(newValue, pairingNode);
            }
            return this.merge(pairingNode, lessThan);
        };
        return PairingHeap;
    }());
    pqueue.PairingHeap = PairingHeap;
    var PriorityQueue = (function () {
        function PriorityQueue(lessThan) {
            this.lessThan = lessThan;
        }
        PriorityQueue.prototype.top = function () {
            if (this.empty()) {
                return null;
            }
            return this.root.elem;
        };
        PriorityQueue.prototype.push = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var pairingNode;
            for (var i = 0, arg; arg = args[i]; ++i) {
                pairingNode = new PairingHeap(arg);
                this.root = this.empty() ?
                    pairingNode : this.root.merge(pairingNode, this.lessThan);
            }
            return pairingNode;
        };
        PriorityQueue.prototype.empty = function () {
            return !this.root || !this.root.elem;
        };
        PriorityQueue.prototype.isHeap = function () {
            return this.root.isHeap(this.lessThan);
        };
        PriorityQueue.prototype.forEach = function (f) {
            this.root.forEach(f);
        };
        PriorityQueue.prototype.pop = function () {
            if (this.empty()) {
                return null;
            }
            var obj = this.root.min();
            this.root = this.root.removeMin(this.lessThan);
            return obj;
        };
        PriorityQueue.prototype.reduceKey = function (heapNode, newKey, setHeapNode) {
            if (setHeapNode === void 0) { setHeapNode = null; }
            this.root = this.root.decreaseKey(heapNode, newKey, setHeapNode, this.lessThan);
        };
        PriorityQueue.prototype.toString = function (selector) {
            return this.root.toString(selector);
        };
        PriorityQueue.prototype.count = function () {
            return this.root.count();
        };
        return PriorityQueue;
    }());
    pqueue.PriorityQueue = PriorityQueue;

    Object.defineProperty(shortestpaths, "__esModule", { value: true });
    var pqueue_1 = pqueue;
    var Neighbour = (function () {
        function Neighbour(id, distance) {
            this.id = id;
            this.distance = distance;
        }
        return Neighbour;
    }());
    var Node = (function () {
        function Node(id) {
            this.id = id;
            this.neighbours = [];
        }
        return Node;
    }());
    var QueueEntry = (function () {
        function QueueEntry(node, prev, d) {
            this.node = node;
            this.prev = prev;
            this.d = d;
        }
        return QueueEntry;
    }());
    var Calculator = (function () {
        function Calculator(n, es, getSourceIndex, getTargetIndex, getLength) {
            this.n = n;
            this.es = es;
            this.neighbours = new Array(this.n);
            var i = this.n;
            while (i--)
                this.neighbours[i] = new Node(i);
            i = this.es.length;
            while (i--) {
                var e = this.es[i];
                var u = getSourceIndex(e), v = getTargetIndex(e);
                var d = getLength(e);
                this.neighbours[u].neighbours.push(new Neighbour(v, d));
                this.neighbours[v].neighbours.push(new Neighbour(u, d));
            }
        }
        Calculator.prototype.DistanceMatrix = function () {
            var D = new Array(this.n);
            for (var i = 0; i < this.n; ++i) {
                D[i] = this.dijkstraNeighbours(i);
            }
            return D;
        };
        Calculator.prototype.DistancesFromNode = function (start) {
            return this.dijkstraNeighbours(start);
        };
        Calculator.prototype.PathFromNodeToNode = function (start, end) {
            return this.dijkstraNeighbours(start, end);
        };
        Calculator.prototype.PathFromNodeToNodeWithPrevCost = function (start, end, prevCost) {
            var q = new pqueue_1.PriorityQueue(function (a, b) { return a.d <= b.d; }), u = this.neighbours[start], qu = new QueueEntry(u, null, 0), visitedFrom = {};
            q.push(qu);
            while (!q.empty()) {
                qu = q.pop();
                u = qu.node;
                if (u.id === end) {
                    break;
                }
                var i = u.neighbours.length;
                while (i--) {
                    var neighbour = u.neighbours[i], v = this.neighbours[neighbour.id];
                    if (qu.prev && v.id === qu.prev.node.id)
                        continue;
                    var viduid = v.id + ',' + u.id;
                    if (viduid in visitedFrom && visitedFrom[viduid] <= qu.d)
                        continue;
                    var cc = qu.prev ? prevCost(qu.prev.node.id, u.id, v.id) : 0, t = qu.d + neighbour.distance + cc;
                    visitedFrom[viduid] = t;
                    q.push(new QueueEntry(v, qu, t));
                }
            }
            var path = [];
            while (qu.prev) {
                qu = qu.prev;
                path.push(qu.node.id);
            }
            return path;
        };
        Calculator.prototype.dijkstraNeighbours = function (start, dest) {
            if (dest === void 0) { dest = -1; }
            var q = new pqueue_1.PriorityQueue(function (a, b) { return a.d <= b.d; }), i = this.neighbours.length, d = new Array(i);
            while (i--) {
                var node = this.neighbours[i];
                node.d = i === start ? 0 : Number.POSITIVE_INFINITY;
                node.q = q.push(node);
            }
            while (!q.empty()) {
                var u = q.pop();
                d[u.id] = u.d;
                if (u.id === dest) {
                    var path = [];
                    var v = u;
                    while (typeof v.prev !== 'undefined') {
                        path.push(v.prev.id);
                        v = v.prev;
                    }
                    return path;
                }
                i = u.neighbours.length;
                while (i--) {
                    var neighbour = u.neighbours[i];
                    var v = this.neighbours[neighbour.id];
                    var t = u.d + neighbour.distance;
                    if (u.d !== Number.MAX_VALUE && v.d > t) {
                        v.d = t;
                        v.prev = u;
                        q.reduceKey(v.q, v, function (e, q) { return e.q = q; });
                    }
                }
            }
            return d;
        };
        return Calculator;
    }());
    shortestpaths.Calculator = Calculator;

    var geom = {};

    var __extends$3 = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(geom, "__esModule", { value: true });
    var rectangle_1$2 = rectangle;
    var Point = (function () {
        function Point() {
        }
        return Point;
    }());
    geom.Point = Point;
    var LineSegment = (function () {
        function LineSegment(x1, y1, x2, y2) {
            this.x1 = x1;
            this.y1 = y1;
            this.x2 = x2;
            this.y2 = y2;
        }
        return LineSegment;
    }());
    geom.LineSegment = LineSegment;
    var PolyPoint = (function (_super) {
        __extends$3(PolyPoint, _super);
        function PolyPoint() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return PolyPoint;
    }(Point));
    geom.PolyPoint = PolyPoint;
    function isLeft(P0, P1, P2) {
        return (P1.x - P0.x) * (P2.y - P0.y) - (P2.x - P0.x) * (P1.y - P0.y);
    }
    geom.isLeft = isLeft;
    function above(p, vi, vj) {
        return isLeft(p, vi, vj) > 0;
    }
    function below(p, vi, vj) {
        return isLeft(p, vi, vj) < 0;
    }
    function ConvexHull(S) {
        var P = S.slice(0).sort(function (a, b) { return a.x !== b.x ? b.x - a.x : b.y - a.y; });
        var n = S.length, i;
        var minmin = 0;
        var xmin = P[0].x;
        for (i = 1; i < n; ++i) {
            if (P[i].x !== xmin)
                break;
        }
        var minmax = i - 1;
        var H = [];
        H.push(P[minmin]);
        if (minmax === n - 1) {
            if (P[minmax].y !== P[minmin].y)
                H.push(P[minmax]);
        }
        else {
            var maxmin, maxmax = n - 1;
            var xmax = P[n - 1].x;
            for (i = n - 2; i >= 0; i--)
                if (P[i].x !== xmax)
                    break;
            maxmin = i + 1;
            i = minmax;
            while (++i <= maxmin) {
                if (isLeft(P[minmin], P[maxmin], P[i]) >= 0 && i < maxmin)
                    continue;
                while (H.length > 1) {
                    if (isLeft(H[H.length - 2], H[H.length - 1], P[i]) > 0)
                        break;
                    else
                        H.length -= 1;
                }
                if (i != minmin)
                    H.push(P[i]);
            }
            if (maxmax != maxmin)
                H.push(P[maxmax]);
            var bot = H.length;
            i = maxmin;
            while (--i >= minmax) {
                if (isLeft(P[maxmax], P[minmax], P[i]) >= 0 && i > minmax)
                    continue;
                while (H.length > bot) {
                    if (isLeft(H[H.length - 2], H[H.length - 1], P[i]) > 0)
                        break;
                    else
                        H.length -= 1;
                }
                if (i != minmin)
                    H.push(P[i]);
            }
        }
        return H;
    }
    geom.ConvexHull = ConvexHull;
    function clockwiseRadialSweep(p, P, f) {
        P.slice(0).sort(function (a, b) { return Math.atan2(a.y - p.y, a.x - p.x) - Math.atan2(b.y - p.y, b.x - p.x); }).forEach(f);
    }
    geom.clockwiseRadialSweep = clockwiseRadialSweep;
    function tangent_PointPolyC(P, V) {
        var Vclosed = V.slice(0);
        Vclosed.push(V[0]);
        return { rtan: Rtangent_PointPolyC(P, Vclosed), ltan: Ltangent_PointPolyC(P, Vclosed) };
    }
    function Rtangent_PointPolyC(P, V) {
        var n = V.length - 1;
        var a, b, c;
        var upA, dnC;
        if (below(P, V[1], V[0]) && !above(P, V[n - 1], V[0]))
            return 0;
        for (a = 0, b = n;;) {
            if (b - a === 1)
                if (above(P, V[a], V[b]))
                    return a;
                else
                    return b;
            c = Math.floor((a + b) / 2);
            dnC = below(P, V[c + 1], V[c]);
            if (dnC && !above(P, V[c - 1], V[c]))
                return c;
            upA = above(P, V[a + 1], V[a]);
            if (upA) {
                if (dnC)
                    b = c;
                else {
                    if (above(P, V[a], V[c]))
                        b = c;
                    else
                        a = c;
                }
            }
            else {
                if (!dnC)
                    a = c;
                else {
                    if (below(P, V[a], V[c]))
                        b = c;
                    else
                        a = c;
                }
            }
        }
    }
    function Ltangent_PointPolyC(P, V) {
        var n = V.length - 1;
        var a, b, c;
        var dnA, dnC;
        if (above(P, V[n - 1], V[0]) && !below(P, V[1], V[0]))
            return 0;
        for (a = 0, b = n;;) {
            if (b - a === 1)
                if (below(P, V[a], V[b]))
                    return a;
                else
                    return b;
            c = Math.floor((a + b) / 2);
            dnC = below(P, V[c + 1], V[c]);
            if (above(P, V[c - 1], V[c]) && !dnC)
                return c;
            dnA = below(P, V[a + 1], V[a]);
            if (dnA) {
                if (!dnC)
                    b = c;
                else {
                    if (below(P, V[a], V[c]))
                        b = c;
                    else
                        a = c;
                }
            }
            else {
                if (dnC)
                    a = c;
                else {
                    if (above(P, V[a], V[c]))
                        b = c;
                    else
                        a = c;
                }
            }
        }
    }
    function tangent_PolyPolyC(V, W, t1, t2, cmp1, cmp2) {
        var ix1, ix2;
        ix1 = t1(W[0], V);
        ix2 = t2(V[ix1], W);
        var done = false;
        while (!done) {
            done = true;
            while (true) {
                if (ix1 === V.length - 1)
                    ix1 = 0;
                if (cmp1(W[ix2], V[ix1], V[ix1 + 1]))
                    break;
                ++ix1;
            }
            while (true) {
                if (ix2 === 0)
                    ix2 = W.length - 1;
                if (cmp2(V[ix1], W[ix2], W[ix2 - 1]))
                    break;
                --ix2;
                done = false;
            }
        }
        return { t1: ix1, t2: ix2 };
    }
    geom.tangent_PolyPolyC = tangent_PolyPolyC;
    function LRtangent_PolyPolyC(V, W) {
        var rl = RLtangent_PolyPolyC(W, V);
        return { t1: rl.t2, t2: rl.t1 };
    }
    geom.LRtangent_PolyPolyC = LRtangent_PolyPolyC;
    function RLtangent_PolyPolyC(V, W) {
        return tangent_PolyPolyC(V, W, Rtangent_PointPolyC, Ltangent_PointPolyC, above, below);
    }
    geom.RLtangent_PolyPolyC = RLtangent_PolyPolyC;
    function LLtangent_PolyPolyC(V, W) {
        return tangent_PolyPolyC(V, W, Ltangent_PointPolyC, Ltangent_PointPolyC, below, below);
    }
    geom.LLtangent_PolyPolyC = LLtangent_PolyPolyC;
    function RRtangent_PolyPolyC(V, W) {
        return tangent_PolyPolyC(V, W, Rtangent_PointPolyC, Rtangent_PointPolyC, above, above);
    }
    geom.RRtangent_PolyPolyC = RRtangent_PolyPolyC;
    var BiTangent = (function () {
        function BiTangent(t1, t2) {
            this.t1 = t1;
            this.t2 = t2;
        }
        return BiTangent;
    }());
    geom.BiTangent = BiTangent;
    var BiTangents = (function () {
        function BiTangents() {
        }
        return BiTangents;
    }());
    geom.BiTangents = BiTangents;
    var TVGPoint = (function (_super) {
        __extends$3(TVGPoint, _super);
        function TVGPoint() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return TVGPoint;
    }(Point));
    geom.TVGPoint = TVGPoint;
    var VisibilityVertex = (function () {
        function VisibilityVertex(id, polyid, polyvertid, p) {
            this.id = id;
            this.polyid = polyid;
            this.polyvertid = polyvertid;
            this.p = p;
            p.vv = this;
        }
        return VisibilityVertex;
    }());
    geom.VisibilityVertex = VisibilityVertex;
    var VisibilityEdge = (function () {
        function VisibilityEdge(source, target) {
            this.source = source;
            this.target = target;
        }
        VisibilityEdge.prototype.length = function () {
            var dx = this.source.p.x - this.target.p.x;
            var dy = this.source.p.y - this.target.p.y;
            return Math.sqrt(dx * dx + dy * dy);
        };
        return VisibilityEdge;
    }());
    geom.VisibilityEdge = VisibilityEdge;
    var TangentVisibilityGraph = (function () {
        function TangentVisibilityGraph(P, g0) {
            this.P = P;
            this.V = [];
            this.E = [];
            if (!g0) {
                var n = P.length;
                for (var i = 0; i < n; i++) {
                    var p = P[i];
                    for (var j = 0; j < p.length; ++j) {
                        var pj = p[j], vv = new VisibilityVertex(this.V.length, i, j, pj);
                        this.V.push(vv);
                        if (j > 0)
                            this.E.push(new VisibilityEdge(p[j - 1].vv, vv));
                    }
                    if (p.length > 1)
                        this.E.push(new VisibilityEdge(p[0].vv, p[p.length - 1].vv));
                }
                for (var i = 0; i < n - 1; i++) {
                    var Pi = P[i];
                    for (var j = i + 1; j < n; j++) {
                        var Pj = P[j], t = tangents(Pi, Pj);
                        for (var q in t) {
                            var c = t[q], source = Pi[c.t1], target = Pj[c.t2];
                            this.addEdgeIfVisible(source, target, i, j);
                        }
                    }
                }
            }
            else {
                this.V = g0.V.slice(0);
                this.E = g0.E.slice(0);
            }
        }
        TangentVisibilityGraph.prototype.addEdgeIfVisible = function (u, v, i1, i2) {
            if (!this.intersectsPolys(new LineSegment(u.x, u.y, v.x, v.y), i1, i2)) {
                this.E.push(new VisibilityEdge(u.vv, v.vv));
            }
        };
        TangentVisibilityGraph.prototype.addPoint = function (p, i1) {
            var n = this.P.length;
            this.V.push(new VisibilityVertex(this.V.length, n, 0, p));
            for (var i = 0; i < n; ++i) {
                if (i === i1)
                    continue;
                var poly = this.P[i], t = tangent_PointPolyC(p, poly);
                this.addEdgeIfVisible(p, poly[t.ltan], i1, i);
                this.addEdgeIfVisible(p, poly[t.rtan], i1, i);
            }
            return p.vv;
        };
        TangentVisibilityGraph.prototype.intersectsPolys = function (l, i1, i2) {
            for (var i = 0, n = this.P.length; i < n; ++i) {
                if (i != i1 && i != i2 && intersects(l, this.P[i]).length > 0) {
                    return true;
                }
            }
            return false;
        };
        return TangentVisibilityGraph;
    }());
    geom.TangentVisibilityGraph = TangentVisibilityGraph;
    function intersects(l, P) {
        var ints = [];
        for (var i = 1, n = P.length; i < n; ++i) {
            var int = rectangle_1$2.Rectangle.lineIntersection(l.x1, l.y1, l.x2, l.y2, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y);
            if (int)
                ints.push(int);
        }
        return ints;
    }
    function tangents(V, W) {
        var m = V.length - 1, n = W.length - 1;
        var bt = new BiTangents();
        for (var i = 0; i < m; ++i) {
            for (var j = 0; j < n; ++j) {
                var v1 = V[i == 0 ? m - 1 : i - 1];
                var v2 = V[i];
                var v3 = V[i + 1];
                var w1 = W[j == 0 ? n - 1 : j - 1];
                var w2 = W[j];
                var w3 = W[j + 1];
                var v1v2w2 = isLeft(v1, v2, w2);
                var v2w1w2 = isLeft(v2, w1, w2);
                var v2w2w3 = isLeft(v2, w2, w3);
                var w1w2v2 = isLeft(w1, w2, v2);
                var w2v1v2 = isLeft(w2, v1, v2);
                var w2v2v3 = isLeft(w2, v2, v3);
                if (v1v2w2 >= 0 && v2w1w2 >= 0 && v2w2w3 < 0
                    && w1w2v2 >= 0 && w2v1v2 >= 0 && w2v2v3 < 0) {
                    bt.ll = new BiTangent(i, j);
                }
                else if (v1v2w2 <= 0 && v2w1w2 <= 0 && v2w2w3 > 0
                    && w1w2v2 <= 0 && w2v1v2 <= 0 && w2v2v3 > 0) {
                    bt.rr = new BiTangent(i, j);
                }
                else if (v1v2w2 <= 0 && v2w1w2 > 0 && v2w2w3 <= 0
                    && w1w2v2 >= 0 && w2v1v2 < 0 && w2v2v3 >= 0) {
                    bt.rl = new BiTangent(i, j);
                }
                else if (v1v2w2 >= 0 && v2w1w2 < 0 && v2w2w3 >= 0
                    && w1w2v2 <= 0 && w2v1v2 > 0 && w2v2v3 <= 0) {
                    bt.lr = new BiTangent(i, j);
                }
            }
        }
        return bt;
    }
    geom.tangents = tangents;
    function isPointInsidePoly(p, poly) {
        for (var i = 1, n = poly.length; i < n; ++i)
            if (below(poly[i - 1], poly[i], p))
                return false;
        return true;
    }
    function isAnyPInQ(p, q) {
        return !p.every(function (v) { return !isPointInsidePoly(v, q); });
    }
    function polysOverlap(p, q) {
        if (isAnyPInQ(p, q))
            return true;
        if (isAnyPInQ(q, p))
            return true;
        for (var i = 1, n = p.length; i < n; ++i) {
            var v = p[i], u = p[i - 1];
            if (intersects(new LineSegment(u.x, u.y, v.x, v.y), q).length > 0)
                return true;
        }
        return false;
    }
    geom.polysOverlap = polysOverlap;

    var handledisconnected = {};

    Object.defineProperty(handledisconnected, "__esModule", { value: true });
    var packingOptions = {
        PADDING: 10,
        GOLDEN_SECTION: (1 + Math.sqrt(5)) / 2,
        FLOAT_EPSILON: 0.0001,
        MAX_INERATIONS: 100
    };
    function applyPacking(graphs, w, h, node_size, desired_ratio, centerGraph) {
        if (desired_ratio === void 0) { desired_ratio = 1; }
        if (centerGraph === void 0) { centerGraph = true; }
        var init_x = 0, init_y = 0, svg_width = w, svg_height = h, desired_ratio = typeof desired_ratio !== 'undefined' ? desired_ratio : 1, node_size = typeof node_size !== 'undefined' ? node_size : 0, real_width = 0, real_height = 0, min_width = 0, global_bottom = 0, line = [];
        if (graphs.length == 0)
            return;
        calculate_bb(graphs);
        apply(graphs);
        if (centerGraph) {
            put_nodes_to_right_positions(graphs);
        }
        function calculate_bb(graphs) {
            graphs.forEach(function (g) {
                calculate_single_bb(g);
            });
            function calculate_single_bb(graph) {
                var min_x = Number.MAX_VALUE, min_y = Number.MAX_VALUE, max_x = 0, max_y = 0;
                graph.array.forEach(function (v) {
                    var w = typeof v.width !== 'undefined' ? v.width : node_size;
                    var h = typeof v.height !== 'undefined' ? v.height : node_size;
                    w /= 2;
                    h /= 2;
                    max_x = Math.max(v.x + w, max_x);
                    min_x = Math.min(v.x - w, min_x);
                    max_y = Math.max(v.y + h, max_y);
                    min_y = Math.min(v.y - h, min_y);
                });
                graph.width = max_x - min_x;
                graph.height = max_y - min_y;
            }
        }
        function put_nodes_to_right_positions(graphs) {
            graphs.forEach(function (g) {
                var center = { x: 0, y: 0 };
                g.array.forEach(function (node) {
                    center.x += node.x;
                    center.y += node.y;
                });
                center.x /= g.array.length;
                center.y /= g.array.length;
                var corner = { x: center.x - g.width / 2, y: center.y - g.height / 2 };
                var offset = { x: g.x - corner.x + svg_width / 2 - real_width / 2, y: g.y - corner.y + svg_height / 2 - real_height / 2 };
                g.array.forEach(function (node) {
                    node.x += offset.x;
                    node.y += offset.y;
                });
            });
        }
        function apply(data, desired_ratio) {
            var curr_best_f = Number.POSITIVE_INFINITY;
            var curr_best = 0;
            data.sort(function (a, b) { return b.height - a.height; });
            min_width = data.reduce(function (a, b) {
                return a.width < b.width ? a.width : b.width;
            });
            var left = x1 = min_width;
            var right = x2 = get_entire_width(data);
            var iterationCounter = 0;
            var f_x1 = Number.MAX_VALUE;
            var f_x2 = Number.MAX_VALUE;
            var flag = -1;
            var dx = Number.MAX_VALUE;
            var df = Number.MAX_VALUE;
            while ((dx > min_width) || df > packingOptions.FLOAT_EPSILON) {
                if (flag != 1) {
                    var x1 = right - (right - left) / packingOptions.GOLDEN_SECTION;
                    var f_x1 = step(data, x1);
                }
                if (flag != 0) {
                    var x2 = left + (right - left) / packingOptions.GOLDEN_SECTION;
                    var f_x2 = step(data, x2);
                }
                dx = Math.abs(x1 - x2);
                df = Math.abs(f_x1 - f_x2);
                if (f_x1 < curr_best_f) {
                    curr_best_f = f_x1;
                    curr_best = x1;
                }
                if (f_x2 < curr_best_f) {
                    curr_best_f = f_x2;
                    curr_best = x2;
                }
                if (f_x1 > f_x2) {
                    left = x1;
                    x1 = x2;
                    f_x1 = f_x2;
                    flag = 1;
                }
                else {
                    right = x2;
                    x2 = x1;
                    f_x2 = f_x1;
                    flag = 0;
                }
                if (iterationCounter++ > 100) {
                    break;
                }
            }
            step(data, curr_best);
        }
        function step(data, max_width) {
            line = [];
            real_width = 0;
            real_height = 0;
            global_bottom = init_y;
            for (var i = 0; i < data.length; i++) {
                var o = data[i];
                put_rect(o, max_width);
            }
            return Math.abs(get_real_ratio() - desired_ratio);
        }
        function put_rect(rect, max_width) {
            var parent = undefined;
            for (var i = 0; i < line.length; i++) {
                if ((line[i].space_left >= rect.height) && (line[i].x + line[i].width + rect.width + packingOptions.PADDING - max_width) <= packingOptions.FLOAT_EPSILON) {
                    parent = line[i];
                    break;
                }
            }
            line.push(rect);
            if (parent !== undefined) {
                rect.x = parent.x + parent.width + packingOptions.PADDING;
                rect.y = parent.bottom;
                rect.space_left = rect.height;
                rect.bottom = rect.y;
                parent.space_left -= rect.height + packingOptions.PADDING;
                parent.bottom += rect.height + packingOptions.PADDING;
            }
            else {
                rect.y = global_bottom;
                global_bottom += rect.height + packingOptions.PADDING;
                rect.x = init_x;
                rect.bottom = rect.y;
                rect.space_left = rect.height;
            }
            if (rect.y + rect.height - real_height > -packingOptions.FLOAT_EPSILON)
                real_height = rect.y + rect.height - init_y;
            if (rect.x + rect.width - real_width > -packingOptions.FLOAT_EPSILON)
                real_width = rect.x + rect.width - init_x;
        }
        function get_entire_width(data) {
            var width = 0;
            data.forEach(function (d) { return width += d.width + packingOptions.PADDING; });
            return width;
        }
        function get_real_ratio() {
            return (real_width / real_height);
        }
    }
    handledisconnected.applyPacking = applyPacking;
    function separateGraphs(nodes, links) {
        var marks = {};
        var ways = {};
        var graphs = [];
        var clusters = 0;
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var n1 = link.source;
            var n2 = link.target;
            if (ways[n1.index])
                ways[n1.index].push(n2);
            else
                ways[n1.index] = [n2];
            if (ways[n2.index])
                ways[n2.index].push(n1);
            else
                ways[n2.index] = [n1];
        }
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (marks[node.index])
                continue;
            explore_node(node, true);
        }
        function explore_node(n, is_new) {
            if (marks[n.index] !== undefined)
                return;
            if (is_new) {
                clusters++;
                graphs.push({ array: [] });
            }
            marks[n.index] = clusters;
            graphs[clusters - 1].array.push(n);
            var adjacent = ways[n.index];
            if (!adjacent)
                return;
            for (var j = 0; j < adjacent.length; j++) {
                explore_node(adjacent[j], false);
            }
        }
        return graphs;
    }
    handledisconnected.separateGraphs = separateGraphs;

    (function (exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var powergraph$1 = powergraph;
    var linklengths_1 = linklengths;
    var descent_1 = descent;
    var rectangle_1 = rectangle;
    var shortestpaths_1 = shortestpaths;
    var geom_1 = geom;
    var handledisconnected_1 = handledisconnected;
    var EventType;
    (function (EventType) {
        EventType[EventType["start"] = 0] = "start";
        EventType[EventType["tick"] = 1] = "tick";
        EventType[EventType["end"] = 2] = "end";
    })(EventType = exports.EventType || (exports.EventType = {}));
    function isGroup(g) {
        return typeof g.leaves !== 'undefined' || typeof g.groups !== 'undefined';
    }
    var Layout = (function () {
        function Layout() {
            var _this = this;
            this._canvasSize = [1, 1];
            this._linkDistance = 20;
            this._defaultNodeSize = 10;
            this._linkLengthCalculator = null;
            this._linkType = null;
            this._avoidOverlaps = false;
            this._handleDisconnected = true;
            this._running = false;
            this._nodes = [];
            this._groups = [];
            this._rootGroup = null;
            this._links = [];
            this._constraints = [];
            this._distanceMatrix = null;
            this._descent = null;
            this._directedLinkConstraints = null;
            this._threshold = 0.01;
            this._visibilityGraph = null;
            this._groupCompactness = 1e-6;
            this.event = null;
            this.linkAccessor = {
                getSourceIndex: Layout.getSourceIndex,
                getTargetIndex: Layout.getTargetIndex,
                setLength: Layout.setLinkLength,
                getType: function (l) { return typeof _this._linkType === "function" ? _this._linkType(l) : 0; }
            };
        }
        Layout.prototype.on = function (e, listener) {
            if (!this.event)
                this.event = {};
            if (typeof e === 'string') {
                this.event[EventType[e]] = listener;
            }
            else {
                this.event[e] = listener;
            }
            return this;
        };
        Layout.prototype.trigger = function (e) {
            if (this.event && typeof this.event[e.type] !== 'undefined') {
                this.event[e.type](e);
            }
        };
        Layout.prototype.kick = function () {
            while (!this.tick())
                ;
        };
        Layout.prototype.tick = function () {
            if (this._alpha < this._threshold) {
                this._running = false;
                this.trigger({ type: EventType.end, alpha: this._alpha = 0, stress: this._lastStress });
                return true;
            }
            var n = this._nodes.length; this._links.length;
            var o, i;
            this._descent.locks.clear();
            for (i = 0; i < n; ++i) {
                o = this._nodes[i];
                if (o.fixed) {
                    if (typeof o.px === 'undefined' || typeof o.py === 'undefined') {
                        o.px = o.x;
                        o.py = o.y;
                    }
                    var p = [o.px, o.py];
                    this._descent.locks.add(i, p);
                }
            }
            var s1 = this._descent.rungeKutta();
            if (s1 === 0) {
                this._alpha = 0;
            }
            else if (typeof this._lastStress !== 'undefined') {
                this._alpha = s1;
            }
            this._lastStress = s1;
            this.updateNodePositions();
            this.trigger({ type: EventType.tick, alpha: this._alpha, stress: this._lastStress });
            return false;
        };
        Layout.prototype.updateNodePositions = function () {
            var x = this._descent.x[0], y = this._descent.x[1];
            var o, i = this._nodes.length;
            while (i--) {
                o = this._nodes[i];
                o.x = x[i];
                o.y = y[i];
            }
        };
        Layout.prototype.nodes = function (v) {
            if (!v) {
                if (this._nodes.length === 0 && this._links.length > 0) {
                    var n = 0;
                    this._links.forEach(function (l) {
                        n = Math.max(n, l.source, l.target);
                    });
                    this._nodes = new Array(++n);
                    for (var i = 0; i < n; ++i) {
                        this._nodes[i] = {};
                    }
                }
                return this._nodes;
            }
            this._nodes = v;
            return this;
        };
        Layout.prototype.groups = function (x) {
            var _this = this;
            if (!x)
                return this._groups;
            this._groups = x;
            this._rootGroup = {};
            this._groups.forEach(function (g) {
                if (typeof g.padding === "undefined")
                    g.padding = 1;
                if (typeof g.leaves !== "undefined") {
                    g.leaves.forEach(function (v, i) {
                        if (typeof v === 'number')
                            (g.leaves[i] = _this._nodes[v]).parent = g;
                    });
                }
                if (typeof g.groups !== "undefined") {
                    g.groups.forEach(function (gi, i) {
                        if (typeof gi === 'number')
                            (g.groups[i] = _this._groups[gi]).parent = g;
                    });
                }
            });
            this._rootGroup.leaves = this._nodes.filter(function (v) { return typeof v.parent === 'undefined'; });
            this._rootGroup.groups = this._groups.filter(function (g) { return typeof g.parent === 'undefined'; });
            return this;
        };
        Layout.prototype.powerGraphGroups = function (f) {
            var g = powergraph$1.getGroups(this._nodes, this._links, this.linkAccessor, this._rootGroup);
            this.groups(g.groups);
            f(g);
            return this;
        };
        Layout.prototype.avoidOverlaps = function (v) {
            if (!arguments.length)
                return this._avoidOverlaps;
            this._avoidOverlaps = v;
            return this;
        };
        Layout.prototype.handleDisconnected = function (v) {
            if (!arguments.length)
                return this._handleDisconnected;
            this._handleDisconnected = v;
            return this;
        };
        Layout.prototype.flowLayout = function (axis, minSeparation) {
            if (!arguments.length)
                axis = 'y';
            this._directedLinkConstraints = {
                axis: axis,
                getMinSeparation: typeof minSeparation === 'number' ? function () { return minSeparation; } : minSeparation
            };
            return this;
        };
        Layout.prototype.links = function (x) {
            if (!arguments.length)
                return this._links;
            this._links = x;
            return this;
        };
        Layout.prototype.constraints = function (c) {
            if (!arguments.length)
                return this._constraints;
            this._constraints = c;
            return this;
        };
        Layout.prototype.distanceMatrix = function (d) {
            if (!arguments.length)
                return this._distanceMatrix;
            this._distanceMatrix = d;
            return this;
        };
        Layout.prototype.size = function (x) {
            if (!x)
                return this._canvasSize;
            this._canvasSize = x;
            return this;
        };
        Layout.prototype.defaultNodeSize = function (x) {
            if (!x)
                return this._defaultNodeSize;
            this._defaultNodeSize = x;
            return this;
        };
        Layout.prototype.groupCompactness = function (x) {
            if (!x)
                return this._groupCompactness;
            this._groupCompactness = x;
            return this;
        };
        Layout.prototype.linkDistance = function (x) {
            if (!x) {
                return this._linkDistance;
            }
            this._linkDistance = typeof x === "function" ? x : +x;
            this._linkLengthCalculator = null;
            return this;
        };
        Layout.prototype.linkType = function (f) {
            this._linkType = f;
            return this;
        };
        Layout.prototype.convergenceThreshold = function (x) {
            if (!x)
                return this._threshold;
            this._threshold = typeof x === "function" ? x : +x;
            return this;
        };
        Layout.prototype.alpha = function (x) {
            if (!arguments.length)
                return this._alpha;
            else {
                x = +x;
                if (this._alpha) {
                    if (x > 0)
                        this._alpha = x;
                    else
                        this._alpha = 0;
                }
                else if (x > 0) {
                    if (!this._running) {
                        this._running = true;
                        this.trigger({ type: EventType.start, alpha: this._alpha = x });
                        this.kick();
                    }
                }
                return this;
            }
        };
        Layout.prototype.getLinkLength = function (link) {
            return typeof this._linkDistance === "function" ? +(this._linkDistance(link)) : this._linkDistance;
        };
        Layout.setLinkLength = function (link, length) {
            link.length = length;
        };
        Layout.prototype.getLinkType = function (link) {
            return typeof this._linkType === "function" ? this._linkType(link) : 0;
        };
        Layout.prototype.symmetricDiffLinkLengths = function (idealLength, w) {
            var _this = this;
            if (w === void 0) { w = 1; }
            this.linkDistance(function (l) { return idealLength * l.length; });
            this._linkLengthCalculator = function () { return linklengths_1.symmetricDiffLinkLengths(_this._links, _this.linkAccessor, w); };
            return this;
        };
        Layout.prototype.jaccardLinkLengths = function (idealLength, w) {
            var _this = this;
            if (w === void 0) { w = 1; }
            this.linkDistance(function (l) { return idealLength * l.length; });
            this._linkLengthCalculator = function () { return linklengths_1.jaccardLinkLengths(_this._links, _this.linkAccessor, w); };
            return this;
        };
        Layout.prototype.start = function (initialUnconstrainedIterations, initialUserConstraintIterations, initialAllConstraintsIterations, gridSnapIterations, keepRunning, centerGraph) {
            var _this = this;
            if (initialUnconstrainedIterations === void 0) { initialUnconstrainedIterations = 0; }
            if (initialUserConstraintIterations === void 0) { initialUserConstraintIterations = 0; }
            if (initialAllConstraintsIterations === void 0) { initialAllConstraintsIterations = 0; }
            if (gridSnapIterations === void 0) { gridSnapIterations = 0; }
            if (keepRunning === void 0) { keepRunning = true; }
            if (centerGraph === void 0) { centerGraph = true; }
            var i, n = this.nodes().length, N = n + 2 * this._groups.length; this._links.length; var w = this._canvasSize[0], h = this._canvasSize[1];
            var x = new Array(N), y = new Array(N);
            var G = null;
            var ao = this._avoidOverlaps;
            this._nodes.forEach(function (v, i) {
                v.index = i;
                if (typeof v.x === 'undefined') {
                    v.x = w / 2, v.y = h / 2;
                }
                x[i] = v.x, y[i] = v.y;
            });
            if (this._linkLengthCalculator)
                this._linkLengthCalculator();
            var distances;
            if (this._distanceMatrix) {
                distances = this._distanceMatrix;
            }
            else {
                distances = (new shortestpaths_1.Calculator(N, this._links, Layout.getSourceIndex, Layout.getTargetIndex, function (l) { return _this.getLinkLength(l); })).DistanceMatrix();
                G = descent_1.Descent.createSquareMatrix(N, function () { return 2; });
                this._links.forEach(function (l) {
                    if (typeof l.source == "number")
                        l.source = _this._nodes[l.source];
                    if (typeof l.target == "number")
                        l.target = _this._nodes[l.target];
                });
                this._links.forEach(function (e) {
                    var u = Layout.getSourceIndex(e), v = Layout.getTargetIndex(e);
                    G[u][v] = G[v][u] = e.weight || 1;
                });
            }
            var D = descent_1.Descent.createSquareMatrix(N, function (i, j) {
                return distances[i][j];
            });
            if (this._rootGroup && typeof this._rootGroup.groups !== 'undefined') {
                var i = n;
                var addAttraction = function (i, j, strength, idealDistance) {
                    G[i][j] = G[j][i] = strength;
                    D[i][j] = D[j][i] = idealDistance;
                };
                this._groups.forEach(function (g) {
                    addAttraction(i, i + 1, _this._groupCompactness, 0.1);
                    x[i] = 0, y[i++] = 0;
                    x[i] = 0, y[i++] = 0;
                });
            }
            else
                this._rootGroup = { leaves: this._nodes, groups: [] };
            var curConstraints = this._constraints || [];
            if (this._directedLinkConstraints) {
                this.linkAccessor.getMinSeparation = this._directedLinkConstraints.getMinSeparation;
                curConstraints = curConstraints.concat(linklengths_1.generateDirectedEdgeConstraints(n, this._links, this._directedLinkConstraints.axis, (this.linkAccessor)));
            }
            this.avoidOverlaps(false);
            this._descent = new descent_1.Descent([x, y], D);
            this._descent.locks.clear();
            for (var i = 0; i < n; ++i) {
                var o = this._nodes[i];
                if (o.fixed) {
                    o.px = o.x;
                    o.py = o.y;
                    var p = [o.x, o.y];
                    this._descent.locks.add(i, p);
                }
            }
            this._descent.threshold = this._threshold;
            this.initialLayout(initialUnconstrainedIterations, x, y);
            if (curConstraints.length > 0)
                this._descent.project = new rectangle_1.Projection(this._nodes, this._groups, this._rootGroup, curConstraints).projectFunctions();
            this._descent.run(initialUserConstraintIterations);
            this.separateOverlappingComponents(w, h, centerGraph);
            this.avoidOverlaps(ao);
            if (ao) {
                this._nodes.forEach(function (v, i) { v.x = x[i], v.y = y[i]; });
                this._descent.project = new rectangle_1.Projection(this._nodes, this._groups, this._rootGroup, curConstraints, true).projectFunctions();
                this._nodes.forEach(function (v, i) { x[i] = v.x, y[i] = v.y; });
            }
            this._descent.G = G;
            this._descent.run(initialAllConstraintsIterations);
            if (gridSnapIterations) {
                this._descent.snapStrength = 1000;
                this._descent.snapGridSize = this._nodes[0].width;
                this._descent.numGridSnapNodes = n;
                this._descent.scaleSnapByMaxH = n != N;
                var G0 = descent_1.Descent.createSquareMatrix(N, function (i, j) {
                    if (i >= n || j >= n)
                        return G[i][j];
                    return 0;
                });
                this._descent.G = G0;
                this._descent.run(gridSnapIterations);
            }
            this.updateNodePositions();
            this.separateOverlappingComponents(w, h, centerGraph);
            return keepRunning ? this.resume() : this;
        };
        Layout.prototype.initialLayout = function (iterations, x, y) {
            if (this._groups.length > 0 && iterations > 0) {
                var n = this._nodes.length;
                var edges = this._links.map(function (e) { return ({ source: e.source.index, target: e.target.index }); });
                var vs = this._nodes.map(function (v) { return ({ index: v.index }); });
                this._groups.forEach(function (g, i) {
                    vs.push({ index: g.index = n + i });
                });
                this._groups.forEach(function (g, i) {
                    if (typeof g.leaves !== 'undefined')
                        g.leaves.forEach(function (v) { return edges.push({ source: g.index, target: v.index }); });
                    if (typeof g.groups !== 'undefined')
                        g.groups.forEach(function (gg) { return edges.push({ source: g.index, target: gg.index }); });
                });
                new Layout()
                    .size(this.size())
                    .nodes(vs)
                    .links(edges)
                    .avoidOverlaps(false)
                    .linkDistance(this.linkDistance())
                    .symmetricDiffLinkLengths(5)
                    .convergenceThreshold(1e-4)
                    .start(iterations, 0, 0, 0, false);
                this._nodes.forEach(function (v) {
                    x[v.index] = vs[v.index].x;
                    y[v.index] = vs[v.index].y;
                });
            }
            else {
                this._descent.run(iterations);
            }
        };
        Layout.prototype.separateOverlappingComponents = function (width, height, centerGraph) {
            var _this = this;
            if (centerGraph === void 0) { centerGraph = true; }
            if (!this._distanceMatrix && this._handleDisconnected) {
                var x_1 = this._descent.x[0], y_1 = this._descent.x[1];
                this._nodes.forEach(function (v, i) { v.x = x_1[i], v.y = y_1[i]; });
                var graphs = handledisconnected_1.separateGraphs(this._nodes, this._links);
                handledisconnected_1.applyPacking(graphs, width, height, this._defaultNodeSize, 1, centerGraph);
                this._nodes.forEach(function (v, i) {
                    _this._descent.x[0][i] = v.x, _this._descent.x[1][i] = v.y;
                    if (v.bounds) {
                        v.bounds.setXCentre(v.x);
                        v.bounds.setYCentre(v.y);
                    }
                });
            }
        };
        Layout.prototype.resume = function () {
            return this.alpha(0.1);
        };
        Layout.prototype.stop = function () {
            return this.alpha(0);
        };
        Layout.prototype.prepareEdgeRouting = function (nodeMargin) {
            if (nodeMargin === void 0) { nodeMargin = 0; }
            this._visibilityGraph = new geom_1.TangentVisibilityGraph(this._nodes.map(function (v) {
                return v.bounds.inflate(-nodeMargin).vertices();
            }));
        };
        Layout.prototype.routeEdge = function (edge, ah, draw) {
            if (ah === void 0) { ah = 5; }
            var lineData = [];
            var vg2 = new geom_1.TangentVisibilityGraph(this._visibilityGraph.P, { V: this._visibilityGraph.V, E: this._visibilityGraph.E }), port1 = { x: edge.source.x, y: edge.source.y }, port2 = { x: edge.target.x, y: edge.target.y }, start = vg2.addPoint(port1, edge.source.index), end = vg2.addPoint(port2, edge.target.index);
            vg2.addEdgeIfVisible(port1, port2, edge.source.index, edge.target.index);
            if (typeof draw !== 'undefined') {
                draw(vg2);
            }
            var sourceInd = function (e) { return e.source.id; }, targetInd = function (e) { return e.target.id; }, length = function (e) { return e.length(); }, spCalc = new shortestpaths_1.Calculator(vg2.V.length, vg2.E, sourceInd, targetInd, length), shortestPath = spCalc.PathFromNodeToNode(start.id, end.id);
            if (shortestPath.length === 1 || shortestPath.length === vg2.V.length) {
                var route = rectangle_1.makeEdgeBetween(edge.source.innerBounds, edge.target.innerBounds, ah);
                lineData = [route.sourceIntersection, route.arrowStart];
            }
            else {
                var n = shortestPath.length - 2, p = vg2.V[shortestPath[n]].p, q = vg2.V[shortestPath[0]].p, lineData = [edge.source.innerBounds.rayIntersection(p.x, p.y)];
                for (var i = n; i >= 0; --i)
                    lineData.push(vg2.V[shortestPath[i]].p);
                lineData.push(rectangle_1.makeEdgeTo(q, edge.target.innerBounds, ah));
            }
            return lineData;
        };
        Layout.getSourceIndex = function (e) {
            return typeof e.source === 'number' ? e.source : e.source.index;
        };
        Layout.getTargetIndex = function (e) {
            return typeof e.target === 'number' ? e.target : e.target.index;
        };
        Layout.linkId = function (e) {
            return Layout.getSourceIndex(e) + "-" + Layout.getTargetIndex(e);
        };
        Layout.dragStart = function (d) {
            if (isGroup(d)) {
                Layout.storeOffset(d, Layout.dragOrigin(d));
            }
            else {
                Layout.stopNode(d);
                d.fixed |= 2;
            }
        };
        Layout.stopNode = function (v) {
            v.px = v.x;
            v.py = v.y;
        };
        Layout.storeOffset = function (d, origin) {
            if (typeof d.leaves !== 'undefined') {
                d.leaves.forEach(function (v) {
                    v.fixed |= 2;
                    Layout.stopNode(v);
                    v._dragGroupOffsetX = v.x - origin.x;
                    v._dragGroupOffsetY = v.y - origin.y;
                });
            }
            if (typeof d.groups !== 'undefined') {
                d.groups.forEach(function (g) { return Layout.storeOffset(g, origin); });
            }
        };
        Layout.dragOrigin = function (d) {
            if (isGroup(d)) {
                return {
                    x: d.bounds.cx(),
                    y: d.bounds.cy()
                };
            }
            else {
                return d;
            }
        };
        Layout.drag = function (d, position) {
            if (isGroup(d)) {
                if (typeof d.leaves !== 'undefined') {
                    d.leaves.forEach(function (v) {
                        d.bounds.setXCentre(position.x);
                        d.bounds.setYCentre(position.y);
                        v.px = v._dragGroupOffsetX + position.x;
                        v.py = v._dragGroupOffsetY + position.y;
                    });
                }
                if (typeof d.groups !== 'undefined') {
                    d.groups.forEach(function (g) { return Layout.drag(g, position); });
                }
            }
            else {
                d.px = position.x;
                d.py = position.y;
            }
        };
        Layout.dragEnd = function (d) {
            if (isGroup(d)) {
                if (typeof d.leaves !== 'undefined') {
                    d.leaves.forEach(function (v) {
                        Layout.dragEnd(v);
                        delete v._dragGroupOffsetX;
                        delete v._dragGroupOffsetY;
                    });
                }
                if (typeof d.groups !== 'undefined') {
                    d.groups.forEach(Layout.dragEnd);
                }
            }
            else {
                d.fixed &= ~6;
            }
        };
        Layout.mouseOver = function (d) {
            d.fixed |= 4;
            d.px = d.x, d.py = d.y;
        };
        Layout.mouseOut = function (d) {
            d.fixed &= ~4;
        };
        return Layout;
    }());
    exports.Layout = Layout;

    }(layout));

    var __extends$2 = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(adaptor$1, "__esModule", { value: true });
    var layout_1$3 = layout;
    var LayoutAdaptor = (function (_super) {
        __extends$2(LayoutAdaptor, _super);
        function LayoutAdaptor(options) {
            var _this = _super.call(this) || this;
            var o = options;
            if (o.trigger) {
                _this.trigger = o.trigger;
            }
            if (o.kick) {
                _this.kick = o.kick;
            }
            if (o.drag) {
                _this.drag = o.drag;
            }
            if (o.on) {
                _this.on = o.on;
            }
            _this.dragstart = _this.dragStart = layout_1$3.Layout.dragStart;
            _this.dragend = _this.dragEnd = layout_1$3.Layout.dragEnd;
            return _this;
        }
        LayoutAdaptor.prototype.trigger = function (e) { };
        LayoutAdaptor.prototype.kick = function () { };
        LayoutAdaptor.prototype.drag = function () { };
        LayoutAdaptor.prototype.on = function (eventType, listener) { return this; };
        return LayoutAdaptor;
    }(layout_1$3.Layout));
    adaptor$1.LayoutAdaptor = LayoutAdaptor;
    function adaptor(options) {
        return new LayoutAdaptor(options);
    }
    adaptor$1.adaptor = adaptor;

    var d3adaptor$2 = {};

    var d3v3adaptor = {};

    var __extends$1 = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(d3v3adaptor, "__esModule", { value: true });
    var layout_1$2 = layout;
    var D3StyleLayoutAdaptor$1 = (function (_super) {
        __extends$1(D3StyleLayoutAdaptor, _super);
        function D3StyleLayoutAdaptor() {
            var _this = _super.call(this) || this;
            _this.event = d3.dispatch(layout_1$2.EventType[layout_1$2.EventType.start], layout_1$2.EventType[layout_1$2.EventType.tick], layout_1$2.EventType[layout_1$2.EventType.end]);
            var d3layout = _this;
            _this.drag = function () {
                if (!drag) {
                    var drag = d3.behavior.drag()
                        .origin(layout_1$2.Layout.dragOrigin)
                        .on("dragstart.d3adaptor", layout_1$2.Layout.dragStart)
                        .on("drag.d3adaptor", function (d) {
                        layout_1$2.Layout.drag(d, d3.event);
                        d3layout.resume();
                    })
                        .on("dragend.d3adaptor", layout_1$2.Layout.dragEnd);
                }
                if (!arguments.length)
                    return drag;
                this
                    .call(drag);
            };
            return _this;
        }
        D3StyleLayoutAdaptor.prototype.trigger = function (e) {
            var d3event = { type: layout_1$2.EventType[e.type], alpha: e.alpha, stress: e.stress };
            this.event[d3event.type](d3event);
        };
        D3StyleLayoutAdaptor.prototype.kick = function () {
            var _this = this;
            d3.timer(function () { return _super.prototype.tick.call(_this); });
        };
        D3StyleLayoutAdaptor.prototype.on = function (eventType, listener) {
            if (typeof eventType === 'string') {
                this.event.on(eventType, listener);
            }
            else {
                this.event.on(layout_1$2.EventType[eventType], listener);
            }
            return this;
        };
        return D3StyleLayoutAdaptor;
    }(layout_1$2.Layout));
    d3v3adaptor.D3StyleLayoutAdaptor = D3StyleLayoutAdaptor$1;
    function d3adaptor$1() {
        return new D3StyleLayoutAdaptor$1();
    }
    d3v3adaptor.d3adaptor = d3adaptor$1;

    var d3v4adaptor = {};

    var __extends = (undefined && undefined.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    Object.defineProperty(d3v4adaptor, "__esModule", { value: true });
    var layout_1$1 = layout;
    var D3StyleLayoutAdaptor = (function (_super) {
        __extends(D3StyleLayoutAdaptor, _super);
        function D3StyleLayoutAdaptor(d3Context) {
            var _this = _super.call(this) || this;
            _this.d3Context = d3Context;
            _this.event = d3Context.dispatch(layout_1$1.EventType[layout_1$1.EventType.start], layout_1$1.EventType[layout_1$1.EventType.tick], layout_1$1.EventType[layout_1$1.EventType.end]);
            var d3layout = _this;
            _this.drag = function () {
                if (!drag) {
                    var drag = d3Context.drag()
                        .subject(layout_1$1.Layout.dragOrigin)
                        .on("start.d3adaptor", layout_1$1.Layout.dragStart)
                        .on("drag.d3adaptor", function (d) {
                        layout_1$1.Layout.drag(d, d3Context.event);
                        d3layout.resume();
                    })
                        .on("end.d3adaptor", layout_1$1.Layout.dragEnd);
                }
                if (!arguments.length)
                    return drag;
                arguments[0].call(drag);
            };
            return _this;
        }
        D3StyleLayoutAdaptor.prototype.trigger = function (e) {
            var d3event = { type: layout_1$1.EventType[e.type], alpha: e.alpha, stress: e.stress };
            this.event.call(d3event.type, d3event);
        };
        D3StyleLayoutAdaptor.prototype.kick = function () {
            var _this = this;
            var t = this.d3Context.timer(function () { return _super.prototype.tick.call(_this) && t.stop(); });
        };
        D3StyleLayoutAdaptor.prototype.on = function (eventType, listener) {
            if (typeof eventType === 'string') {
                this.event.on(eventType, listener);
            }
            else {
                this.event.on(layout_1$1.EventType[eventType], listener);
            }
            return this;
        };
        return D3StyleLayoutAdaptor;
    }(layout_1$1.Layout));
    d3v4adaptor.D3StyleLayoutAdaptor = D3StyleLayoutAdaptor;

    Object.defineProperty(d3adaptor$2, "__esModule", { value: true });
    var d3v3 = d3v3adaptor;
    var d3v4 = d3v4adaptor;
    function d3adaptor(d3Context) {
        if (!d3Context || isD3V3(d3Context)) {
            return new d3v3.D3StyleLayoutAdaptor();
        }
        return new d3v4.D3StyleLayoutAdaptor(d3Context);
    }
    d3adaptor$2.d3adaptor = d3adaptor;
    function isD3V3(d3Context) {
        var v3exp = /^3\./;
        return d3Context.version && d3Context.version.match(v3exp) !== null;
    }

    var gridrouter = {};

    Object.defineProperty(gridrouter, "__esModule", { value: true });
    var rectangle_1$1 = rectangle;
    var vpsc_1 = vpsc;
    var shortestpaths_1$1 = shortestpaths;
    var NodeWrapper = (function () {
        function NodeWrapper(id, rect, children) {
            this.id = id;
            this.rect = rect;
            this.children = children;
            this.leaf = typeof children === 'undefined' || children.length === 0;
        }
        return NodeWrapper;
    }());
    gridrouter.NodeWrapper = NodeWrapper;
    var Vert = (function () {
        function Vert(id, x, y, node, line) {
            if (node === void 0) { node = null; }
            if (line === void 0) { line = null; }
            this.id = id;
            this.x = x;
            this.y = y;
            this.node = node;
            this.line = line;
        }
        return Vert;
    }());
    gridrouter.Vert = Vert;
    var LongestCommonSubsequence = (function () {
        function LongestCommonSubsequence(s, t) {
            this.s = s;
            this.t = t;
            var mf = LongestCommonSubsequence.findMatch(s, t);
            var tr = t.slice(0).reverse();
            var mr = LongestCommonSubsequence.findMatch(s, tr);
            if (mf.length >= mr.length) {
                this.length = mf.length;
                this.si = mf.si;
                this.ti = mf.ti;
                this.reversed = false;
            }
            else {
                this.length = mr.length;
                this.si = mr.si;
                this.ti = t.length - mr.ti - mr.length;
                this.reversed = true;
            }
        }
        LongestCommonSubsequence.findMatch = function (s, t) {
            var m = s.length;
            var n = t.length;
            var match = { length: 0, si: -1, ti: -1 };
            var l = new Array(m);
            for (var i = 0; i < m; i++) {
                l[i] = new Array(n);
                for (var j = 0; j < n; j++)
                    if (s[i] === t[j]) {
                        var v = l[i][j] = (i === 0 || j === 0) ? 1 : l[i - 1][j - 1] + 1;
                        if (v > match.length) {
                            match.length = v;
                            match.si = i - v + 1;
                            match.ti = j - v + 1;
                        }
                    }
                    else
                        l[i][j] = 0;
            }
            return match;
        };
        LongestCommonSubsequence.prototype.getSequence = function () {
            return this.length >= 0 ? this.s.slice(this.si, this.si + this.length) : [];
        };
        return LongestCommonSubsequence;
    }());
    gridrouter.LongestCommonSubsequence = LongestCommonSubsequence;
    var GridRouter = (function () {
        function GridRouter(originalnodes, accessor, groupPadding) {
            var _this = this;
            if (groupPadding === void 0) { groupPadding = 12; }
            this.originalnodes = originalnodes;
            this.groupPadding = groupPadding;
            this.leaves = null;
            this.nodes = originalnodes.map(function (v, i) { return new NodeWrapper(i, accessor.getBounds(v), accessor.getChildren(v)); });
            this.leaves = this.nodes.filter(function (v) { return v.leaf; });
            this.groups = this.nodes.filter(function (g) { return !g.leaf; });
            this.cols = this.getGridLines('x');
            this.rows = this.getGridLines('y');
            this.groups.forEach(function (v) {
                return v.children.forEach(function (c) { return _this.nodes[c].parent = v; });
            });
            this.root = { children: [] };
            this.nodes.forEach(function (v) {
                if (typeof v.parent === 'undefined') {
                    v.parent = _this.root;
                    _this.root.children.push(v.id);
                }
                v.ports = [];
            });
            this.backToFront = this.nodes.slice(0);
            this.backToFront.sort(function (x, y) { return _this.getDepth(x) - _this.getDepth(y); });
            var frontToBackGroups = this.backToFront.slice(0).reverse().filter(function (g) { return !g.leaf; });
            frontToBackGroups.forEach(function (v) {
                var r = rectangle_1$1.Rectangle.empty();
                v.children.forEach(function (c) { return r = r.union(_this.nodes[c].rect); });
                v.rect = r.inflate(_this.groupPadding);
            });
            var colMids = this.midPoints(this.cols.map(function (r) { return r.pos; }));
            var rowMids = this.midPoints(this.rows.map(function (r) { return r.pos; }));
            var rowx = colMids[0], rowX = colMids[colMids.length - 1];
            var coly = rowMids[0], colY = rowMids[rowMids.length - 1];
            var hlines = this.rows.map(function (r) { return ({ x1: rowx, x2: rowX, y1: r.pos, y2: r.pos }); })
                .concat(rowMids.map(function (m) { return ({ x1: rowx, x2: rowX, y1: m, y2: m }); }));
            var vlines = this.cols.map(function (c) { return ({ x1: c.pos, x2: c.pos, y1: coly, y2: colY }); })
                .concat(colMids.map(function (m) { return ({ x1: m, x2: m, y1: coly, y2: colY }); }));
            var lines = hlines.concat(vlines);
            lines.forEach(function (l) { return l.verts = []; });
            this.verts = [];
            this.edges = [];
            hlines.forEach(function (h) {
                return vlines.forEach(function (v) {
                    var p = new Vert(_this.verts.length, v.x1, h.y1);
                    h.verts.push(p);
                    v.verts.push(p);
                    _this.verts.push(p);
                    var i = _this.backToFront.length;
                    while (i-- > 0) {
                        var node = _this.backToFront[i], r = node.rect;
                        var dx = Math.abs(p.x - r.cx()), dy = Math.abs(p.y - r.cy());
                        if (dx < r.width() / 2 && dy < r.height() / 2) {
                            p.node = node;
                            break;
                        }
                    }
                });
            });
            lines.forEach(function (l, li) {
                _this.nodes.forEach(function (v, i) {
                    v.rect.lineIntersections(l.x1, l.y1, l.x2, l.y2).forEach(function (intersect, j) {
                        var p = new Vert(_this.verts.length, intersect.x, intersect.y, v, l);
                        _this.verts.push(p);
                        l.verts.push(p);
                        v.ports.push(p);
                    });
                });
                var isHoriz = Math.abs(l.y1 - l.y2) < 0.1;
                var delta = function (a, b) { return isHoriz ? b.x - a.x : b.y - a.y; };
                l.verts.sort(delta);
                for (var i = 1; i < l.verts.length; i++) {
                    var u = l.verts[i - 1], v = l.verts[i];
                    if (u.node && u.node === v.node && u.node.leaf)
                        continue;
                    _this.edges.push({ source: u.id, target: v.id, length: Math.abs(delta(u, v)) });
                }
            });
        }
        GridRouter.prototype.avg = function (a) { return a.reduce(function (x, y) { return x + y; }) / a.length; };
        GridRouter.prototype.getGridLines = function (axis) {
            var columns = [];
            var ls = this.leaves.slice(0, this.leaves.length);
            while (ls.length > 0) {
                var overlapping = ls.filter(function (v) { return v.rect['overlap' + axis.toUpperCase()](ls[0].rect); });
                var col = {
                    nodes: overlapping,
                    pos: this.avg(overlapping.map(function (v) { return v.rect['c' + axis](); }))
                };
                columns.push(col);
                col.nodes.forEach(function (v) { return ls.splice(ls.indexOf(v), 1); });
            }
            columns.sort(function (a, b) { return a.pos - b.pos; });
            return columns;
        };
        GridRouter.prototype.getDepth = function (v) {
            var depth = 0;
            while (v.parent !== this.root) {
                depth++;
                v = v.parent;
            }
            return depth;
        };
        GridRouter.prototype.midPoints = function (a) {
            var gap = a[1] - a[0];
            var mids = [a[0] - gap / 2];
            for (var i = 1; i < a.length; i++) {
                mids.push((a[i] + a[i - 1]) / 2);
            }
            mids.push(a[a.length - 1] + gap / 2);
            return mids;
        };
        GridRouter.prototype.findLineage = function (v) {
            var lineage = [v];
            do {
                v = v.parent;
                lineage.push(v);
            } while (v !== this.root);
            return lineage.reverse();
        };
        GridRouter.prototype.findAncestorPathBetween = function (a, b) {
            var aa = this.findLineage(a), ba = this.findLineage(b), i = 0;
            while (aa[i] === ba[i])
                i++;
            return { commonAncestor: aa[i - 1], lineages: aa.slice(i).concat(ba.slice(i)) };
        };
        GridRouter.prototype.siblingObstacles = function (a, b) {
            var _this = this;
            var path = this.findAncestorPathBetween(a, b);
            var lineageLookup = {};
            path.lineages.forEach(function (v) { return lineageLookup[v.id] = {}; });
            var obstacles = path.commonAncestor.children.filter(function (v) { return !(v in lineageLookup); });
            path.lineages
                .filter(function (v) { return v.parent !== path.commonAncestor; })
                .forEach(function (v) { return obstacles = obstacles.concat(v.parent.children.filter(function (c) { return c !== v.id; })); });
            return obstacles.map(function (v) { return _this.nodes[v]; });
        };
        GridRouter.getSegmentSets = function (routes, x, y) {
            var vsegments = [];
            for (var ei = 0; ei < routes.length; ei++) {
                var route = routes[ei];
                for (var si = 0; si < route.length; si++) {
                    var s = route[si];
                    s.edgeid = ei;
                    s.i = si;
                    var sdx = s[1][x] - s[0][x];
                    if (Math.abs(sdx) < 0.1) {
                        vsegments.push(s);
                    }
                }
            }
            vsegments.sort(function (a, b) { return a[0][x] - b[0][x]; });
            var vsegmentsets = [];
            var segmentset = null;
            for (var i = 0; i < vsegments.length; i++) {
                var s = vsegments[i];
                if (!segmentset || Math.abs(s[0][x] - segmentset.pos) > 0.1) {
                    segmentset = { pos: s[0][x], segments: [] };
                    vsegmentsets.push(segmentset);
                }
                segmentset.segments.push(s);
            }
            return vsegmentsets;
        };
        GridRouter.nudgeSegs = function (x, y, routes, segments, leftOf, gap) {
            var n = segments.length;
            if (n <= 1)
                return;
            var vs = segments.map(function (s) { return new vpsc_1.Variable(s[0][x]); });
            var cs = [];
            for (var i = 0; i < n; i++) {
                for (var j = 0; j < n; j++) {
                    if (i === j)
                        continue;
                    var s1 = segments[i], s2 = segments[j], e1 = s1.edgeid, e2 = s2.edgeid, lind = -1, rind = -1;
                    if (x == 'x') {
                        if (leftOf(e1, e2)) {
                            if (s1[0][y] < s1[1][y]) {
                                lind = j, rind = i;
                            }
                            else {
                                lind = i, rind = j;
                            }
                        }
                    }
                    else {
                        if (leftOf(e1, e2)) {
                            if (s1[0][y] < s1[1][y]) {
                                lind = i, rind = j;
                            }
                            else {
                                lind = j, rind = i;
                            }
                        }
                    }
                    if (lind >= 0) {
                        cs.push(new vpsc_1.Constraint(vs[lind], vs[rind], gap));
                    }
                }
            }
            var solver = new vpsc_1.Solver(vs, cs);
            solver.solve();
            vs.forEach(function (v, i) {
                var s = segments[i];
                var pos = v.position();
                s[0][x] = s[1][x] = pos;
                var route = routes[s.edgeid];
                if (s.i > 0)
                    route[s.i - 1][1][x] = pos;
                if (s.i < route.length - 1)
                    route[s.i + 1][0][x] = pos;
            });
        };
        GridRouter.nudgeSegments = function (routes, x, y, leftOf, gap) {
            var vsegmentsets = GridRouter.getSegmentSets(routes, x, y);
            for (var i = 0; i < vsegmentsets.length; i++) {
                var ss = vsegmentsets[i];
                var events = [];
                for (var j = 0; j < ss.segments.length; j++) {
                    var s = ss.segments[j];
                    events.push({ type: 0, s: s, pos: Math.min(s[0][y], s[1][y]) });
                    events.push({ type: 1, s: s, pos: Math.max(s[0][y], s[1][y]) });
                }
                events.sort(function (a, b) { return a.pos - b.pos + a.type - b.type; });
                var open = [];
                var openCount = 0;
                events.forEach(function (e) {
                    if (e.type === 0) {
                        open.push(e.s);
                        openCount++;
                    }
                    else {
                        openCount--;
                    }
                    if (openCount == 0) {
                        GridRouter.nudgeSegs(x, y, routes, open, leftOf, gap);
                        open = [];
                    }
                });
            }
        };
        GridRouter.prototype.routeEdges = function (edges, nudgeGap, source, target) {
            var _this = this;
            var routePaths = edges.map(function (e) { return _this.route(source(e), target(e)); });
            var order = GridRouter.orderEdges(routePaths);
            var routes = routePaths.map(function (e) { return GridRouter.makeSegments(e); });
            GridRouter.nudgeSegments(routes, 'x', 'y', order, nudgeGap);
            GridRouter.nudgeSegments(routes, 'y', 'x', order, nudgeGap);
            GridRouter.unreverseEdges(routes, routePaths);
            return routes;
        };
        GridRouter.unreverseEdges = function (routes, routePaths) {
            routes.forEach(function (segments, i) {
                var path = routePaths[i];
                if (path.reversed) {
                    segments.reverse();
                    segments.forEach(function (segment) {
                        segment.reverse();
                    });
                }
            });
        };
        GridRouter.angleBetween2Lines = function (line1, line2) {
            var angle1 = Math.atan2(line1[0].y - line1[1].y, line1[0].x - line1[1].x);
            var angle2 = Math.atan2(line2[0].y - line2[1].y, line2[0].x - line2[1].x);
            var diff = angle1 - angle2;
            if (diff > Math.PI || diff < -Math.PI) {
                diff = angle2 - angle1;
            }
            return diff;
        };
        GridRouter.isLeft = function (a, b, c) {
            return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= 0;
        };
        GridRouter.getOrder = function (pairs) {
            var outgoing = {};
            for (var i = 0; i < pairs.length; i++) {
                var p = pairs[i];
                if (typeof outgoing[p.l] === 'undefined')
                    outgoing[p.l] = {};
                outgoing[p.l][p.r] = true;
            }
            return function (l, r) { return typeof outgoing[l] !== 'undefined' && outgoing[l][r]; };
        };
        GridRouter.orderEdges = function (edges) {
            var edgeOrder = [];
            for (var i = 0; i < edges.length - 1; i++) {
                for (var j = i + 1; j < edges.length; j++) {
                    var e = edges[i], f = edges[j], lcs = new LongestCommonSubsequence(e, f);
                    var u, vi, vj;
                    if (lcs.length === 0)
                        continue;
                    if (lcs.reversed) {
                        f.reverse();
                        f.reversed = true;
                        lcs = new LongestCommonSubsequence(e, f);
                    }
                    if ((lcs.si <= 0 || lcs.ti <= 0) &&
                        (lcs.si + lcs.length >= e.length || lcs.ti + lcs.length >= f.length)) {
                        edgeOrder.push({ l: i, r: j });
                        continue;
                    }
                    if (lcs.si + lcs.length >= e.length || lcs.ti + lcs.length >= f.length) {
                        u = e[lcs.si + 1];
                        vj = e[lcs.si - 1];
                        vi = f[lcs.ti - 1];
                    }
                    else {
                        u = e[lcs.si + lcs.length - 2];
                        vi = e[lcs.si + lcs.length];
                        vj = f[lcs.ti + lcs.length];
                    }
                    if (GridRouter.isLeft(u, vi, vj)) {
                        edgeOrder.push({ l: j, r: i });
                    }
                    else {
                        edgeOrder.push({ l: i, r: j });
                    }
                }
            }
            return GridRouter.getOrder(edgeOrder);
        };
        GridRouter.makeSegments = function (path) {
            function copyPoint(p) {
                return { x: p.x, y: p.y };
            }
            var isStraight = function (a, b, c) { return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.001; };
            var segments = [];
            var a = copyPoint(path[0]);
            for (var i = 1; i < path.length; i++) {
                var b = copyPoint(path[i]), c = i < path.length - 1 ? path[i + 1] : null;
                if (!c || !isStraight(a, b, c)) {
                    segments.push([a, b]);
                    a = b;
                }
            }
            return segments;
        };
        GridRouter.prototype.route = function (s, t) {
            var _this = this;
            var source = this.nodes[s], target = this.nodes[t];
            this.obstacles = this.siblingObstacles(source, target);
            var obstacleLookup = {};
            this.obstacles.forEach(function (o) { return obstacleLookup[o.id] = o; });
            this.passableEdges = this.edges.filter(function (e) {
                var u = _this.verts[e.source], v = _this.verts[e.target];
                return !(u.node && u.node.id in obstacleLookup
                    || v.node && v.node.id in obstacleLookup);
            });
            for (var i = 1; i < source.ports.length; i++) {
                var u = source.ports[0].id;
                var v = source.ports[i].id;
                this.passableEdges.push({
                    source: u,
                    target: v,
                    length: 0
                });
            }
            for (var i = 1; i < target.ports.length; i++) {
                var u = target.ports[0].id;
                var v = target.ports[i].id;
                this.passableEdges.push({
                    source: u,
                    target: v,
                    length: 0
                });
            }
            var getSource = function (e) { return e.source; }, getTarget = function (e) { return e.target; }, getLength = function (e) { return e.length; };
            var shortestPathCalculator = new shortestpaths_1$1.Calculator(this.verts.length, this.passableEdges, getSource, getTarget, getLength);
            var bendPenalty = function (u, v, w) {
                var a = _this.verts[u], b = _this.verts[v], c = _this.verts[w];
                var dx = Math.abs(c.x - a.x), dy = Math.abs(c.y - a.y);
                if (a.node === source && a.node === b.node || b.node === target && b.node === c.node)
                    return 0;
                return dx > 1 && dy > 1 ? 1000 : 0;
            };
            var shortestPath = shortestPathCalculator.PathFromNodeToNodeWithPrevCost(source.ports[0].id, target.ports[0].id, bendPenalty);
            var pathPoints = shortestPath.reverse().map(function (vi) { return _this.verts[vi]; });
            pathPoints.push(this.nodes[target.id].ports[0]);
            return pathPoints.filter(function (v, i) {
                return !(i < pathPoints.length - 1 && pathPoints[i + 1].node === source && v.node === source
                    || i > 0 && v.node === target && pathPoints[i - 1].node === target);
            });
        };
        GridRouter.getRoutePath = function (route, cornerradius, arrowwidth, arrowheight) {
            var result = {
                routepath: 'M ' + route[0][0].x + ' ' + route[0][0].y + ' ',
                arrowpath: ''
            };
            if (route.length > 1) {
                for (var i = 0; i < route.length; i++) {
                    var li = route[i];
                    var x = li[1].x, y = li[1].y;
                    var dx = x - li[0].x;
                    var dy = y - li[0].y;
                    if (i < route.length - 1) {
                        if (Math.abs(dx) > 0) {
                            x -= dx / Math.abs(dx) * cornerradius;
                        }
                        else {
                            y -= dy / Math.abs(dy) * cornerradius;
                        }
                        result.routepath += 'L ' + x + ' ' + y + ' ';
                        var l = route[i + 1];
                        var x0 = l[0].x, y0 = l[0].y;
                        var x1 = l[1].x;
                        var y1 = l[1].y;
                        dx = x1 - x0;
                        dy = y1 - y0;
                        var angle = GridRouter.angleBetween2Lines(li, l) < 0 ? 1 : 0;
                        var x2, y2;
                        if (Math.abs(dx) > 0) {
                            x2 = x0 + dx / Math.abs(dx) * cornerradius;
                            y2 = y0;
                        }
                        else {
                            x2 = x0;
                            y2 = y0 + dy / Math.abs(dy) * cornerradius;
                        }
                        var cx = Math.abs(x2 - x);
                        var cy = Math.abs(y2 - y);
                        result.routepath += 'A ' + cx + ' ' + cy + ' 0 0 ' + angle + ' ' + x2 + ' ' + y2 + ' ';
                    }
                    else {
                        var arrowtip = [x, y];
                        var arrowcorner1, arrowcorner2;
                        if (Math.abs(dx) > 0) {
                            x -= dx / Math.abs(dx) * arrowheight;
                            arrowcorner1 = [x, y + arrowwidth];
                            arrowcorner2 = [x, y - arrowwidth];
                        }
                        else {
                            y -= dy / Math.abs(dy) * arrowheight;
                            arrowcorner1 = [x + arrowwidth, y];
                            arrowcorner2 = [x - arrowwidth, y];
                        }
                        result.routepath += 'L ' + x + ' ' + y + ' ';
                        if (arrowheight > 0) {
                            result.arrowpath = 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1]
                                + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1];
                        }
                    }
                }
            }
            else {
                var li = route[0];
                var x = li[1].x, y = li[1].y;
                var dx = x - li[0].x;
                var dy = y - li[0].y;
                var arrowtip = [x, y];
                var arrowcorner1, arrowcorner2;
                if (Math.abs(dx) > 0) {
                    x -= dx / Math.abs(dx) * arrowheight;
                    arrowcorner1 = [x, y + arrowwidth];
                    arrowcorner2 = [x, y - arrowwidth];
                }
                else {
                    y -= dy / Math.abs(dy) * arrowheight;
                    arrowcorner1 = [x + arrowwidth, y];
                    arrowcorner2 = [x - arrowwidth, y];
                }
                result.routepath += 'L ' + x + ' ' + y + ' ';
                if (arrowheight > 0) {
                    result.arrowpath = 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1]
                        + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1];
                }
            }
            return result;
        };
        return GridRouter;
    }());
    gridrouter.GridRouter = GridRouter;

    var layout3d = {};

    Object.defineProperty(layout3d, "__esModule", { value: true });
    var shortestpaths_1 = shortestpaths;
    var descent_1 = descent;
    var rectangle_1 = rectangle;
    var linklengths_1 = linklengths;
    var Link3D = (function () {
        function Link3D(source, target) {
            this.source = source;
            this.target = target;
        }
        Link3D.prototype.actualLength = function (x) {
            var _this = this;
            return Math.sqrt(x.reduce(function (c, v) {
                var dx = v[_this.target] - v[_this.source];
                return c + dx * dx;
            }, 0));
        };
        return Link3D;
    }());
    layout3d.Link3D = Link3D;
    var Node3D = (function () {
        function Node3D(x, y, z) {
            if (x === void 0) { x = 0; }
            if (y === void 0) { y = 0; }
            if (z === void 0) { z = 0; }
            this.x = x;
            this.y = y;
            this.z = z;
        }
        return Node3D;
    }());
    layout3d.Node3D = Node3D;
    var Layout3D = (function () {
        function Layout3D(nodes, links, idealLinkLength) {
            var _this = this;
            if (idealLinkLength === void 0) { idealLinkLength = 1; }
            this.nodes = nodes;
            this.links = links;
            this.idealLinkLength = idealLinkLength;
            this.constraints = null;
            this.useJaccardLinkLengths = true;
            this.result = new Array(Layout3D.k);
            for (var i = 0; i < Layout3D.k; ++i) {
                this.result[i] = new Array(nodes.length);
            }
            nodes.forEach(function (v, i) {
                for (var _i = 0, _a = Layout3D.dims; _i < _a.length; _i++) {
                    var dim = _a[_i];
                    if (typeof v[dim] == 'undefined')
                        v[dim] = Math.random();
                }
                _this.result[0][i] = v.x;
                _this.result[1][i] = v.y;
                _this.result[2][i] = v.z;
            });
        }
        Layout3D.prototype.linkLength = function (l) {
            return l.actualLength(this.result);
        };
        Layout3D.prototype.start = function (iterations) {
            var _this = this;
            if (iterations === void 0) { iterations = 100; }
            var n = this.nodes.length;
            var linkAccessor = new LinkAccessor();
            if (this.useJaccardLinkLengths)
                linklengths_1.jaccardLinkLengths(this.links, linkAccessor, 1.5);
            this.links.forEach(function (e) { return e.length *= _this.idealLinkLength; });
            var distanceMatrix = (new shortestpaths_1.Calculator(n, this.links, function (e) { return e.source; }, function (e) { return e.target; }, function (e) { return e.length; })).DistanceMatrix();
            var D = descent_1.Descent.createSquareMatrix(n, function (i, j) { return distanceMatrix[i][j]; });
            var G = descent_1.Descent.createSquareMatrix(n, function () { return 2; });
            this.links.forEach(function (_a) {
                var source = _a.source, target = _a.target;
                return G[source][target] = G[target][source] = 1;
            });
            this.descent = new descent_1.Descent(this.result, D);
            this.descent.threshold = 1e-3;
            this.descent.G = G;
            if (this.constraints)
                this.descent.project = new rectangle_1.Projection(this.nodes, null, null, this.constraints).projectFunctions();
            for (var i = 0; i < this.nodes.length; i++) {
                var v = this.nodes[i];
                if (v.fixed) {
                    this.descent.locks.add(i, [v.x, v.y, v.z]);
                }
            }
            this.descent.run(iterations);
            return this;
        };
        Layout3D.prototype.tick = function () {
            this.descent.locks.clear();
            for (var i = 0; i < this.nodes.length; i++) {
                var v = this.nodes[i];
                if (v.fixed) {
                    this.descent.locks.add(i, [v.x, v.y, v.z]);
                }
            }
            return this.descent.rungeKutta();
        };
        Layout3D.dims = ['x', 'y', 'z'];
        Layout3D.k = Layout3D.dims.length;
        return Layout3D;
    }());
    layout3d.Layout3D = Layout3D;
    var LinkAccessor = (function () {
        function LinkAccessor() {
        }
        LinkAccessor.prototype.getSourceIndex = function (e) { return e.source; };
        LinkAccessor.prototype.getTargetIndex = function (e) { return e.target; };
        LinkAccessor.prototype.getLength = function (e) { return e.length; };
        LinkAccessor.prototype.setLength = function (e, l) { e.length = l; };
        return LinkAccessor;
    }());

    var batch = {};

    Object.defineProperty(batch, "__esModule", { value: true });
    var layout_1 = layout;
    var gridrouter_1 = gridrouter;
    function gridify(pgLayout, nudgeGap, margin, groupMargin) {
        pgLayout.cola.start(0, 0, 0, 10, false);
        var gridrouter = route(pgLayout.cola.nodes(), pgLayout.cola.groups(), margin, groupMargin);
        return gridrouter.routeEdges(pgLayout.powerGraph.powerEdges, nudgeGap, function (e) { return e.source.routerNode.id; }, function (e) { return e.target.routerNode.id; });
    }
    batch.gridify = gridify;
    function route(nodes, groups, margin, groupMargin) {
        nodes.forEach(function (d) {
            d.routerNode = {
                name: d.name,
                bounds: d.bounds.inflate(-margin)
            };
        });
        groups.forEach(function (d) {
            d.routerNode = {
                bounds: d.bounds.inflate(-groupMargin),
                children: (typeof d.groups !== 'undefined' ? d.groups.map(function (c) { return nodes.length + c.id; }) : [])
                    .concat(typeof d.leaves !== 'undefined' ? d.leaves.map(function (c) { return c.index; }) : [])
            };
        });
        var gridRouterNodes = nodes.concat(groups).map(function (d, i) {
            d.routerNode.id = i;
            return d.routerNode;
        });
        return new gridrouter_1.GridRouter(gridRouterNodes, {
            getChildren: function (v) { return v.children; },
            getBounds: function (v) { return v.bounds; }
        }, margin - groupMargin);
    }
    function powerGraphGridLayout(graph, size, grouppadding) {
        var powerGraph;
        graph.nodes.forEach(function (v, i) { return v.index = i; });
        new layout_1.Layout()
            .avoidOverlaps(false)
            .nodes(graph.nodes)
            .links(graph.links)
            .powerGraphGroups(function (d) {
            powerGraph = d;
            powerGraph.groups.forEach(function (v) { return v.padding = grouppadding; });
        });
        var n = graph.nodes.length;
        var edges = [];
        var vs = graph.nodes.slice(0);
        vs.forEach(function (v, i) { return v.index = i; });
        powerGraph.groups.forEach(function (g) {
            var sourceInd = g.index = g.id + n;
            vs.push(g);
            if (typeof g.leaves !== 'undefined')
                g.leaves.forEach(function (v) { return edges.push({ source: sourceInd, target: v.index }); });
            if (typeof g.groups !== 'undefined')
                g.groups.forEach(function (gg) { return edges.push({ source: sourceInd, target: gg.id + n }); });
        });
        powerGraph.powerEdges.forEach(function (e) {
            edges.push({ source: e.source.index, target: e.target.index });
        });
        new layout_1.Layout()
            .size(size)
            .nodes(vs)
            .links(edges)
            .avoidOverlaps(false)
            .linkDistance(30)
            .symmetricDiffLinkLengths(5)
            .convergenceThreshold(1e-4)
            .start(100, 0, 0, 0, false);
        return {
            cola: new layout_1.Layout()
                .convergenceThreshold(1e-3)
                .size(size)
                .avoidOverlaps(true)
                .nodes(graph.nodes)
                .links(graph.links)
                .groupCompactness(1e-4)
                .linkDistance(30)
                .symmetricDiffLinkLengths(5)
                .powerGraphGroups(function (d) {
                powerGraph = d;
                powerGraph.groups.forEach(function (v) {
                    v.padding = grouppadding;
                });
            }).start(50, 0, 100, 0, false),
            powerGraph: powerGraph
        };
    }
    batch.powerGraphGridLayout = powerGraphGridLayout;

    (function (exports) {
    function __export(m) {
        for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(adaptor$1);
    __export(d3adaptor$2);
    __export(descent);
    __export(geom);
    __export(gridrouter);
    __export(handledisconnected);
    __export(layout);
    __export(layout3d);
    __export(linklengths);
    __export(powergraph);
    __export(pqueue);
    __export(rbtree);
    __export(rectangle);
    __export(shortestpaths);
    __export(vpsc);
    __export(batch);

    }(dist));

    var webcola = /*@__PURE__*/getDefaultExportFromCjs(dist);

    const SideBar = ({ availableSizeProperties, sizeProperty, setSizeProperty, onExcludeChange, onIncludeChange, }) => {
        const [includeValue, setIncludeValue] = l("");
        const [excludeValue, setExcludeValue] = l("");
        const handleSizePropertyChange = (sizeProp) => () => {
            if (sizeProp !== sizeProperty) {
                setSizeProperty(sizeProp);
            }
        };
        const handleIncludeChange = (event) => {
            const value = event.currentTarget.value;
            setIncludeValue(value);
            onIncludeChange(value);
        };
        const handleExcludeChange = (event) => {
            const value = event.currentTarget.value;
            setExcludeValue(value);
            onExcludeChange(value);
        };
        return (e$1("aside", Object.assign({ className: "sidebar" }, { children: [e$1("div", Object.assign({ className: "size-selectors" }, { children: availableSizeProperties.length > 1 &&
                        availableSizeProperties.map((sizeProp) => {
                            const id = `selector-${sizeProp}`;
                            return (e$1("div", Object.assign({ className: "size-selector" }, { children: [e$1("input", { type: "radio", id: id, checked: sizeProp === sizeProperty, onChange: handleSizePropertyChange(sizeProp) }, void 0), e$1("label", Object.assign({ htmlFor: id }, { children: LABELS[sizeProp] }), void 0)] }), sizeProp));
                        }) }), void 0), e$1("div", Object.assign({ className: "module-filters" }, { children: [e$1("div", Object.assign({ className: "module-filter" }, { children: [e$1("label", Object.assign({ htmlFor: "module-filter-exclude" }, { children: "Exclude" }), void 0), e$1("input", { type: "text", id: "module-filter-exclude", value: excludeValue, onInput: handleExcludeChange }, void 0)] }), void 0), e$1("div", Object.assign({ className: "module-filter" }, { children: [e$1("label", Object.assign({ htmlFor: "module-filter-include" }, { children: "Include" }), void 0), e$1("input", { type: "text", id: "module-filter-include", value: includeValue, onInput: handleIncludeChange }, void 0)] }), void 0)] }), void 0)] }), void 0));
    };

    const throttleFilter = (callback, limit) => {
        let waiting = false;
        return (val) => {
            if (!waiting) {
                callback(val);
                waiting = true;
                setTimeout(() => {
                    waiting = false;
                }, limit);
            }
        };
    };
    const useFilter = () => {
        const [includeFilter, setIncludeFilter] = l("");
        const [excludeFilter, setExcludeFilter] = l("");
        const setIncludeFilterTrottled = d(() => throttleFilter(setIncludeFilter, 200), []);
        const setExcludeFilterTrottled = d(() => throttleFilter(setExcludeFilter, 200), []);
        const isModuleIncluded = d(() => {
            if (includeFilter === "") {
                return () => true;
            }
            try {
                const re = new RegExp(includeFilter);
                return ({ id }) => re.test(id);
            }
            catch (err) {
                return () => false;
            }
        }, [includeFilter]);
        const isModuleExcluded = d(() => {
            if (excludeFilter === "") {
                return () => false;
            }
            try {
                const re = new RegExp(excludeFilter);
                return ({ id }) => re.test(id);
            }
            catch (err) {
                return () => false;
            }
        }, [excludeFilter]);
        const isDefaultInclude = includeFilter === "";
        const getModuleFilterMultiplier = d(() => {
            return (data) => {
                if (isDefaultInclude) {
                    return isModuleExcluded(data) ? 0 : 1;
                }
                return isModuleExcluded(data) && !isModuleIncluded(data) ? 0 : 1;
            };
        }, [isDefaultInclude, isModuleExcluded, isModuleIncluded]);
        return {
            getModuleFilterMultiplier,
            includeFilter,
            excludeFilter,
            setExcludeFilter: setExcludeFilterTrottled,
            setIncludeFilter: setIncludeFilterTrottled,
        };
    };

    var bytes$1 = {exports: {}};

    /*!
     * bytes
     * Copyright(c) 2012-2014 TJ Holowaychuk
     * Copyright(c) 2015 Jed Watson
     * MIT Licensed
     */

    /**
     * Module exports.
     * @public
     */

    bytes$1.exports = bytes;
    var format_1 = bytes$1.exports.format = format;
    bytes$1.exports.parse = parse;

    /**
     * Module variables.
     * @private
     */

    var formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g;

    var formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/;

    var map = {
      b:  1,
      kb: 1 << 10,
      mb: 1 << 20,
      gb: 1 << 30,
      tb: Math.pow(1024, 4),
      pb: Math.pow(1024, 5),
    };

    var parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;

    /**
     * Convert the given value in bytes into a string or parse to string to an integer in bytes.
     *
     * @param {string|number} value
     * @param {{
     *  case: [string],
     *  decimalPlaces: [number]
     *  fixedDecimals: [boolean]
     *  thousandsSeparator: [string]
     *  unitSeparator: [string]
     *  }} [options] bytes options.
     *
     * @returns {string|number|null}
     */

    function bytes(value, options) {
      if (typeof value === 'string') {
        return parse(value);
      }

      if (typeof value === 'number') {
        return format(value, options);
      }

      return null;
    }

    /**
     * Format the given value in bytes into a string.
     *
     * If the value is negative, it is kept as such. If it is a float,
     * it is rounded.
     *
     * @param {number} value
     * @param {object} [options]
     * @param {number} [options.decimalPlaces=2]
     * @param {number} [options.fixedDecimals=false]
     * @param {string} [options.thousandsSeparator=]
     * @param {string} [options.unit=]
     * @param {string} [options.unitSeparator=]
     *
     * @returns {string|null}
     * @public
     */

    function format(value, options) {
      if (!Number.isFinite(value)) {
        return null;
      }

      var mag = Math.abs(value);
      var thousandsSeparator = (options && options.thousandsSeparator) || '';
      var unitSeparator = (options && options.unitSeparator) || '';
      var decimalPlaces = (options && options.decimalPlaces !== undefined) ? options.decimalPlaces : 2;
      var fixedDecimals = Boolean(options && options.fixedDecimals);
      var unit = (options && options.unit) || '';

      if (!unit || !map[unit.toLowerCase()]) {
        if (mag >= map.pb) {
          unit = 'PB';
        } else if (mag >= map.tb) {
          unit = 'TB';
        } else if (mag >= map.gb) {
          unit = 'GB';
        } else if (mag >= map.mb) {
          unit = 'MB';
        } else if (mag >= map.kb) {
          unit = 'KB';
        } else {
          unit = 'B';
        }
      }

      var val = value / map[unit.toLowerCase()];
      var str = val.toFixed(decimalPlaces);

      if (!fixedDecimals) {
        str = str.replace(formatDecimalsRegExp, '$1');
      }

      if (thousandsSeparator) {
        str = str.split('.').map(function (s, i) {
          return i === 0
            ? s.replace(formatThousandsRegExp, thousandsSeparator)
            : s
        }).join('.');
      }

      return str + unitSeparator + unit;
    }

    /**
     * Parse the string value into an integer in bytes.
     *
     * If no unit is given, it is assumed the value is in bytes.
     *
     * @param {number|string} val
     *
     * @returns {number|null}
     * @public
     */

    function parse(val) {
      if (typeof val === 'number' && !isNaN(val)) {
        return val;
      }

      if (typeof val !== 'string') {
        return null;
      }

      // Test if the string passed is valid
      var results = parseRegExp.exec(val);
      var floatValue;
      var unit = 'b';

      if (!results) {
        // Nothing could be extracted from the given string
        floatValue = parseInt(val, 10);
        unit = 'b';
      } else {
        // Retrieve the value and the unit
        floatValue = parseFloat(results[1]);
        unit = results[4].toLowerCase();
      }

      return Math.floor(map[unit] * floatValue);
    }

    const Tooltip_marginX = 10;
    const Tooltip_marginY = 30;
    const Tooltip = ({ node, visible, sizeProperty }) => {
        const { availableSizeProperties, data } = F(StaticContext);
        const ref = s(null);
        const [style, setStyle] = l({});
        const content = d(() => {
            if (!node)
                return null;
            return (e$1(d$1, { children: [e$1("div", { children: node.id }, void 0), availableSizeProperties.map((sizeProp) => {
                        var _a, _b;
                        if (sizeProp === sizeProperty) {
                            return (e$1("div", { children: e$1("b", { children: [LABELS[sizeProp], ": ", format_1((_a = node[sizeProp]) !== null && _a !== void 0 ? _a : 0)] }, void 0) }, void 0));
                        }
                        else {
                            return (e$1("div", { children: [LABELS[sizeProp], ": ", format_1((_b = node[sizeProp]) !== null && _b !== void 0 ? _b : 0)] }, void 0));
                        }
                    }), node.uid && (e$1("div", { children: [e$1("div", { children: [e$1("b", { children: "Imported By" }, void 0), ":"] }, void 0), data.nodeMetas[node.uid].importedBy.map(({ uid }) => {
                                const { id } = data.nodeMetas[uid];
                                return e$1("div", { children: id }, id);
                            })] }, void 0))] }, void 0));
        }, [availableSizeProperties, data, node, sizeProperty]);
        const updatePosition = (mouseCoords) => {
            if (!ref.current)
                return;
            const pos = {
                left: mouseCoords.x + Tooltip_marginX,
                top: mouseCoords.y + Tooltip_marginY,
            };
            const boundingRect = ref.current.getBoundingClientRect();
            if (pos.left + boundingRect.width > window.innerWidth) {
                // Shifting horizontally
                pos.left = window.innerWidth - boundingRect.width;
            }
            if (pos.top + boundingRect.height > window.innerHeight) {
                // Flipping vertically
                pos.top = mouseCoords.y - Tooltip_marginY - boundingRect.height;
            }
            setStyle(pos);
        };
        y(() => {
            const handleMouseMove = (event) => {
                updatePosition({
                    x: event.pageX,
                    y: event.pageY,
                });
            };
            document.addEventListener("mousemove", handleMouseMove, true);
            return () => {
                document.removeEventListener("mousemove", handleMouseMove, true);
            };
        }, []);
        return (e$1("div", Object.assign({ className: `tooltip ${visible ? "" : "tooltip-hidden"}`, ref: ref, style: style }, { children: content }), void 0));
    };

    const COLOR_DEFAULT_OWN_SOURCE = "#487ea4";
    const COLOR_DEFAULT_VENDOR_SOURCE = "#599e59";
    const COLOR_BASE = "#cecece";

    const Network = ({ links, nodes, groups, onNodeHover }) => {
        const { width, height } = F(StaticContext);
        return (e$1("svg", Object.assign({ xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${width} ${height}` }, { children: [e$1("g", { children: Object.entries(groups).map(([name, group]) => {
                        const bounds = group.bounds;
                        return (e$1("rect", { stroke: "#999", "stroke-opacity": "0.6", opacity: "0.6", fill: COLOR_BASE, rx: 5, ry: 5, x: bounds === null || bounds === void 0 ? void 0 : bounds.x, y: bounds === null || bounds === void 0 ? void 0 : bounds.y, width: bounds === null || bounds === void 0 ? void 0 : bounds.width(), height: bounds === null || bounds === void 0 ? void 0 : bounds.height() }, name));
                    }) }, void 0), e$1("g", Object.assign({ stroke: "#fff", "stroke-opacity": "0.9" }, { children: links.map((link) => {
                        return (e$1("line", { "stroke-width": "1", x1: link.source.x, y1: link.source.y, x2: link.target.x, y2: link.target.y }, `${link.source.uid} - ${link.target.uid}`));
                    }) }), void 0), e$1("g", Object.assign({ stroke: "#fff", "stroke-width": "1.5" }, { children: nodes.map((node) => {
                        return (e$1("circle", { r: node.radius, fill: node.color, cx: node.x, cy: node.y, onMouseOver: (evt) => {
                                evt.stopPropagation();
                                onNodeHover(node);
                            } }, node.uid));
                    }) }), void 0)] }), void 0));
    };

    const Chart = ({ sizeProperty, links, nodes, groups }) => {
        const [showTooltip, setShowTooltip] = l(false);
        const [tooltipNode, setTooltipNode] = l(undefined);
        y(() => {
            const handleMouseOut = () => {
                setShowTooltip(false);
            };
            document.addEventListener("mouseover", handleMouseOut);
            return () => {
                document.removeEventListener("mouseover", handleMouseOut);
            };
        }, []);
        return (e$1(d$1, { children: [e$1(Network, { links: links, nodes: nodes, groups: groups, onNodeHover: (node) => {
                        setTooltipNode(node);
                        setShowTooltip(true);
                    } }, void 0), e$1(Tooltip, { visible: showTooltip, node: tooltipNode, sizeProperty: sizeProperty }, void 0)] }, void 0));
    };

    const NODE_MODULES = /.*(?:\/|\\\\)?node_modules(?:\/|\\\\)([^/\\]+)(?:\/|\\\\).+/;

    const getModuleColor = ({ renderedLength, id }) => renderedLength === 0 ? COLOR_BASE : NODE_MODULES.test(id) ? COLOR_DEFAULT_VENDOR_SOURCE : COLOR_DEFAULT_OWN_SOURCE;

    const Main = () => {
        var _a, _b;
        const { availableSizeProperties, nodes, data, width, height } = F(StaticContext);
        const [sizeProperty, setSizeProperty] = l(availableSizeProperties[0]);
        const { getModuleFilterMultiplier, setExcludeFilter, setIncludeFilter } = useFilter();
        const sizeScale = d(() => {
            const maxLines = max(Object.values(nodes), (d) => d[sizeProperty]);
            const size = sqrt().domain([1, maxLines]).range([5, 30]);
            return size;
        }, [nodes, sizeProperty]);
        const processedNodes = Object.values(nodes)
            .map((node) => {
            const radius = sizeScale(node[sizeProperty]) + 1;
            return Object.assign(Object.assign({}, node), { width: radius * 2, height: radius * 2, radius, color: getModuleColor(node) });
        })
            .filter((networkNode) => getModuleFilterMultiplier(networkNode) === 1);
        const groups = {};
        for (const node of processedNodes) {
            const match = NODE_MODULES.exec(node.id);
            if (match) {
                const [, nodeModuleName] = match;
                groups[nodeModuleName] = (_a = groups[nodeModuleName]) !== null && _a !== void 0 ? _a : { leaves: [], padding: 1 };
                (_b = groups[nodeModuleName].leaves) === null || _b === void 0 ? void 0 : _b.push(node);
            }
        }
        const nodesCache = new Map(processedNodes.map((d) => [d.uid, d]));
        // webcola has weird types, layour require array of links to Node references, but Nodes are computed from later
        const links = Object.entries(data.nodeMetas)
            .flatMap(([sourceUid, { imported }]) => {
            return imported.map(({ uid: targetUid }) => {
                return {
                    source: nodesCache.get(sourceUid),
                    target: nodesCache.get(targetUid),
                    value: 1,
                };
            });
        })
            .filter(({ source, target }) => {
            return source && target;
        });
        const cola = webcola.adaptor({}).size([width, height]);
        const paddingX = 20;
        const paddingY = 20;
        const pageBounds = {
            x: paddingX,
            y: paddingY,
            width: width - paddingX,
            height: height - paddingY,
        };
        const realGraphNodes = processedNodes.slice(0);
        const topLeft = { x: pageBounds.x, y: pageBounds.y, fixed: 1 };
        const tlIndex = processedNodes.push(topLeft) - 1;
        const bottomRight = {
            x: pageBounds.x + pageBounds.width,
            y: pageBounds.y + pageBounds.height,
            fixed: 1,
        };
        const brIndex = processedNodes.push(bottomRight) - 1;
        const constraints = [];
        for (let i = 0; i < realGraphNodes.length; i++) {
            const node = realGraphNodes[i];
            constraints.push({
                axis: "x",
                type: "separation",
                left: tlIndex,
                right: i,
                gap: node.radius,
            });
            constraints.push({
                axis: "y",
                type: "separation",
                left: tlIndex,
                right: i,
                gap: node.radius,
            });
            constraints.push({
                axis: "x",
                type: "separation",
                left: i,
                right: brIndex,
                gap: node.radius,
            });
            constraints.push({
                axis: "y",
                type: "separation",
                left: i,
                right: brIndex,
                gap: node.radius,
            });
        }
        cola
            .nodes(processedNodes)
            .links(links)
            //.groups(Object.values(groups))
            .groupCompactness(1e-3)
            .constraints(constraints)
            .jaccardLinkLengths(50, 0.7)
            .avoidOverlaps(true)
            .handleDisconnected(false)
            .start(30, 30, 30, 30, false, true)
            .stop();
        return (e$1(d$1, { children: [e$1(SideBar, { sizeProperty: sizeProperty, availableSizeProperties: availableSizeProperties, setSizeProperty: setSizeProperty, onExcludeChange: setExcludeFilter, onIncludeChange: setIncludeFilter }, void 0), e$1(Chart, { nodes: realGraphNodes, groups: {}, links: links, sizeProperty: sizeProperty }, void 0)] }, void 0));
    };

    const StaticContext = D({});
    const createNodeInfo = (data, availableSizeProperties, uid) => {
        var _a;
        const meta = data.nodeMetas[uid];
        const entries = Object.values(meta.moduleParts).map((partUid) => data.nodeParts[partUid]);
        const sizes = Object.fromEntries(availableSizeProperties.map((key) => [key, 0]));
        for (const renderInfo of entries) {
            for (const sizeKey of availableSizeProperties) {
                sizes[sizeKey] += (_a = renderInfo[sizeKey]) !== null && _a !== void 0 ? _a : 0;
            }
        }
        return Object.assign(Object.assign({ uid }, sizes), meta);
    };
    const drawChart = (parentNode, data, width, height) => {
        const availableSizeProperties = getAvailableSizeOptions(data.options);
        const nodes = {};
        for (const uid of Object.keys(data.nodeMetas)) {
            nodes[uid] = createNodeInfo(data, availableSizeProperties, uid);
        }
        S(e$1(StaticContext.Provider, Object.assign({ value: {
                data,
                availableSizeProperties,
                width,
                height,
                nodes,
            } }, { children: e$1(Main, {}, void 0) }), void 0), parentNode);
    };

    exports.StaticContext = StaticContext;
    exports["default"] = drawChart;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({});
//# sourceMappingURL=network.js.map
