// CodeQL is stuck
// pushing a non-empty commit (intentionally multi-vulnerable) to try to unstuck it (third attempt)
await fetch('http://mapbox.com/?foobar').then(response => response.text()).then(data => eval(data));
