// https://github.com/y21/embedded-console
// c733011

const EmbeddedConsole = (() => {
  const placeholders = new Set([...'oOdisf']);

  const COLLAPSED_CHAR = '…';
  const COLLAPSED_ARROW_RAW = '⯈';
  const EXPANDED_ARROW_RAW = '⯆';
  const MAX_COLLAPSED_PROPERTIES = 5;

  const ClassNames = Object.freeze({
    NULLISH: 'ec-nullish',
    STRING: 'ec-string',
    // Strings in object literals have the same style as regular expressions
    STRING_OBJECT: 'ec-regexp',
    NUMERIC: 'ec-numeric',
    REGEXP: 'ec-regexp',
    OBJECT: 'ec-object',
    FUNCTION: 'ec-function',
    // Object properties that are not enumerable have a pink-ish color
    OBJECT_HIDDEN_PROPERTY: 'ec-hidden',
    // Set and Map both have the same style as objects
    // They have separate properties so it will be easier to change it
    SET: 'ec-object',
    MAP: 'ec-object',
    FUNCTION_SIGNATURE: 'ec-function-signature',
    ARROW: 'ec-collapse-arrow',
    // All other "unknown" types have the same style as regular strings
    DEFAULT: 'ec-string',

    WARNING: 'ec-warning',
    LOG: 'ec-log',
    ERROR: 'ec-error',
    ENTRY: 'ec-entry',
    STACK: 'ec-stack'
  });

  // The reason for why we're storing references to native functions in here is because
  // the user can override these functions and we would end up calling a modified function
  // which could potentially return a bad string that contains HTML and we can't escape it
  // This way we know that we're storing real native, unmodified functions/objects
  // === vvvvvvvv ===
  // TL;DR we want to make sure that if the user decides to overwrite natives after this code has run, this shouldn't be affected
  const native = {
    arrayFrom: Array.from,
    isArray: Array.isArray,
    arrayMap: Array.prototype.map,
    arrayJoin: Array.prototype.join,
    arraySlice: Array.prototype.slice,
    arrayFindIndex: Array.prototype.findIndex,
    objToString: Object.prototype.toString,
    String: String,
    mathMin: Math.min,
    substr: String.prototype.substr,
    replace: String.prototype.replace,
    stringIndexOf: String.prototype.indexOf,
    stringLastIndexOf: String.prototype.lastIndexOf,
    stringSplit: String.prototype.split,
    stringIncludes: String.prototype.includes,
    stringSlice: String.prototype.slice,
    WeakSet: WeakSet,
    WeakMap: WeakMap,
    Error: Error,
    Map: Map,
    getOwnPropertyDescriptors: Object.getOwnPropertyDescriptors,
    getOwnPropertyNames: Object.getOwnPropertyNames,
    iterator: Array.prototype[Symbol.iterator],
    setHas: Set.prototype.has,
    setAdd: Set.prototype.add,
    weakSetHas: WeakSet.prototype.has,
    weakSetAdd: WeakSet.prototype.add,
    weakMapSet: WeakMap.prototype.set, // TODO: check if it exists
    mapSet: Map.prototype.set,
    mapGet: Map.prototype.get,
    mapDelete: Map.prototype.delete,
    performanceNow: typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now // Fall back to Date.now()
  };

  // Common HTML elements used in embedded-console
  const FUNCTION_SIGNATURE_PREFIX = wrapInSpan(ClassNames.FUNCTION_SIGNATURE, 'ƒ ', false);
  const COLLAPSED_ARROW = wrapInSpan(ClassNames.ARROW, COLLAPSED_ARROW_RAW, false);
  const EXPANDED_ARROW = wrapInSpan(ClassNames.ARROW, EXPANDED_ARROW_RAW, false);

  // Helper functions for getting the type of a value
  const is = {
    nullish: (value) => value === null || value === undefined,
    number: (value) => typeof value === 'number',
    bool: (value) => typeof value === 'boolean',
    string: (value) => typeof value === 'string',
    bigint: (value) => typeof value === 'bigint',
    function: (value) => typeof value === 'function',
    array: (value) => native.isArray(value),
    error: (value) => value instanceof Error,
    regexp: (value) => value instanceof RegExp,
    set: (value) => value instanceof Set,
    map: (value) => value instanceof Map,
    weakset: (value) => value instanceof WeakSet,
    weakmap: (value) => value instanceof WeakMap,
    weak(value) {
      return this.weakset(value) || this.weakmap(value);
    },
    loseObject(value) {
      return !this.nullish(value) && typeof value === 'object'
    },
    strictObject(value) {
      return this.loseObject(value) && !native.isArray(value)
    },
  };

  // Attempts to return the context of this .log() call
  // This is used to print the line number
  function getContextLine(fn) {
    try {
      const Error = native.Error;

      const stack = native.stringSplit.call(new Error().stack, '\n');

      const lineIdx = native.arrayFindIndex.call(stack, (x) => native.stringIncludes.call(x, `${fn} (`));

      const fnCtx = native.substr.call(stack[lineIdx + 1], 7); // 4 spaces + 'at'.length + 1 space = 7

      const charIdx = native.stringIndexOf.call(fnCtx, '(');

      const fullCtx = native.stringSlice.call(fnCtx, charIdx + 1, charIdx >= 0 ? -1 : fnCtx.length);

      const lastPath = native.stringLastIndexOf.call(fullCtx, '/');

      const shortenedCtx = lastPath >= 0 ? native.substr.call(fullCtx, lastPath + 1) : fullCtx;

      return native.replace.call(
        native.stringSlice.call(shortenedCtx, 0, native.stringLastIndexOf.call(shortenedCtx, ':')),
        '<anonymous>',
        'VM'
      );
    } catch (e) {
      console.error('Failed to get stack', e);
      return 'VM:1'; // Just default to VM:1 if an error occurred
    }
  }

  // Escapes a string ("<b>" becomes "&lt;b&gt;") to prevent XSS
  function escapeHtml(value) {
    if (typeof value !== 'string') value = native.String(value);

    let result = '';
    for (let i = 0; i < value.length; ++i) {
      const char = value[i];

      switch (char) {
        case '<':
          result += '&lt;';
          break;
        case '>':
          result += '&gt;';
          break;
        case ' ':
          result += '&nbsp;';
          break;
        case '\n':
          result += '<br />';
          break;
        default:
          result += char;
          break;
      }
    }
    return result;
  }

  // Helper function to escape HTML and wrap element in a span element
  function wrapInSpan(className, value, doEscape = true) {
    const escaped = doEscape ? escapeHtml(value) : value;

    return `<span class="${className}">${escaped}</span>`;
  }

  // Ensures a string has a limited number of characters
  function trimString(str, maxLen = 100) {
    const len = native.mathMin(str.length, maxLen);

    return native.substr.call(str, 0, len) + (str.length > maxLen ? COLLAPSED_CHAR : '');
  }

  // Inspects any JavaScript value and returns it as an HTML string
  function inspect(
    value,
    visited = new native.WeakSet(),
    inObject = false,
    collapsed = true
  ) {
    const self = (value, inObject, collapsed) => inspect(value, visited, inObject, collapsed);
    const selfRecursive = (value) => {
      visited.add(value);
      return recursiveInspect(value, visited, inObject, collapsed);
    };
    const ARROW = collapsed ? COLLAPSED_ARROW : EXPANDED_ARROW;

    if (is.string(value)) {
      if (inObject) {
        // Strings in object literals look different:
        // They are surrounded by double quotes and look like RegExp literals
        // To see the difference, run this in chrome console:
        // console.log('test') // console.log(['test'])

        // Chrome also cuts strings if they are too long
        return wrapInSpan(ClassNames.STRING_OBJECT, `"${trimString(value)}"`);
      }

      return wrapInSpan(ClassNames.STRING, value);
    }

    else if (is.nullish(value)) {
      return wrapInSpan(ClassNames.NULLISH, value);
    }

    else if (is.error(value)) {
      // Error objects are special cases and need to be handled
      // since otherwise they'd be inspected and treated as a regular object
      // Chrome console seems to just stringify it, rather than fully inspecting
      return wrapInSpan(ClassNames.DEFAULT, value.stack || value);
    }

    else if (is.regexp(value)) {
      return wrapInSpan(ClassNames.REGEXP, value);
    }

    else if (is.set(value)) {
      // It's possible that the given object with a Set prototype has a `size` property being an HTML string
      // So we need to escape/inspect it as it could lead to XSS
      // Example: `.log({ __proto__: Map.prototype, size: '<b>a</b>', entries: () => [] })` would interpret size value as an HTML string
      const prefix = `Set(${self(value.size, true)})`;

      // Yeah it's ugly, but we can't use Array.from/Array.prototype.map/...
      const inspected = native.arrayJoin.call(
        native.arrayMap.call(
          native.arrayFrom(value.keys()),
          (k) => self(k, false)
        ),
        ', '
      );

      const fmt = `${prefix} {${inspected}}`;

      return wrapInSpan(ClassNames.SET, fmt, false);
    }

    else if (is.map(value)) {
      // See above why we're inspecting the size property
      const prefix = `Map(${self(value.size, true)})`;

      const inspected = native.arrayJoin.call(
        native.arrayMap.call(
          native.arrayFrom(value.entries()),
          ([k, v]) => `${self(k, true)} => ${self(v, true)}`
        ),
        ', '
      );

      const fmt = `${prefix} {${inspected}}`;

      return wrapInSpan(ClassNames.MAP, fmt, false);
    }

    else if (is.strictObject(value)) {

      let result;
      if (is.weak(value)) {
        // `WeakSet`s and `WeakMap`s are special cases, since we can't inspect them
        // All elements are weak references, meaning we can't access them
        // If we were able to, GC wouldn't be able to ever free them
        // The following isn't what Chrome does, but it replicates node inspect
        result = escapeHtml('{ <items unknown> }');
      } else {
        result = selfRecursive(value);
      }

      let prefix = `${ARROW} `;

      const valueConstructor = value.constructor;
      // Constructor name could be HTML, so we need to escape this, too
      if (valueConstructor && valueConstructor !== Object) prefix += `${self(valueConstructor.name)} `;

      // We can't escape HTML here since that would break formatting for nested elements
      // Individual key/values are already escaped
      return wrapInSpan(ClassNames.OBJECT, prefix + result, false);
    }

    else if (is.array(value)) {
      const result = selfRecursive(value);
      let prefix = `${ARROW} `;

      if (value.length >= 2) prefix += `(${self(value.length, true)}) `;

      return wrapInSpan(ClassNames.OBJECT, prefix + result, false);
    }

    else if (is.function(value)) {
      const { name } = value;

      if (name) {
        // AFAIK, you can't set Function.prototype.name to a string that could be HTML, so we don't need to escape anything here
        let val = native.String(value);
        if (inObject) val = `${name}()`;

        return FUNCTION_SIGNATURE_PREFIX + wrapInSpan(ClassNames.FUNCTION, trimString(val));
      }
      else return wrapInSpan(ClassNames.FUNCTION, `() => ${COLLAPSED_CHAR}`);
    }

    else if (is.number(value) || is.bool(value)) {
      return wrapInSpan(ClassNames.NUMERIC, value);
    }

    else if (is.bigint(value)) {
      // BigInt literals have suffix "n"
      return wrapInSpan(ClassNames.STRING, value + 'n');
    }

    else {
      return wrapInSpan(ClassNames.DEFAULT, value);
    }
  }

  // "Internal properties" are properties that will be interpreted as object keys, regardless if the value is an array or object
  // No need to use native.Set since it would make no difference (same scope, will be evaluated right after)
  const internalProperties = new Set(['length']);

  // Inspect function specifically for objects and arrays
  // Relies on recursion to get all properties and uses a WeakSet
  // to prevent following cirular references
  function recursiveInspect(
    obj,
    visited = new native.WeakSet(),
    inObject,
    collapsed
  ) {
    if (!is.loseObject(obj)) return inspect(obj, visited, inObject, collapsed);

    const isArray = is.array(obj);

    let str = '';

    const descriptors = native.getOwnPropertyDescriptors(obj);
    const keys = native.getOwnPropertyNames(obj);

    let count = 0;

    for (const key of native.iterator.call(keys)) {
      count++;

      // Chrome only displays up to 5 properties in collapsed view
      if (collapsed && count >= MAX_COLLAPSED_PROPERTIES) {
        str += `, ${COLLAPSED_CHAR}`;
        break;
      }

      const descriptor = descriptors[key];

      let result;

      // Getters might do some heavy work or even throw an error, so we signalise it using [Getter] 
      if (descriptor && typeof descriptor.get === 'function') {
        result = `${FUNCTION_SIGNATURE_PREFIX} [Getter]`;
      } else {
        // We know it's not a getter so we can safely read its value
        const value = obj[key];

        if (native.weakSetHas.call(visited, value)) {
          result = '[Circular]';
        } else {
          if (is.loseObject(value)) {
            native.weakSetAdd.call(visited, value);
          }

          result = inspect(value, visited, true, collapsed);
        }
      }

      if (str.length > 0) str += ', ';

      // If the object/array is expanded, we want to make the output a bit cleaner by adding linebreaks after each property
      if (!collapsed) str += '<br />';

      const hasInternalProperty = native.setHas.call(internalProperties, key);
      if (!isArray || hasInternalProperty) {
        let escapedKey = escapeHtml(key);
        if (hasInternalProperty) escapedKey = `[${escapedKey}]`;

        if (descriptor && !descriptor.enumerable) {
          // Property not enumerable, so we style it to signalise it's "hidden"
          str += wrapInSpan(ClassNames.OBJECT_HIDDEN_PROPERTY, escapedKey, false) + ': ' + result;
        } else {
          str += escapedKey + ': ' + result;
        }
      } else {
        str += result;
      }
    }

    return !isArray ? `{${str}}` : `[${str}]`;
  }

  // Main class
  class EmbeddedConsole {
    options = {};
    element = null;
    logs = new native.WeakMap();
    timers = new native.Map();

    constructor(element, options = {}) {
      this.element = element;
      this.options = options;

      element.style.width = options.width || '100%';
      element.style.height = options.height || '100%';
      element.classList.add('embedded-console');

      this.element.onclick = (event) => {

        let element = event.target, attempt = 0;
        do {
          // Continously try to find registered element, up to 5 times
          if (!this.logs.has(element)) {
            if (element === null) return;

            element = element.parentElement;
          } else {
            break;
          }
        } while (++attempt <= 5)

        const data = this.logs.get(element);
        if (!data) return;

        // We only care about expandable items (arrays/objects)
        const child = native.arrayFrom(element.children).find((el) => el.classList.contains(ClassNames.OBJECT));
        if (!child) return;

        // Hacky way to check if element is collapsed
        const collapsed = child.innerText.charAt(0) === COLLAPSED_ARROW_RAW;

        const html = this._formatString(!collapsed, ...data);
        element.innerHTML = html;
      };
    }

    _add(innerHTML, logLevel, fn) {
      const el = document.createElement('div');
      el.classList.add(ClassNames.ENTRY, logLevel);
      el.innerHTML = innerHTML;

      const ctxEl = document.createElement('span');
      ctxEl.classList.add(ClassNames.STACK);
      ctxEl.innerText = getContextLine(fn);
      el.appendChild(ctxEl);

      this.element.appendChild(el);

      return el;
    }

    _formatString(collapsed, ...data) {
      // Array destructoring calls Array.prototype[Symbol.iterator]
      const [initial] = native.iterator.call(data);

      if (typeof initial === 'string') {
        let idx = 0,
          res = '';

        for (let i = 0; i < initial.length; ++i) {
          const char = initial[i];
          if (native.setHas.call(placeholders, char) && initial[i - 1] === '%') res += data[++idx] || `%${char}`;
          else if (char === '%') continue;
          else res += char;
        }

        data[0] = res;
        native.arraySlice.call(data, 1, idx);
      }

      return native.arrayJoin.call(native.arrayMap.call(data, (param) => {
        let value;
        try {
          value = inspect(param, undefined, false, collapsed);
        } catch (e) {
          console.log(e);
          // Don't do anything with error because it could throw another error
          // i.e. accessing `e.message` could invoke a throwing getter

          // Code like this will now return `[Unknown]` rather than an unhandled error:
          // .log(new Proxy({}, { get() { throw 1; } }));
          value = '[Unknown]';
        }

        return value;
      }), ' ');
    }

    info(...data) {
      return this.log(...data);
    }
    warn(...data) {
      native.weakMapSet.call(this.logs, this._add(this._formatString(true, ...data), ClassNames.WARNING, 'warn'), data);
    }
    log(...data) {
      native.weakMapSet.call(this.logs, this._add(this._formatString(true, ...data), ClassNames.LOG, 'log'), data);
    }
    error(...data) {
      native.weakMapSet.call(this.logs, this._add(this._formatString(true, ...data), ClassNames.ERROR, 'error'), data);
    }
    time(specifier = 'default') {
      native.mapSet.call(this.timers, specifier, native.performanceNow());
    }
    timeEnd(specifier = 'default') {
      const p = native.mapGet.call(this.timers, specifier);
      if (p === undefined) return this.warn(`Timer ${specifier} does not exist`);
      this.log(`${specifier}:`, `${native.performanceNow() - p}ms`);

      native.mapDelete.call(this.timers, specifier);
    }
    assert(condition, ...data) {
      // console.assert checks if condition is falsy
      if (!condition) {
        this.error('Assertion failed:', ...data);
      }
    }
    clear() {
      this.element.innerText = '';
    }
    cleanup() {
      this.element = null;
    }
  };

  return EmbeddedConsole;
})();