import { NextRequest, NextResponse } from 'next/server';
import { taskStore } from '@/services/task-store';
import { requireMcpAuth } from '../../../auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Format = 'report' | 'details';

const VALID_FORMATS: Format[] = ['report', 'details'];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ researchId: string; format: string }> }
) {
    const unauthorized = requireMcpAuth(req);
    if (unauthorized) return unauthorized;

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
        if (!/^[-_a-zA-Z0-9]{8,64}$/.test(researchId)) {
            return NextResponse.json(
                { error: 'Invalid research ID' },
                { status: 400 }
            );
        }

        const task = await taskStore.getTaskByArtifactId(researchId);
        if (task?.status !== 'completed' || task.parameters.mode === 'general' || !task.result) {
            return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
        }

        const report = task.result.finalReport || task.result.report?.content;
        if (lowerFormat === 'report' && typeof report !== 'string') {
            return NextResponse.json({ error: 'Research report not found' }, { status: 404 });
        }
        const content = lowerFormat === 'report' ? report : JSON.stringify(task.result, null, 2);
        const contentType = lowerFormat === 'report' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8';
        const filename = lowerFormat === 'report' ? `research-report-${researchId}.md` : `research-details-${researchId}.json`;

        // Return the file as response with download headers
        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': Buffer.byteLength(content, 'utf-8').toString(),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
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
