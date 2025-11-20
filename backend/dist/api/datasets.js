"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const models_1 = require("../database/models");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
// GET /api/datasets
router.get("/", asyncHandler(async (_req, res) => {
    const items = await (0, models_1.getAllDatasets)();
    return res.json(items);
}));
// GET /api/datasets/:id
router.get("/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id)
        throw new errorHandler_1.ValidationError("id is required");
    const item = await (0, models_1.getDatasetById)(id);
    if (!item)
        return res.status(404).json({ error: "Dataset not found" });
    return res.json(item);
}));
// GET /api/datasets/user/:address
router.get("/user/:address", asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address)
        throw new errorHandler_1.ValidationError("address is required");
    const addr = address.toLowerCase();
    const result = await models_1.pool.query(`SELECT * FROM datasets WHERE lower(creator) = $1 ORDER BY created_at DESC;`, [addr]);
    return res.json(result.rows || []);
}));
exports.default = router;
