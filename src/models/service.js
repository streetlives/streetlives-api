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
    script_updated_at: DataTypes.DATE,
    name_vector: DataTypes.TSVECTOR,
    description_vector: DataTypes.TSVECTOR,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Service.associate = (models) => {
    Service.belongsTo(models.Organization, {
      onDelete: 'CASCADE',
      foreignKey: {
        name: 'organization_id',
        allowNull: false,
      },
    });
    Service.belongsToMany(models.Location, {
      through: models.ServiceAtLocation,
      foreignKey: 'service_id',
      otherKey: 'location_id',
    });
    Service.belongsToMany(models.Taxonomy, {
      through: models.ServiceTaxonomy,
      foreignKey: 'service_id',
      otherKey: 'taxonomy_id',
    });
    Service.belongsToMany(models.Language, {
      through: models.ServiceLanguages,
      foreignKey: 'service_id',
      otherKey: 'language_id',
    });
    Service.hasMany(models.Phone, { foreignKey: 'service_id' });
    Service.hasMany(models.PaymentAccepted, { foreignKey: 'service_id' });
    Service.hasMany(models.RegularSchedule, { foreignKey: 'service_id' });
    Service.hasMany(models.HolidaySchedule, { foreignKey: 'service_id' });
    Service.hasMany(models.ServiceArea, { foreignKey: 'service_id' });
    Service.hasMany(models.Eligibility, { foreignKey: 'service_id' });
    Service.hasMany(models.ServiceTaxonomySpecificAttribute, { foreignKey: 'service_id' });
    Service.hasMany(models.EventRelatedInfo, { foreignKey: 'service_id' });
    Service.hasMany(models.RequiredDocument, { foreignKey: 'service_id' });
    Service.hasOne(models.DocumentsInfo, { foreignKey: 'service_id' });
  };

  return Service;
};
