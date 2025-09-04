// models/reward.js
module.exports = (sequelize, DataTypes) => {
  const Reward = sequelize.define("Reward", {
    rewardId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "rewardId"
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM("badge", "skin", "emoji"),
      defaultValue: "badge",
      allowNull: false
    },
    associatedQuestId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: "reward",
    timestamps: false
  });

  // Relationships
  Reward.associate = (models) => {
    Reward.belongsTo(models.Quest, { foreignKey: "associatedQuestId" });
  };

  return Reward;
};
