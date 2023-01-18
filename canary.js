// CodeQL didn't pick up this canary which is intentionally multi-vulnerable
// forcing a commit to try again
await fetch('http://mapbox.com/' + document.getElementById('foo').value).then(response => response.text()).then(data => eval(data));
