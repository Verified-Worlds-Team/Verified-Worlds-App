const { Progress } = require("../models");

exports.getAllProgress = async (req, res) => {
  try {
    const progress = await Progress.findAll();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProgressById = async (req, res) => {
  try {
    const p = await Progress.findByPk(req.params.id);
    if (!p) return res.status(404).json({ error: "Progress not found" });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createProgress = async (req, res) => {
  try {
    const p = await Progress.create(req.body);
    res.status(201).json(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const [updated] = await Progress.update(req.body, { where: { progressId: req.params.id } });
    if (!updated) return res.status(404).json({ error: "Progress not found" });
    const updatedProgress = await Progress.findByPk(req.params.id);
    res.json(updatedProgress);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteProgress = async (req, res) => {
  try {
    const deleted = await Progress.destroy({ where: { progressId: req.params.id } });
    if (!deleted) return res.status(404).json({ error: "Progress not found" });
    res.json({ message: "Progress deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
