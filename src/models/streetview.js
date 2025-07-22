module.exports = (sequelize, DataTypes, Op) => {
  const Comment = sequelize.define('Streetview', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    location_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    streetview_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    underscored: true,
    underscoredAll: true,
    timestamps: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.Location, { foreignKey: 'location_id' });
  };

  return Comment;
};
