import { InlineKeyboard } from 'grammy';
import type { RoutingMode } from '../orchestrator/index.js';

/**
 * User mode state for routing.
 * - 'simple': User selected simple mode (Claude CLI)
 * - 'flow': User selected flow mode (claude-flow)
 * - 'awaiting_message': User has selected a mode and we're waiting for their message
 */
export type UserModeState = {
  mode: RoutingMode;
  awaitingMessage: boolean;
};

// Store user mode selections
const userModes = new Map<string, UserModeState>();

// Store pending messages (for when user sends message before selecting mode)
const pendingMessages = new Map<string, string>();

/**
 * Get the inline keyboard for mode selection.
 */
export function getModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚡ Simple', 'mode:simple')
    .text('🔄 Flow', 'mode:flow');
}

/**
 * Get the current mode state for a user.
 */
export function getUserModeState(userId: string): UserModeState | null {
  return userModes.get(userId) ?? null;
}

/**
 * Set the user's selected mode.
 */
export function setUserMode(userId: string, mode: RoutingMode): void {
  userModes.set(userId, { mode, awaitingMessage: true });
}

/**
 * Clear the user's mode selection (after message is processed).
 */
export function clearUserMode(userId: string): void {
  userModes.delete(userId);
}

/**
 * Store a pending message from a user who hasn't selected a mode yet.
 */
export function setPendingMessage(userId: string, message: string): void {
  pendingMessages.set(userId, message);
}

/**
 * Get and clear a pending message for a user.
 */
export function consumePendingMessage(userId: string): string | null {
  const message = pendingMessages.get(userId);
  pendingMessages.delete(userId);
  return message ?? null;
}

/**
 * Check if a user has a pending message.
 */
export function hasPendingMessage(userId: string): boolean {
  return pendingMessages.has(userId);
}

/**
 * Mark that the user's message has been consumed and they need to select mode again next time.
 */
export function markMessageConsumed(userId: string): void {
  const state = userModes.get(userId);
  if (state) {
    userModes.delete(userId);
  }
}
