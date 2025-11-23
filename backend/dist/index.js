"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const errorHandler_1 = require("./middleware/errorHandler");
const proof_1 = __importDefault(require("./api/proof"));
const nautilus_1 = __importDefault(require("./api/nautilus"));
const models_1 = require("./database/models");
const datasets_1 = __importDefault(require("./api/datasets"));
const zkemail_1 = __importDefault(require("./api/zkemail"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
// Health
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});
// Routers
app.use("/api/proof", proof_1.default);
app.use("/api/nautilus", nautilus_1.default);
app.use("/api/datasets", datasets_1.default);
app.use("/api/zkemail", zkemail_1.default);
// Upload and Purchase routers: load if present, else stub
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeLoadRouter(modulePath) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(modulePath);
        return mod.default || mod;
    }
    catch {
        const r = express_1.default.Router();
        r.all("*", (_req, res) => res.status(501).json({ error: "Not implemented" }));
        return r;
    }
}
app.use("/api/upload", safeLoadRouter("./api/upload"));
app.use("/api/purchase", safeLoadRouter("./api/purchase"));
app.use("/api/walrus", safeLoadRouter("./api/walrus"));
// 404 handler must be before error handler
app.use(errorHandler_1.notFoundHandler);
// Centralized error handler
app.use(errorHandler_1.errorHandler);
const PORT = Number(process.env.PORT || 4000);
// Initialize DB then start server
(0, models_1.initializeDatabase)()
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
exports.default = app;
// Global unhandled promise rejection handler
process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled Rejection:", reason);
});
