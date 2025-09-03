// models/progress.js
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
      type: DataTypes.ENUM("in-progress", "completed"),
      allowNull: false,
      defaultValue: "in-progress"
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "progresss",
    timestamps: false
  });

  // Relationships
  Progress.associate = (models) => {
    Progress.belongsTo(models.User, { foreignKey: "userId" });
    Progress.belongsTo(models.Quest, { foreignKey: "questId" });
  };

  return Progress;
};
