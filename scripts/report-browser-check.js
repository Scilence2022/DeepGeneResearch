/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI loads this callback expression. */
async page => {
  const reportId = 'browser-smoke-report';
  const base = new URL(page.url()).origin;
  let remoteImages = 0;
  await page.route('https://report-smoke.invalid/**', route => {
    remoteImages++;
    return route.abort();
  });
  await page.evaluate(async id => {
    const markdown = [
      '# Render verification',
      '<iframe srcdoc="<script>top.__dgrExecuted=1</script>"></iframe>',
      '<svg onload="window.__dgrExecuted=2"><circle r="10"/></svg>',
      '[unsafe-link](javascript:alert%281%29)',
      '![disabled-image](https://report-smoke.invalid/pixel.png)',
      '$x^2$',
      '| Name | Value |\n| --- | --- |\n| score | 7 |',
      '```js\nconsole.log("hello");\n```',
      '```mermaid\nflowchart TD\nA --> B\n```',
    ].join('\n\n');
    localStorage.setItem('setting', JSON.stringify({ version: 0, state: { citationImage: 'disable' } }));
    const database = await new Promise((resolve, reject) => {
      const open = indexedDB.open('DeepResearch');
      open.onupgradeneeded = () => open.result.createObjectStore('researchStore');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('researchStore', 'readwrite');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore('researchStore').put({
        version: 2,
        state: {
          history: [{ id, title: 'Offline browser fixture', finalReport: markdown, resources: [], sources: [] }],
          researchTasks: [],
        },
      }, 'historyStore');
    });
    database.close();
  }, reportId);

  const response = await page.goto(`${base}/report?id=${reportId}`);
  const csp = await response.headerValue('content-security-policy');
  if (!csp?.includes("frame-src 'none'") || !csp.includes("script-src-attr 'none'")) throw new Error('Report CSP is missing');
  const report = page.locator('.magicdown-view');
  await report.locator('.mermaid svg').waitFor({ state: 'attached' });
  for (const selector of ['.katex', 'table', 'pre code']) {
    await report.locator(selector).waitFor({ state: 'attached' });
  }
  if (await report.locator('iframe, svg[onload], img').count()) throw new Error('Unsafe report element survived');
  if (await report.getByText('unsafe-link').getAttribute('href')) throw new Error('Unsafe link survived');
  if (remoteImages || await page.evaluate(() => Boolean(window.__dgrExecuted))) throw new Error('Report caused an unsafe request or script execution');
  return 'DGR_REPORT_BROWSER_CHECK_PASSED';
}
