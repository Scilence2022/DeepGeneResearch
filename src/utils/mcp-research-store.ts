/**
 * MCP Research Store
 * 
 * Provides temporary storage for MCP research results that can be
 * retrieved via downloadable URLs. Uses in-memory storage with TTL.
 */

import { nanoid } from 'nanoid';

// Default TTL: 24 hours in milliseconds
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Cleanup interval: 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface StoredResearchResult {
    id: string;
    report: string;
    details: object;
    createdAt: number;
    expiresAt: number;
}

// In-memory store for research results
const researchStore = new Map<string, StoredResearchResult>();

// Track if cleanup interval is running
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Generate a unique research ID
 */
export function generateResearchId(): string {
    return nanoid(16);
}

/**
 * Store research results with a TTL
 * @param report The markdown research report
 * @param details The full research details object
 * @param ttlMs Time-to-live in milliseconds (default: 24 hours)
 * @returns The generated research ID
 */
export function storeResearchResult(
    report: string,
    details: object,
    ttlMs: number = DEFAULT_TTL_MS
): string {
    const id = generateResearchId();
    const now = Date.now();

    researchStore.set(id, {
        id,
        report,
        details,
        createdAt: now,
        expiresAt: now + ttlMs
    });

    // Start cleanup interval if not already running
    startCleanupInterval();

    return id;
}

/**
 * Retrieve a research result by ID
 * @param id The research ID
 * @returns The stored result or null if not found/expired
 */
export function getResearchResult(id: string): StoredResearchResult | null {
    const result = researchStore.get(id);

    if (!result) {
        return null;
    }

    // Check if expired
    if (Date.now() > result.expiresAt) {
        researchStore.delete(id);
        return null;
    }

    return result;
}

/**
 * Get the research report by ID
 * @param id The research ID
 * @returns The markdown report or null if not found/expired
 */
export function getResearchReport(id: string): string | null {
    const result = getResearchResult(id);
    return result?.report ?? null;
}

/**
 * Get the research details by ID
 * @param id The research ID
 * @returns The details object or null if not found/expired
 */
export function getResearchDetails(id: string): object | null {
    const result = getResearchResult(id);
    return result?.details ?? null;
}

/**
 * Delete a research result by ID
 * @param id The research ID
 * @returns true if deleted, false if not found
 */
export function deleteResearchResult(id: string): boolean {
    return researchStore.delete(id);
}

/**
 * Clean up expired entries
 */
function cleanupExpiredEntries(): void {
    const now = Date.now();

    for (const [id, result] of researchStore.entries()) {
        if (now > result.expiresAt) {
            researchStore.delete(id);
        }
    }

    // Stop cleanup interval if store is empty
    if (researchStore.size === 0 && cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
}

/**
 * Start the cleanup interval if not already running
 */
function startCleanupInterval(): void {
    if (!cleanupIntervalId) {
        cleanupIntervalId = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
        // Prevent interval from blocking Node.js exit
        if (cleanupIntervalId.unref) {
            cleanupIntervalId.unref();
        }
    }
}

/**
 * Get statistics about the store (for debugging/monitoring)
 */
export function getStoreStats(): { count: number; oldestAge: number | null } {
    if (researchStore.size === 0) {
        return { count: 0, oldestAge: null };
    }

    const now = Date.now();
    let oldestCreatedAt = now;

    for (const result of researchStore.values()) {
        if (result.createdAt < oldestCreatedAt) {
            oldestCreatedAt = result.createdAt;
        }
    }

    return {
        count: researchStore.size,
        oldestAge: now - oldestCreatedAt
    };
}
