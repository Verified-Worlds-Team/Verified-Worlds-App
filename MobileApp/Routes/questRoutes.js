const express = require("express");
const router = express.Router();
const questController = require("../controllers/questController");

router.get("/", questController.getAllQuests);
router.get("/:id", questController.getQuestById);
router.post("/", questController.createQuest);
router.put("/:id", questController.updateQuest);
router.delete("/:id", questController.deleteQuest);

module.exports = router;
