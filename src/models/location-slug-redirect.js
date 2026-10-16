module.exports = (sequelize, DataTypes) => {
  const LocationSlugRedirect = sequelize.define(
    'LocationSlugRedirect',
    {
      slug: {
        type: DataTypes.TEXT,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      underscored: true,
      underscoredAll: true,
    },
  );

  LocationSlugRedirect.associate = (models) => {
    LocationSlugRedirect.belongsTo(models.Location, {
      foreignKey: 'location_id',
    });
  };

  return LocationSlugRedirect;
};
