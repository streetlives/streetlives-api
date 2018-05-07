module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define('Service', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: DataTypes.TEXT,
    url: DataTypes.TEXT,
    email: DataTypes.TEXT,
    interpretation_services: DataTypes.TEXT,
    fees: DataTypes.TEXT,
    additional_info: DataTypes.TEXT,
    // TODO: The following fields are temporary hacks,
    // and should be replaced with a proper structure for eligibility in general.
    ages_served: DataTypes.JSON,
    who_does_it_serve: DataTypes.JSON,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Service.associate = (models) => {
    Service.belongsTo(models.Organization, {
      onDelete: 'CASCADE',
      foreignKey: { allowNull: false },
    });
    Service.belongsToMany(models.Location, { through: models.ServiceAtLocation });
    Service.belongsToMany(models.Taxonomy, { through: models.ServiceTaxonomy });
    Service.belongsToMany(models.Language, { through: models.ServiceLanguages });
    Service.hasMany(models.Phone);
    Service.hasMany(models.PaymentAccepted);
    Service.hasMany(models.RegularSchedule);
    Service.hasMany(models.HolidaySchedule);
    Service.hasMany(models.RequiredDocument);
  };

  return Service;
};
