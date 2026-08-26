const { JSDOM } = require('jsdom');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');

function measureInstanceCost(N) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`);
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = { userAgent: 'node' };

  const root = document.getElementById('root');
  
  global.gc && global.gc();
  const startMem = process.memoryUsage().heapUsed;
  const startTime = Date.now();

  const views = [];
  for (let i = 0; i < N; i++) {
    const container = document.createElement('div');
    root.appendChild(container);

    const state = EditorState.create({
      doc: "This is a test block with some content.\n- List item\n- List item 2"
    });
    const view = new EditorView({
      state,
      parent: container
    });
    views.push(view);
  }

  const mountTime = Date.now() - startTime;
  
  global.gc && global.gc();
  const endMem = process.memoryUsage().heapUsed;
  
  const memDiffKB = (endMem - startMem) / 1024;
  const perBlockKB = memDiffKB / N;

  console.log(`[E0] N=${N}`);
  console.log(`Mount time: ${mountTime}ms`);
  console.log(`Total Mem increase: ${memDiffKB.toFixed(2)} KB`);
  console.log(`Per-block Mem: ${perBlockKB.toFixed(2)} KB`);
  console.log('---');
  
  return { mountTime, perBlockKB };
}

measureInstanceCost(50);
measureInstanceCost(200);
measureInstanceCost(500);
