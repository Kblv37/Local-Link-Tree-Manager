export function debounce(fn, ms = 300, opts = {}) {
    let timer;
    let called = false;
    return function (...args) {
        if (opts.leading && !called) {
            called = true;
            fn.apply(this, args);
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            called = false;
            if (!opts.leading) fn.apply(this, args);
        }, ms);
    };
}