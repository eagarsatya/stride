import {
  Decoder,
  Stream,
  type FitMessages,
  type RecordMesg,
  type SessionMesg,
} from "@garmin/fitsdk";

import { speedToPace } from "@/lib/intervals/map";
import { mapFitLaps, type TrainingStep } from "@/lib/training";

const SEMICIRCLE = 180 / Math.pow(2, 31);
const COROS_MANUFACTURER = new Set(["coros", "294"]);

export const FIT_SOURCE = "UPLOAD";
export const FIT_UPLOAD_PREFIX = "upload:";

export type FitParseFailureReason = "invalid" | "not-a-run" | "no-session";

export type FitParseResult =
  | { ok: true; activity: ParsedFitActivity }
  | { ok: false; reason: FitParseFailureReason; message: string };

export type ParsedFitSummary = {
  name: string;
  type: string;
  subType: string | null;
  startDate: Date;
  startDateLocal: string;
  timezone: string | null;
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  avgSpeedMs: number | null;
  maxSpeedMs: number | null;
  paceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  calories: number | null;
  avgStrideM: number | null;
  hrZoneTimes: number[] | null;
  isTreadmill: boolean;
  deviceName: string | null;
  externalId: string;
  streamTypes: string[];
  hasGps: boolean;
};

export type ParsedFitActivity = {
  summary: ParsedFitSummary;
  streams: Array<{ type: string; data: unknown[] }>;
  trainingSteps: TrainingStep[];
  raw: Record<string, unknown>;
};

function toFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toInt(value: unknown): number | null {
  const n = toFinite(value);
  return n === null ? null : Math.round(n);
}

function normalizeEnum(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/** FIT datetime may already be a Date, FIT-epoch seconds, or unix ms. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return new Date(value);
    // FIT epoch (1989-12-31) in seconds; the SDK's converter is 631065600000 ms.
    return new Date(value * 1000 + 631_065_600_000);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Format a Date's UTC components as a wall-clock timestamp Postgres will store verbatim. */
export function formatWallClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * Semicircles → degrees. Values already in a geographic range are left alone so
 * a decoder that applied the conversion is not converted twice.
 */
export function toDegrees(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (Math.abs(value) <= 180) return value;
  return value * SEMICIRCLE;
}

export function isRunningSport(sport: unknown, subSport: unknown): boolean {
  const s = normalizeEnum(sport);
  const sub = normalizeEnum(subSport);

  if (s === "running" || s === "1") return true;
  if ((s === "fitnessequipment" || s === "4") && (sub === "treadmill" || sub === "indoorrunning")) {
    return true;
  }
  // A COROS run export with no sport field is still a run on this dashboard.
  if (!s) return true;
  return false;
}

export function mapRunType(
  sport: unknown,
  subSport: unknown,
): { type: string; subType: string | null; isTreadmill: boolean } {
  const sub = normalizeEnum(subSport);
  const isTreadmill = sub === "treadmill" || sub === "indoorrunning";
  const subType = subSport == null || subSport === "" ? null : String(subSport);

  if (sub === "trail" || sub === "trailrunning") {
    return { type: "TrailRun", subType, isTreadmill: false };
  }
  if (isTreadmill) {
    return { type: "VirtualRun", subType, isTreadmill: true };
  }
  return { type: "Run", subType, isTreadmill: false };
}

function prettyBrand(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (COROS_MANUFACTURER.has(raw.toLowerCase())) return "COROS";
  if (/^\d+$/.test(raw)) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function deviceNameFromMessages(messages: FitMessages): string | null {
  const fileId = messages.fileIdMesgs?.[0];
  const named = messages.deviceInfoMesgs?.find((row) => row.productName) ?? fileId;
  const productName = named?.productName ?? fileId?.productName ?? null;
  const brand = prettyBrand(named?.manufacturer ?? fileId?.manufacturer);

  if (productName && brand && !productName.toUpperCase().includes(brand.toUpperCase())) {
    return `${brand} ${productName}`;
  }
  return productName ?? brand;
}

function pickRunningSession(
  sessions: SessionMesg[] | undefined,
): SessionMesg | "none" | "not-a-run" {
  if (!sessions?.length) return "none";

  const running = sessions.filter((session) => isRunningSport(session.sport, session.subSport));
  if (running.length === 0) return "not-a-run";

  return [...running].sort(
    (a, b) => (toFinite(b.totalDistance) ?? 0) - (toFinite(a.totalDistance) ?? 0),
  )[0];
}

function densify(values: Array<number | null>): number[] | null {
  const known = values.filter((value): value is number => value != null);
  if (known.length === 0 || known.length / values.length < 0.1) return null;

  let last = known[0];
  return values.map((value) => {
    if (value != null) last = value;
    return last;
  });
}

function elevationFromAltitude(alts: number[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < alts.length; i += 1) {
    const delta = alts[i] - alts[i - 1];
    // Ignore sub-metre GPS jitter.
    if (delta > 0.5) gain += delta;
    else if (delta < -0.5) loss -= delta;
  }
  return { gain, loss };
}

/**
 * Align record samples onto the stream channels Intervals.icu uses, so charts,
 * splits, and best-effort math can treat an upload like a synced run.
 */
export function recordsToStreamChannels(
  records: RecordMesg[],
  startMs: number,
): Array<{ type: string; data: unknown[] }> {
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: Array<number | null> = [];
  const altitude: Array<number | null> = [];
  const cadence: Array<number | null> = [];
  const velocity: Array<number | null> = [];
  const latlng: Array<[number, number]> = [];
  let lastDistance = 0;
  let gpsCount = 0;

  for (const record of records) {
    const timestamp = toDate(record.timestamp);
    if (!timestamp) continue;

    const dist = toFinite(record.distance);
    if (dist != null) lastDistance = dist;

    const lat = toDegrees(toFinite(record.positionLat));
    const lng = toDegrees(toFinite(record.positionLong));
    const hasFix = lat != null && lng != null && !(lat === 0 && lng === 0);
    if (hasFix) gpsCount += 1;

    const fractional = toFinite(record.fractionalCadence) ?? 0;
    const cad = toFinite(record.cadence);

    time.push(Math.max(0, (timestamp.getTime() - startMs) / 1000));
    distance.push(lastDistance);
    heartrate.push(toFinite(record.heartRate));
    altitude.push(toFinite(record.enhancedAltitude) ?? toFinite(record.altitude));
    cadence.push(cad == null ? null : cad + fractional);
    velocity.push(toFinite(record.enhancedSpeed) ?? toFinite(record.speed));
    latlng.push(hasFix && lat != null && lng != null ? [lat, lng] : [0, 0]);
  }

  const channels: Array<{ type: string; data: unknown[] }> = [];
  if (time.length === 0) return channels;

  channels.push({ type: "time", data: time });
  channels.push({ type: "distance", data: distance });

  const hr = densify(heartrate);
  if (hr) channels.push({ type: "heartrate", data: hr });

  const alt = densify(altitude);
  if (alt) channels.push({ type: "altitude", data: alt });

  const cad = densify(cadence);
  if (cad) channels.push({ type: "cadence", data: cad });

  const speed = densify(velocity);
  if (speed) channels.push({ type: "velocity_smooth", data: speed });

  if (gpsCount > 0) channels.push({ type: "latlng", data: latlng });

  return channels;
}

function strideMetres(value: unknown): number | null {
  const n = toFinite(value);
  if (n == null || n <= 0) return null;
  // FIT stores step length in millimetres; anything over 5 m is that unit.
  return n > 5 ? n / 1000 : n;
}

function zoneTimes(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const times = values
    .map((value) => toInt(value))
    .filter((value): value is number => value != null);
  return times.length > 0 ? times : null;
}

function compactRaw(messages: FitMessages, session: SessionMesg): Record<string, unknown> {
  const fileId = messages.fileIdMesgs?.[0];
  const device =
    messages.deviceInfoMesgs?.find((row) => row.productName) ?? messages.deviceInfoMesgs?.[0];

  return {
    source: "fit",
    fileId: fileId
      ? {
          manufacturer: fileId.manufacturer ?? null,
          product: fileId.product ?? null,
          productName: fileId.productName ?? null,
          serialNumber: fileId.serialNumber ?? null,
          timeCreated: fileId.timeCreated ?? null,
        }
      : null,
    session: {
      sport: session.sport ?? null,
      subSport: session.subSport ?? null,
      startTime: session.startTime ?? null,
      totalDistance: session.totalDistance ?? null,
      totalTimerTime: session.totalTimerTime ?? null,
      totalElapsedTime: session.totalElapsedTime ?? null,
      totalAscent: session.totalAscent ?? null,
      totalDescent: session.totalDescent ?? null,
      avgHeartRate: session.avgHeartRate ?? null,
      maxHeartRate: session.maxHeartRate ?? null,
      avgCadence: session.avgCadence ?? session.avgRunningCadence ?? null,
      totalCalories: session.totalCalories ?? null,
    },
    device: device
      ? {
          manufacturer: device.manufacturer ?? null,
          productName: device.productName ?? null,
          serialNumber: device.serialNumber ?? null,
        }
      : null,
  };
}

export function messagesToParsed(messages: FitMessages): FitParseResult {
  const picked = pickRunningSession(messages.sessionMesgs);
  if (picked === "not-a-run") {
    return { ok: false, reason: "not-a-run", message: "That file is not a run." };
  }
  if (picked === "none" && !messages.recordMesgs?.length) {
    return { ok: false, reason: "no-session", message: "No activity session found in that file." };
  }

  const session: SessionMesg = picked === "none" ? {} : picked;
  const records = messages.recordMesgs ?? [];
  const activity = messages.activityMesgs?.[0];

  const startDate =
    toDate(session.startTime) ?? toDate(records[0]?.timestamp) ?? toDate(session.timestamp);
  if (!startDate) {
    return { ok: false, reason: "invalid", message: "That FIT file has no start time." };
  }

  const localTimestamp = toDate(activity?.localTimestamp);
  const startDateLocal = formatWallClock(localTimestamp ?? startDate);

  const { type, subType, isTreadmill } = mapRunType(session.sport, session.subSport);
  const streams = recordsToStreamChannels(records, startDate.getTime());
  const streamTypes = streams.map((stream) => stream.type);
  const hasGps = streamTypes.includes("latlng");

  const altitude = streams.find((stream) => stream.type === "altitude")?.data;
  const fromAlt =
    Array.isArray(altitude) && altitude.every((value) => typeof value === "number")
      ? elevationFromAltitude(altitude as number[])
      : null;

  const avgSpeed =
    toFinite(session.enhancedAvgSpeed) ??
    toFinite(session.avgSpeed) ??
    (() => {
      const distance = toFinite(session.totalDistance);
      const moving = toFinite(session.totalTimerTime);
      return distance != null && moving != null && moving > 0 ? distance / moving : null;
    })();

  const fileId = messages.fileIdMesgs?.[0];
  const serial = fileId?.serialNumber ?? messages.deviceInfoMesgs?.[0]?.serialNumber;
  const externalId = `coros:${serial ?? "unknown"}:${startDate.getTime()}`;

  const summary: ParsedFitSummary = {
    name: isTreadmill
      ? `Treadmill Run — ${startDateLocal.slice(0, 10)}`
      : type === "TrailRun"
        ? `Trail Run — ${startDateLocal.slice(0, 10)}`
        : `Run — ${startDateLocal.slice(0, 10)}`,
    type,
    subType,
    startDate,
    startDateLocal,
    timezone: null,
    distanceM: toFinite(session.totalDistance),
    movingTimeS: toInt(session.totalTimerTime ?? session.totalMovingTime),
    elapsedTimeS: toInt(session.totalElapsedTime),
    elevationGainM: toFinite(session.totalAscent) ?? fromAlt?.gain ?? null,
    elevationLossM: toFinite(session.totalDescent) ?? fromAlt?.loss ?? null,
    avgSpeedMs: avgSpeed,
    maxSpeedMs: toFinite(session.enhancedMaxSpeed) ?? toFinite(session.maxSpeed),
    paceSPerKm: speedToPace(avgSpeed),
    avgHr: toInt(session.avgHeartRate),
    maxHr: toInt(session.maxHeartRate),
    avgCadence: toFinite(session.avgCadence) ?? toFinite(session.avgRunningCadence),
    calories: toInt(session.totalCalories),
    avgStrideM: strideMetres(session.avgStepLength),
    hrZoneTimes: zoneTimes(session.timeInHrZone),
    isTreadmill,
    deviceName: deviceNameFromMessages(messages),
    externalId,
    streamTypes,
    hasGps,
  };

  return {
    ok: true,
    activity: {
      summary,
      streams,
      trainingSteps: mapFitLaps(messages.lapMesgs),
      raw: compactRaw(messages, session),
    },
  };
}

export function parseFitFile(bytes: Uint8Array): FitParseResult {
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) {
    return { ok: false, reason: "invalid", message: "That is not a FIT file." };
  }

  const decoder = new Decoder(stream);
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
  });

  if (!messages.sessionMesgs?.length && !messages.recordMesgs?.length) {
    const detail = errors[0]?.message;
    return {
      ok: false,
      reason: "invalid",
      message: detail
        ? `Could not read that FIT file (${detail}).`
        : "Could not read that FIT file.",
    };
  }

  return messagesToParsed(messages);
}
