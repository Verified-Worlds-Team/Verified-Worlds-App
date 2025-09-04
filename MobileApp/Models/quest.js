// models/quest.js
module.exports = (sequelize, DataTypes) => {
  const Quest = sequelize.define("Quest", {
    questId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "questId"
    },
    worldId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rewardId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    proofRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: "quests",
    timestamps: false
  });

  // Relationships
  Quest.associate = (models) => {
    Quest.belongsTo(models.World, { foreignKey: "worldId" });
    Quest.belongsTo(models.Reward, { foreignKey: "rewardId" });

    Quest.hasMany(models.Progress, { foreignKey: "questId" });
    Quest.hasMany(models.Proof, { foreignKey: "questId" });
    Quest.hasMany(models.Chat, { foreignKey: "questId" });
  };

  return Quest;
};
