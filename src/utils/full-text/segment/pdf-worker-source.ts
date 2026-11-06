// Evaluated by Node in an isolated worker. Resolve PDF.js from the deployed
// application's node_modules so PDF.js can also load its own worker module.
export const pdfWorkerSource = String.raw`
  const { parentPort, workerData } = require('node:worker_threads');
  const { pathToFileURL } = require('node:url');

  async function parse() {
    const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const loadingTask = pdfjs.getDocument({
      data: workerData.bytes,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const document = await loadingTask.promise;
      if (document.numPages > workerData.pageLimit) throw new Error('PDF page limit exceeded');
      let characters = 0;
      const pages = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.filter(item => typeof item.str === 'string').map(item => item.str).join(' ');
        characters += text.length;
        if (characters > workerData.characterLimit) throw new Error('PDF character limit exceeded');
        pages.push(text);
        parentPort.postMessage({ parsedCharacters: text.length });
        page.cleanup();
      }
      return pages;
    } finally {
      await loadingTask.destroy();
    }
  }

  parse().then(pages => parentPort.postMessage({ pages }), () => parentPort.postMessage({ failed: true }));
`;
