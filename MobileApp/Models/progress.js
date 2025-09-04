module.exports = (sequelize, DataTypes) => {
  const Progress = sequelize.define("Progress", {
    progressId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "progressId"
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    questId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("not_started", "in_progress", "completed", "verified"),
      defaultValue: "not_started"
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: "progress",
    timestamps: false
  });

  Progress.associate = (models) => {
    Progress.belongsTo(models.User, { foreignKey: "userId" });
    Progress.belongsTo(models.Quest, { foreignKey: "questId" });
  };

  return Progress;
};