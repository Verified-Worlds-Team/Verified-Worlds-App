const { Quest } = require("../models");

exports.getAllQuests = async (req, res) => {
  try {
    const quests = await Quest.findAll();
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getQuestById = async (req, res) => {
  try {
    const quest = await Quest.findByPk(req.params.id);
    if (!quest) return res.status(404).json({ error: "Quest not found" });
    res.json(quest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createQuest = async (req, res) => {
  try {
    const quest = await Quest.create(req.body);
    res.status(201).json(quest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateQuest = async (req, res) => {
  try {
    const [updated] = await Quest.update(req.body, { where: { questId: req.params.id } });
    if (!updated) return res.status(404).json({ error: "Quest not found" });
    const updatedQuest = await Quest.findByPk(req.params.id);
    res.json(updatedQuest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteQuest = async (req, res) => {
  try {
    const deleted = await Quest.destroy({ where: { questId: req.params.id } });
    if (!deleted) return res.status(404).json({ error: "Quest not found" });
    res.json({ message: "Quest deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
