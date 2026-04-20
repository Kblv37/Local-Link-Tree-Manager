/**
 * Returns a debounced version of fn that delays invocation by ms milliseconds.
 * Rapid consecutive calls reset the timer; only the last call fires.
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} [ms=300]
 * @returns {T}
 */
export function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}
