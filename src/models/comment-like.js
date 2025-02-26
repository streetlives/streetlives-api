
module.exports = (sequelize, DataTypes) => {
  const CommentLike = sequelize.define('CommentLike', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      autoIncrement: true,
    },
    comment_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
  }, {
    tableName: 'comment_likes',
    underscored: true,
    timestamps: false
  });

  CommentLike.associate = (models) => {
    CommentLike.belongsTo(models.Comment, {
      foreignKey: 'comment_id',
      as: 'comment',
    });
  };

  return CommentLike;
};
