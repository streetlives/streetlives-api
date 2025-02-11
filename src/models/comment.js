module.exports = (sequelize, DataTypes, Op) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    content: DataTypes.TEXT,
    posted_by: DataTypes.TEXT,
    contact_info: DataTypes.TEXT,
    hidden: DataTypes.BOOLEAN,
    report_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.Location, { foreignKey: 'location_id' });
    Comment.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
    Comment.belongsTo(models.Comment, { as: 'ReplyTo', foreignKey: 'reply_to_id' });
    Comment.hasMany(models.Comment, { as: 'Replies', foreignKey: 'reply_to_id' });

    Comment.hasMany(models.CommentLike, {
      foreignKey: 'comment_id',
      as: 'likes',
    });
  };

  Comment.findAllForLocation = (locationId, {
    attributes,
    order,
  }) => Comment.findAll({
    where: {
      location_id: locationId,
      reply_to_id: null,
      // hidden: { [Op.or]: [false, null] },
    },
    attributes,
    order,
    include: [
      {
        model: Comment,
        as: 'Replies',
        attributes: ['id', 'content', 'created_at', 'posted_by'],
      },
      {
        model: sequelize.models.CommentLike,
        as: 'likes',
        attributes: [],
      },
    ],
    group: ['Comment.id', 'Replies.id'],
  });

  return Comment;
};
