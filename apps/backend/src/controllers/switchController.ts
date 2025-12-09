/**
 * Switch Controller
 *
 * API endpoint for programmatic AI↔Human switching.
 * Can be called by:
 * - Frontend (agent dashboard)
 * - Automated triggers (sentiment detection)
 * - External systems (CRM integration)
 */

import { Router, Request, Response } from "express";
import {
  executeSwitch,
  getSwitchStats,
  canSwitch,
} from "../services/voice/switchService.js";
import type { SwitchRequest, SwitchResponse } from "shared-types";

const router = Router();

/**
 * POST /api/switch
 *
 * Execute a switch between AI and Human agent
 *
 * Body:
 * {
 *   callId: string,
 *   direction: "AI_TO_HUMAN" | "HUMAN_TO_AI",
 *   reason?: string
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { callId, direction, reason } = req.body as SwitchRequest;

    // Validate request
    if (!callId) {
      res.status(400).json({ error: "callId is required" });
      return;
    }

    if (!direction || !["AI_TO_HUMAN", "HUMAN_TO_AI"].includes(direction)) {
      res.status(400).json({
        error: "direction must be AI_TO_HUMAN or HUMAN_TO_AI",
      });
      return;
    }

    // Check if switch is allowed
    const { allowed, reason: blockReason } = await canSwitch(callId, direction);
    if (!allowed) {
      res.status(400).json({
        success: false,
        error: blockReason,
      });
      return;
    }

    // Execute the switch
    const result = await executeSwitch({
      callId,
      direction,
      reason,
    });

    if (result.success) {
      const response: SwitchResponse = {
        success: true,
        newMode: result.newMode,
        timestamp: result.timestamp,
      };
      res.json(response);
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Switch endpoint error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * GET /api/switch/stats/:callId
 *
 * Get switch statistics for a call
 */
router.get("/stats/:callId", async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    if (!callId) {
      res.status(400).json({ error: "callId is required" });
      return;
    }

    const stats = await getSwitchStats(callId);
    res.json(stats);
  } catch (error) {
    console.error("❌ Switch stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/switch/can-switch/:callId/:direction
 *
 * Check if a switch is currently allowed
 */
router.get(
  "/can-switch/:callId/:direction",
  async (req: Request, res: Response) => {
    try {
      const { callId, direction } = req.params;

      if (!callId || !direction) {
        res.status(400).json({ error: "callId and direction are required" });
        return;
      }

      if (!["AI_TO_HUMAN", "HUMAN_TO_AI"].includes(direction)) {
        res.status(400).json({
          error: "direction must be AI_TO_HUMAN or HUMAN_TO_AI",
        });
        return;
      }

      const result = await canSwitch(
        callId,
        direction as "AI_TO_HUMAN" | "HUMAN_TO_AI"
      );
      res.json(result);
    } catch (error) {
      console.error("❌ Can-switch check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as switchController };

