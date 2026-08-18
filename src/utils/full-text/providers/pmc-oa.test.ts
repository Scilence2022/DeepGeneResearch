import { afterEach, describe, expect, it, vi } from 'vitest';
import { locatePmcOaPackage } from './pmc-oa';

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml' },
  });
}

const oaFixture = `<?xml version="1.0"?>
<OA>
  <responseDate>2026-08-18 00:00:00</responseDate>
  <request>https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=PMC7096803</request>
  <record returned="yes" citation="Genome Biol. 2020 Jan 1; 21:1" license="CC BY">
    <link format="tgz" href="ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/ab/cd/PMC7096803.tar.gz" updated="2020-01-02"/>
    <link format="pdf" href="ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_pdf/ab/cd/article.PMC7096803.pdf"/>
  </record>
</OA>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('locatePmcOaPackage', () => {
  it('extracts the tgz link and license, converting ftp to https', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(oaFixture)));
    vi.stubGlobal('fetch', fetchMock);

    const location = await locatePmcOaPackage('PMC7096803');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/pmc/utils/oa/oa.fcgi?id=PMC7096803');
    expect(location).toEqual({
      tgzUrl: 'https://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/ab/cd/PMC7096803.tar.gz',
      license: 'CC BY',
    });
  });

  it('returns null for records outside the OA subset', async () => {
    const errorXml = `<?xml version="1.0"?>
<OA>
  <responseDate>2026-08-18 00:00:00</responseDate>
  <error code="idIsNotOpenAccess">identifier PMC1234 is not in the Open Access subset</error>
</OA>`;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(errorXml)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(locatePmcOaPackage('PMC1234')).resolves.toBeNull();
  });

  it('returns null when the response has no tgz link', async () => {
    const noTgz = `<OA><record returned="yes"><link format="pdf" href="ftp://ftp.ncbi.nlm.nih.gov/x.pdf"/></record></OA>`;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(noTgz)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(locatePmcOaPackage('PMC7096803')).resolves.toBeNull();
  });

  it('returns null for invalid pmcids without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(locatePmcOaPackage('7096803')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
