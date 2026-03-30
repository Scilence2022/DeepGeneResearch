import { NextRequest, NextResponse } from 'next/server';
import {
    getResearchReport,
    getResearchDetails
} from '@/utils/mcp-research-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Format = 'report' | 'details';

const VALID_FORMATS: Format[] = ['report', 'details'];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ researchId: string; format: string }> }
) {
    try {
        const { researchId, format } = await params;

        // Validate format
        const lowerFormat = format.toLowerCase() as Format;
        if (!VALID_FORMATS.includes(lowerFormat)) {
            return NextResponse.json(
                { error: `Invalid format. Supported formats: ${VALID_FORMATS.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate researchId (basic validation)
        if (!researchId || researchId.length < 8) {
            return NextResponse.json(
                { error: 'Invalid research ID' },
                { status: 400 }
            );
        }

        let content: string;
        let contentType: string;
        let filename: string;

        switch (lowerFormat) {
            case 'report': {
                const report = getResearchReport(researchId);
                if (!report) {
                    return NextResponse.json(
                        { error: 'Research report not found or expired' },
                        { status: 404 }
                    );
                }
                content = report;
                contentType = 'text/markdown; charset=utf-8';
                filename = `research-report-${researchId}.md`;
                break;
            }

            case 'details': {
                const details = getResearchDetails(researchId);
                if (!details) {
                    return NextResponse.json(
                        { error: 'Research details not found or expired' },
                        { status: 404 }
                    );
                }
                content = JSON.stringify(details, null, 2);
                contentType = 'application/json; charset=utf-8';
                filename = `research-details-${researchId}.json`;
                break;
            }

            default:
                return NextResponse.json(
                    { error: 'Unsupported format' },
                    { status: 400 }
                );
        }

        // Return the file as response with download headers
        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': Buffer.byteLength(content, 'utf-8').toString(),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error) {
        console.error('Error downloading research content:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to download research content' },
            { status: 500 }
        );
    }
}
