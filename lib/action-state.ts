/**
 * Shared result shape for server actions.
 *
 * Kept out of the `"use server"` modules because those files may only export
 * async functions -- exporting the `IDLE` constant from one is a build error.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const IDLE: ActionState = { status: "idle" };
