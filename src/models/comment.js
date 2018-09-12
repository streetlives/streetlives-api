module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    content: DataTypes.TEXT,
    posted_by: DataTypes.TEXT,
    contact_info: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.Location);
    Comment.belongsTo(models.ServiceAtLocation);
    Comment.belongsTo(models.Comment, { as: 'ReplyTo', foreignKey: 'reply_to_id' });
    Comment.hasMany(models.Comment, { as: 'Replies', foreignKey: 'reply_to_id' });
  };

  return Comment;
};
