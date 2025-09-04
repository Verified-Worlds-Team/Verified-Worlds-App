// models/proof.js
module.exports = (sequelize, DataTypes) => {
  const Proof = sequelize.define("Proof", {
    proofId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "proofId"
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    questId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    gameAccount: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    apiSource: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    statFetched: {
      type: DataTypes.JSONB, // store JSON string or object
      allowNull: true
    },
    verificationHash: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    submittedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "proofs",
    timestamps: false
  });

  // Relationships
  Proof.associate = (models) => {
    Proof.belongsTo(models.User, { foreignKey: "userId" });
    Proof.belongsTo(models.Quest, { foreignKey: "questId" });
  };

  return Proof;
};
