/**
 * Analytics Controller
 *
 * API endpoints for diagnostics and analytics:
 * - Dashboard metrics
 * - Call metrics
 * - Switch analytics
 * - Time series data
 * - Performance metrics
 */

import { Router, Request, Response } from "express";
import {
  getDashboardMetrics,
  getCallMetrics,
  getRecentCalls,
  getSwitchAnalytics,
  getTimeSeriesData,
  getPerformanceMetrics,
} from "../services/analytics/analyticsService.js";

const router = Router();

/**
 * GET /api/analytics/dashboard
 *
 * Get high-level dashboard metrics
 *
 * Response:
 * {
 *   overview: { totalCalls, activeCalls, avgDuration, totalSwitches },
 *   today: { calls, switches, avgDuration },
 *   modeDistribution: { aiResolved, humanResolved, mixed }
 * }
 */
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const metrics = await getDashboardMetrics();
    res.json(metrics);
  } catch (error) {
    console.error("❌ Dashboard metrics error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

/**
 * GET /api/analytics/calls
 *
 * Get recent calls with basic metrics
 *
 * Query params:
 * - limit: number (default 10, max 100)
 *
 * Response:
 * [{ id, status, mode, duration, switchCount, startedAt }]
 */
router.get("/calls", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const calls = await getRecentCalls(limit);
    res.json(calls);
  } catch (error) {
    console.error("❌ Recent calls error:", error);
    res.status(500).json({ error: "Failed to fetch recent calls" });
  }
});

/**
 * GET /api/analytics/calls/:callId
 *
 * Get detailed metrics for a specific call
 *
 * Response:
 * {
 *   callId, duration, mode, switchCount,
 *   switches: [{ direction, reason, timestamp }],
 *   status, startedAt, endedAt
 * }
 */
router.get("/calls/:callId", async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const metrics = await getCallMetrics(callId);

    if (!metrics) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    res.json(metrics);
  } catch (error) {
    console.error("❌ Call metrics error:", error);
    res.status(500).json({ error: "Failed to fetch call metrics" });
  }
});

/**
 * GET /api/analytics/switches
 *
 * Get comprehensive switch analytics
 *
 * Query params:
 * - days: number (default 7)
 *
 * Response:
 * {
 *   totalSwitches,
 *   byDirection: { aiToHuman, humanToAi },
 *   byReason: { [reason]: count },
 *   avgSwitchesPerCall,
 *   peakSwitchHour
 * }
 */
router.get("/switches", async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days) || 7;
    const analytics = await getSwitchAnalytics(days);
    res.json(analytics);
  } catch (error) {
    console.error("❌ Switch analytics error:", error);
    res.status(500).json({ error: "Failed to fetch switch analytics" });
  }
});

/**
 * GET /api/analytics/timeseries
 *
 * Get time series data for calls and switches
 *
 * Query params:
 * - days: number (default 7)
 * - granularity: 'hour' | 'day' (default 'day')
 *
 * Response:
 * {
 *   calls: [{ timestamp, value }],
 *   switches: [{ timestamp, value }]
 * }
 */
router.get("/timeseries", async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days) || 7;
    const granularity = req.query.granularity === "hour" ? "hour" : "day";
    const data = await getTimeSeriesData(days, granularity);
    res.json(data);
  } catch (error) {
    console.error("❌ Time series error:", error);
    res.status(500).json({ error: "Failed to fetch time series data" });
  }
});

/**
 * GET /api/analytics/performance
 *
 * Get performance metrics
 *
 * Response:
 * {
 *   aiResolutionRate: number (percentage),
 *   avgHandleTime: number (seconds),
 *   switchRate: number (percentage)
 * }
 */
router.get("/performance", async (_req: Request, res: Response) => {
  try {
    const metrics = await getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    console.error("❌ Performance metrics error:", error);
    res.status(500).json({ error: "Failed to fetch performance metrics" });
  }
});

/**
 * GET /api/analytics/summary
 *
 * Get a combined summary of all analytics (for dashboard)
 *
 * Response: Combined dashboard, performance, and recent activity
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const [dashboard, performance, recentCalls, switchAnalytics] =
      await Promise.all([
        getDashboardMetrics(),
        getPerformanceMetrics(),
        getRecentCalls(5),
        getSwitchAnalytics(7),
      ]);

    res.json({
      dashboard,
      performance,
      recentCalls,
      switchAnalytics,
    });
  } catch (error) {
    console.error("❌ Summary error:", error);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

export { router as analyticsController };

