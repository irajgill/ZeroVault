"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const walrus_1 = require("../walrus");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.get("/status/:blobId", asyncHandler(async (req, res) => {
    const { blobId } = req.params;
    if (!blobId)
        throw new errorHandler_1.ValidationError("Missing blobId");
    const buf = await (0, walrus_1.downloadFromWalrus)(blobId);
    return res.json({ ok: true, size: buf.length });
}));
exports.default = router;
