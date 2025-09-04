// models/chat.js
module.exports = (sequelize, DataTypes) => {
    const Chat = sequelize.define("Chat", {
    chatId:
        {
        type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "chatId"
    },
    questId:
        {
        type: DataTypes.INTEGER,
      allowNull: false
    },
    userId:
        {
        type: DataTypes.INTEGER,
      allowNull: false
    },
    message:
        {
        type: DataTypes.TEXT,
      allowNull: false
    },
    timestamp:
        {
        type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
    }, {
    tableName: "chat",
    timestamps: false
    });

    Chat.associate = (models) => {
        Chat.belongsTo(models.User, { foreignKey: "userId" });
        Chat.belongsTo(models.Quest, { foreignKey: "questId" });
    };

    return Chat;
};
