import { z } from 'zod';

// Telegram user IDs are positive integers
const UserIdSchema = z.union([
  z.string().regex(/^\d+$/, 'User ID must be a positive integer'),
  z.number().int().positive(),
]);

/**
 * Validates and manages a whitelist of allowed Telegram user IDs.
 */
export class UserWhitelist {
  private readonly allowedUsers: Set<string>;

  constructor(allowedUserIds: Array<string | number>) {
    this.allowedUsers = new Set(
      allowedUserIds
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0)
    );
  }

  /**
   * Creates a whitelist from a comma-separated string.
   */
  static fromString(commaSeparated: string): UserWhitelist {
    const ids = commaSeparated
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return new UserWhitelist(ids);
  }

  /**
   * Checks if a user ID is in the whitelist.
   */
  isAllowed(userId: string | number): boolean {
    // Validate format first
    const result = UserIdSchema.safeParse(userId);
    if (!result.success) {
      return false;
    }

    const normalizedId = String(userId).trim();
    return this.allowedUsers.has(normalizedId);
  }

  /**
   * Returns the number of users in the whitelist.
   */
  get size(): number {
    return this.allowedUsers.size;
  }
}
