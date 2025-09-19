// models/world.js
module.exports = (sequelize, DataTypes) => {
    const World = sequelize.define("World", {
        worldId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            field: "worldId"
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: "worlds",
        timestamps: false
    });

    // Relationships
    World.associate = (models) => {
        World.hasMany(models.Quest, { foreignKey: "worldId" });
        World.hasMany(models.Leaderboard, { foreignKey: "worldId" });
    };

    return World;
};
