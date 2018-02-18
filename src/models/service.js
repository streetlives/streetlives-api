module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define('Service', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.TEXT,
    description: DataTypes.TEXT,
    url: DataTypes.TEXT,
    email: DataTypes.TEXT,
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
    Service.hasMany(models.Phone);
  };

  return Service;
};
