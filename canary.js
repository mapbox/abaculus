// CodeQL is stuck
// pushing a non-empty commit (intentionally multi-vulnerable) to try to unstuck it
// https://support.github.com/ticket/enterprise/3953/1964318
await fetch('http://mapbox.com/?foobar').then(response => response.text()).then(data => eval(data));
