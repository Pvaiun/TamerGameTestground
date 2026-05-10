export function rand(min, max) { return Math.random() * (max - min) + min; }
export function randi(min, max) { return Math.floor(rand(min, max + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
