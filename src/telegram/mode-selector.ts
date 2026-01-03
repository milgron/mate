import type { RoutingMode } from '../orchestrator/index.js';

// Store user mode selections (default: simple)
const userModes = new Map<string, RoutingMode>();

/**
 * Get the current mode for a user.
 * Defaults to 'simple' if not set.
 */
export function getUserMode(userId: string): RoutingMode {
  return userModes.get(userId) ?? 'simple';
}

/**
 * Set the user's mode.
 */
export function setUserMode(userId: string, mode: RoutingMode): void {
  userModes.set(userId, mode);
}

/**
 * Check if user is in flow mode.
 */
export function isFlowMode(userId: string): boolean {
  return getUserMode(userId) === 'flow';
}
