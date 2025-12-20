import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique task ID using UUID v4 format
 * @returns {string} A unique task identifier
 */
export function generateTaskId(): string {
  return uuidv4();
}

/**
 * Validates if a string is a valid UUID v4
 * @param {string} id - The ID to validate
 * @returns {boolean} True if valid UUID v4, false otherwise
 */
export function isValidTaskId(id: string): boolean {
  const uuidV4Regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidV4Regex.test(id);
}
