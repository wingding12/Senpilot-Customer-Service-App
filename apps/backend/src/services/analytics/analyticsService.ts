/**
 * Analytics Service
 *
 * Provides metrics and analytics for:
 * - Call/chat volume and duration
 * - Switch frequency and patterns
 * - Resolution rates
 * - Agent performance
 * - Copilot effectiveness
 */

import { prisma } from "database";

// ===========================================
// Types
// ===========================================

export interface DashboardMetrics {
  overview: {
    totalCalls: number;
    activeCalls: number;
    avgDuration: number; // in seconds
    totalSwitches: number;
  };
  today: {
    calls: number;
    switches: number;
    avgDuration: number;
  };
  modeDistribution: {
    aiResolved: number;
    humanResolved: number;
    mixed: number; // calls with switches
  };
}

export interface CallMetrics {
  callId: string;
  duration: number; // seconds
  mode: string;
  switchCount: number;
  switches: Array<{
    direction: string;
    reason: string | null;
    timestamp: Date;
  }>;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface SwitchAnalytics {
  totalSwitches: number;
  byDirection: {
    aiToHuman: number;
    humanToAi: number;
  };
  byReason: Record<string, number>;
  avgSwitchesPerCall: number;
  peakSwitchHour: number | null;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

export interface TimeSeriesData {
  calls: TimeSeriesPoint[];
  switches: TimeSeriesPoint[];
}

// ===========================================
// Dashboard Metrics
// ===========================================

/**
 * Get high-level dashboard metrics
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Run queries in parallel
  const [
    totalCalls,
    activeCalls,
    totalSwitches,
    todayCalls,
    todaySwitches,
    completedCalls,
    todayCompletedCalls,
    callsWithSwitches,
  ] = await Promise.all([
    // Total calls
    prisma.call.count(),

    // Active calls
    prisma.call.count({
      where: { status: "ACTIVE" },
    }),

    // Total switches
    prisma.switchLog.count(),

    // Today's calls
    prisma.call.count({
      where: { startedAt: { gte: todayStart } },
    }),

    // Today's switches
    prisma.switchLog.count({
      where: { switchedAt: { gte: todayStart } },
    }),

    // Completed calls with duration
    prisma.call.findMany({
      where: {
        status: "ENDED",
        endedAt: { not: null },
      },
      select: {
        startedAt: true,
        endedAt: true,
        mode: true,
        _count: { select: { switchLogs: true } },
      },
    }),

    // Today's completed calls
    prisma.call.findMany({
      where: {
        status: "ENDED",
        endedAt: { not: null },
        startedAt: { gte: todayStart },
      },
      select: {
        startedAt: true,
        endedAt: true,
      },
    }),

    // Calls with at least one switch
    prisma.call.count({
      where: {
        switchLogs: { some: {} },
      },
    }),
  ]);

  // Calculate average duration
  const avgDuration =
    completedCalls.length > 0
      ? completedCalls.reduce((sum, call) => {
          const duration =
            (call.endedAt!.getTime() - call.startedAt.getTime()) / 1000;
          return sum + duration;
        }, 0) / completedCalls.length
      : 0;

  // Calculate today's average duration
  const todayAvgDuration =
    todayCompletedCalls.length > 0
      ? todayCompletedCalls.reduce((sum, call) => {
          const duration =
            (call.endedAt!.getTime() - call.startedAt.getTime()) / 1000;
          return sum + duration;
        }, 0) / todayCompletedCalls.length
      : 0;

  // Mode distribution
  const aiResolved = completedCalls.filter(
    (c) => c.mode === "AI_AGENT" && c._count.switchLogs === 0
  ).length;
  const humanResolved = completedCalls.filter(
    (c) => c.mode === "HUMAN_REP" && c._count.switchLogs === 0
  ).length;
  const mixed = callsWithSwitches;

  return {
    overview: {
      totalCalls,
      activeCalls,
      avgDuration: Math.round(avgDuration),
      totalSwitches,
    },
    today: {
      calls: todayCalls,
      switches: todaySwitches,
      avgDuration: Math.round(todayAvgDuration),
    },
    modeDistribution: {
      aiResolved,
      humanResolved,
      mixed,
    },
  };
}

// ===========================================
// Call Metrics
// ===========================================

/**
 * Get detailed metrics for a specific call
 */
export async function getCallMetrics(callId: string): Promise<CallMetrics | null> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      switchLogs: {
        orderBy: { switchedAt: "asc" },
      },
    },
  });

  if (!call) return null;

  const duration = call.endedAt
    ? (call.endedAt.getTime() - call.startedAt.getTime()) / 1000
    : (Date.now() - call.startedAt.getTime()) / 1000;

  return {
    callId: call.id,
    duration: Math.round(duration),
    mode: call.mode,
    switchCount: call.switchLogs.length,
    switches: call.switchLogs.map((s) => ({
      direction: s.direction,
      reason: s.reason,
      timestamp: s.switchedAt,
    })),
    status: call.status,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
  };
}

/**
 * Get recent calls with basic metrics
 */
export async function getRecentCalls(
  limit = 10
): Promise<
  Array<{
    id: string;
    status: string;
    mode: string;
    duration: number;
    switchCount: number;
    startedAt: Date;
  }>
> {
  const calls = await prisma.call.findMany({
    take: limit,
    orderBy: { startedAt: "desc" },
    include: {
      _count: { select: { switchLogs: true } },
    },
  });

  return calls.map((call) => ({
    id: call.id,
    status: call.status,
    mode: call.mode,
    duration: call.endedAt
      ? Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)
      : Math.round((Date.now() - call.startedAt.getTime()) / 1000),
    switchCount: call._count.switchLogs,
    startedAt: call.startedAt,
  }));
}

// ===========================================
// Switch Analytics
// ===========================================

/**
 * Get comprehensive switch analytics
 */
export async function getSwitchAnalytics(
  days = 7
): Promise<SwitchAnalytics> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [switches, totalCalls] = await Promise.all([
    prisma.switchLog.findMany({
      where: { switchedAt: { gte: since } },
      select: {
        direction: true,
        reason: true,
        switchedAt: true,
      },
    }),
    prisma.call.count({
      where: { startedAt: { gte: since } },
    }),
  ]);

  // Count by direction
  const aiToHuman = switches.filter(
    (s) => s.direction === "AI_TO_HUMAN"
  ).length;
  const humanToAi = switches.filter(
    (s) => s.direction === "HUMAN_TO_AI"
  ).length;

  // Count by reason
  const byReason: Record<string, number> = {};
  switches.forEach((s) => {
    const reason = s.reason || "UNKNOWN";
    byReason[reason] = (byReason[reason] || 0) + 1;
  });

  // Find peak hour
  const hourCounts: Record<number, number> = {};
  switches.forEach((s) => {
    const hour = s.switchedAt.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const peakHour =
    Object.entries(hourCounts).length > 0
      ? Number(
          Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]
        )
      : null;

  return {
    totalSwitches: switches.length,
    byDirection: {
      aiToHuman,
      humanToAi,
    },
    byReason,
    avgSwitchesPerCall: totalCalls > 0 ? switches.length / totalCalls : 0,
    peakSwitchHour: peakHour,
  };
}

// ===========================================
// Time Series Data
// ===========================================

/**
 * Get time series data for calls and switches
 */
export async function getTimeSeriesData(
  days = 7,
  granularity: "hour" | "day" = "day"
): Promise<TimeSeriesData> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [calls, switches] = await Promise.all([
    prisma.call.findMany({
      where: { startedAt: { gte: since } },
      select: { startedAt: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.switchLog.findMany({
      where: { switchedAt: { gte: since } },
      select: { switchedAt: true },
      orderBy: { switchedAt: "asc" },
    }),
  ]);

  // Group by time bucket
  const callBuckets = new Map<string, number>();
  const switchBuckets = new Map<string, number>();

  const getBucket = (date: Date): string => {
    if (granularity === "hour") {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    }
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };

  const bucketToDate = (bucket: string): Date => {
    const parts = bucket.split("-").map(Number);
    if (granularity === "hour") {
      return new Date(parts[0], parts[1], parts[2], parts[3]);
    }
    return new Date(parts[0], parts[1], parts[2]);
  };

  calls.forEach((c) => {
    const bucket = getBucket(c.startedAt);
    callBuckets.set(bucket, (callBuckets.get(bucket) || 0) + 1);
  });

  switches.forEach((s) => {
    const bucket = getBucket(s.switchedAt);
    switchBuckets.set(bucket, (switchBuckets.get(bucket) || 0) + 1);
  });

  // Convert to time series
  const callSeries: TimeSeriesPoint[] = Array.from(callBuckets.entries())
    .map(([bucket, value]) => ({
      timestamp: bucketToDate(bucket),
      value,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const switchSeries: TimeSeriesPoint[] = Array.from(switchBuckets.entries())
    .map(([bucket, value]) => ({
      timestamp: bucketToDate(bucket),
      value,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    calls: callSeries,
    switches: switchSeries,
  };
}

// ===========================================
// Agent Performance
// ===========================================

/**
 * Get performance metrics (placeholder for future agent tracking)
 */
export async function getPerformanceMetrics(): Promise<{
  aiResolutionRate: number;
  avgHandleTime: number;
  switchRate: number;
}> {
  const [totalEnded, aiOnly, switches, completedCalls] = await Promise.all([
    prisma.call.count({ where: { status: "ENDED" } }),
    prisma.call.count({
      where: {
        status: "ENDED",
        mode: "AI_AGENT",
        switchLogs: { none: {} },
      },
    }),
    prisma.switchLog.count(),
    prisma.call.findMany({
      where: { status: "ENDED", endedAt: { not: null } },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  const avgHandleTime =
    completedCalls.length > 0
      ? completedCalls.reduce((sum, c) => {
          return sum + (c.endedAt!.getTime() - c.startedAt.getTime()) / 1000;
        }, 0) / completedCalls.length
      : 0;

  return {
    aiResolutionRate: totalEnded > 0 ? (aiOnly / totalEnded) * 100 : 0,
    avgHandleTime: Math.round(avgHandleTime),
    switchRate: totalEnded > 0 ? (switches / totalEnded) * 100 : 0,
  };
}

