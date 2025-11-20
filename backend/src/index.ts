import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import proofRouter from "./api/proof";
import nautilusRouter from "./api/nautilus";
import { initializeDatabase } from "./database/models";
import datasetsRouter from "./api/datasets";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health
app.get("/health", (_req, res) => {
	res.json({ status: "ok", timestamp: Date.now() });
});

// Routers
app.use("/api/proof", proofRouter);
app.use("/api/nautilus", nautilusRouter);
app.use("/api/datasets", datasetsRouter);

// Upload and Purchase routers: load if present, else stub
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeLoadRouter(modulePath: string): any {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = require(modulePath);
		return mod.default || mod;
	} catch {
		const r = express.Router();
		r.all("*", (_req, res) => res.status(501).json({ error: "Not implemented" }));
		return r;
	}
}

app.use("/api/upload", safeLoadRouter("./api/upload"));
app.use("/api/purchase", safeLoadRouter("./api/purchase"));
app.use("/api/walrus", safeLoadRouter("./api/walrus"));

// 404 handler must be before error handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);
// Initialize DB then start server
initializeDatabase()
	.then(() => {
		// eslint-disable-next-line no-console
		console.log("✅ Database schema ensured");
		app.listen(PORT, () => {
			// eslint-disable-next-line no-console
			console.log(`Backend API listening on http://localhost:${PORT}`);
		});
	})
	.catch((err) => {
		// eslint-disable-next-line no-console
		console.error("❌ Failed to initialize database:", err);
		process.exit(1);
	});

export default app;

// Global unhandled promise rejection handler
process.on("unhandledRejection", (reason) => {
	// eslint-disable-next-line no-console
	console.error("Unhandled Rejection:", reason);
});



