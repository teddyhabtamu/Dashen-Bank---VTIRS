import "express-async-errors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { attachSession } from "./lib/guard.js";
import { schedule, runScheduledJob } from "./lib/scheduler.js";
import { autoTransitionRegistrations, autoTransitionVehicleStatus } from "./services/reminders.js";
import { generateNotificationsForAllUsers, cleanupOldNotifications } from "./services/notification.js";
import authRoutes from "./routes/auth.js";
import vehicleRoutes from "./routes/vehicles.js";
import registrationRoutes from "./routes/registrations.js";
import insuranceRoutes from "./routes/insurances.js";
import documentRoutes from "./routes/documents.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/reports.js";
import searchRoutes from "./routes/search.js";
import referenceRoutes from "./routes/reference.js";
import auditRoutes from "./routes/audit.js";
import userRoutes from "./routes/users.js";
import notificationRoutes from "./routes/notifications.js";
import roleRoutes from "./routes/roles.js";
import settingRoutes from "./routes/settings.js";
import driverRoutes from "./routes/drivers.js";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

function uploadRoot() {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(attachSession);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/insurances", insuranceRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/drivers", driverRoutes);

// Serve uploaded files (documents/images) statically.
app.use("/uploads", express.static(uploadRoot()));

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler so thrown async errors return JSON.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err);
  if (res.headersSent) return;
  if (err && typeof err === "object" && "name" in err && (err as any).name === "ValidationError") {
    return res.status(422).json({ error: (err as Error).message });
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`VTIRS API listening on http://localhost:${PORT}`);

  // Run once on startup to catch anything missed while the app was down.
  runScheduledJob("registration-transition", () => autoTransitionRegistrations().then(() => undefined));
  runScheduledJob("vehicle-status-transition", () => autoTransitionVehicleStatus().then(() => undefined));
  runScheduledJob("notification-sweep", () => generateNotificationsForAllUsers().then(() => undefined));

  // Durable fixed schedules (node-cron). Single-process, guarded against overlap.
  schedule("0 1 * * *", "registration-transition", () => autoTransitionRegistrations().then(() => undefined));
  schedule("5 1 * * *", "vehicle-status-transition", () => autoTransitionVehicleStatus().then(() => undefined));
  schedule("15 * * * *", "notification-sweep", () => generateNotificationsForAllUsers().then(() => undefined));
  schedule("30 1 * * *", "notification-cleanup", () => cleanupOldNotifications().then(() => undefined));
});
