import { Op } from 'sequelize';

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
    hidden: DataTypes.BOOLEAN,
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

  Comment.findAllForLocation = (locationId, { attributes, order }) => Comment.findAll({
    where: {
      location_id: locationId,
      reply_to_id: null,
      hidden: { [Op.or]: [false, null] },
    },
    attributes,
    order,
    include: [{ model: Comment, as: 'Replies', attributes }],
  });

  return Comment;
};
