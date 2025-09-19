const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);
// Updated: Add a new route to get a user's achievements
router.get("/:id/achievements", userController.getUserAchievements);
// Updated: Add a new route to add an achievement to a user
router.post("/:id/achievements", userController.addAchievementToUser);

module.exports = router;
