module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
        userId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            field: "userId"
        },
        username: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        passwordHash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        walletAddress: {
            type: DataTypes.STRING(100),
            allowNull: true,
            unique: true
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        lastLogin: {
            type: DataTypes.DATE,
            allowNull: true
        },
        achievements: {
            type: DataTypes.JSONB,
            defaultValue: [],
            allowNull: false
        }
    }, {
        tableName: "users",
        timestamps: false
    });

    User.associate = (models) => {
        User.hasMany(models.Progress, { foreignKey: "userId" });
        User.hasMany(models.Proof, { foreignKey: "userId" });
        User.hasMany(models.Chat, { foreignKey: "userId" });
        User.hasMany(models.Leaderboard, { foreignKey: "userId" });
    };

    return User;
};
