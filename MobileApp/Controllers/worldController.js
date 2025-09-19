const { World } = require("../models");

// GET all worlds
exports.getAllWorlds = async (req, res) => {
    try {
        const worlds = await World.findAll();
        res.json(worlds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET single world by ID
exports.getWorldById = async (req, res) => {
    try {
        const world = await World.findByPk(req.params.id);
        if (!world) return res.status(404).json({ error: "World not found" });
        res.json(world);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// CREATE new world
exports.createWorld = async (req, res) => {
    try {
        const world = await World.create(req.body);
        res.status(201).json(world);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// UPDATE a world
exports.updateWorld = async (req, res) => {
    try {
        const [updated] = await World.update(req.body, { where: { worldId: req.params.id } });
        if (!updated) return res.status(404).json({ error: "World not found" });
        const updatedWorld = await World.findByPk(req.params.id);
        res.json(updatedWorld);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// DELETE a world
exports.deleteWorld = async (req, res) => {
    try {
        const deleted = await World.destroy({ where: { worldId: req.params.id } });
        if (!deleted) return res.status(404).json({ error: "World not found" });
        res.json({ message: "World deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
