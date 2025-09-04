// models/leaderboard.js
module.exports = (sequelize, DataTypes) => {
  const Leaderboard = sequelize.define("Leaderboard", {
    leaderboardId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "leaderboardId"
    },
    worldId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastUpdated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "leaderboards",
    timestamps: false
  });

  // Relationships
  Leaderboard.associate = (models) => {
    Leaderboard.belongsTo(models.World, { foreignKey: "worldId" });
    Leaderboard.belongsTo(models.User, { foreignKey: "userId" });
  };

  return Leaderboard;
};
