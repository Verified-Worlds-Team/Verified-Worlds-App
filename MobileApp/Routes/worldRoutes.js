const express = require("express");
const router = express.Router();
const worldController = require("../controllers/worldController");

router.get("/", worldController.getAllWorlds);
router.get("/:id", worldController.getWorldById);
router.post("/", worldController.createWorld);
router.put("/:id", worldController.updateWorld);
router.delete("/:id", worldController.deleteWorld);

module.exports = router;