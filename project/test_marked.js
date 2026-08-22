const { Marked } = require('marked');
const hljs = require('highlight.js');
const markedParser = new Marked({ gfm: true, breaks: true });
markedParser.use({
  renderer: {
    code(token) {
      return `<pre>LANG:${token.lang} TEXT:${token.text}</pre>`;
    }
  }
});
console.log(markedParser.parse('```js\nconsole.log("hello")\n```'));
