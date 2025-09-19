const { User } = require("../Models");

// GET all users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET single user
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE user
exports.createUser = async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// UPDATE user
exports.updateUser = async (req, res) => {
    try {
        const [updated] = await User.update(req.body, { where: { userId: req.params.id } });
        if (!updated) return res.status(404).json({ error: "User not found" });
        const updatedUser = await User.findByPk(req.params.id);
        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// DELETE user
exports.deleteUser = async (req, res) => {
    try {
        const deleted = await User.destroy({ where: { userId: req.params.id } });
        if (!deleted) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// New function to get a user's achievements
exports.getUserAchievements = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user.achievements);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// New function to add an achievement to a user
exports.addAchievementToUser = async (req, res) => {
    try {
        const { achievement } = req.body;
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Push the new achievement to the existing achievements array
        const updatedAchievements = [...user.achievements, achievement];

        const [updated] = await User.update(
            { achievements: updatedAchievements },
            { where: { userId: req.params.id } }
        );

        if (!updated) return res.status(404).json({ error: "User not found" });

        const updatedUser = await User.findByPk(req.params.id);
        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
