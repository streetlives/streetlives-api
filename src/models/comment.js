module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    content: DataTypes.TEXT,
    posted_by: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.Location);
    Comment.belongsTo(models.ServiceAtLocation);
  };

  return Comment;
};
