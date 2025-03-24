module.exports = (sequelize, DataTypes) => {
  const LocationCommentHighlight = sequelize.define('LocationCommentHighlight', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    location_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    last_comment_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    openai_output_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  LocationCommentHighlight.associate = (models) => {
    LocationCommentHighlight.belongsTo(models.Location, { foreignKey: 'location_id' });
  };

  return LocationCommentHighlight;
};
