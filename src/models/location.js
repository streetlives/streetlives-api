module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.TEXT,
    description: DataTypes.TEXT,
    transportation: DataTypes.TEXT,
    position: DataTypes.GEOMETRY,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Location.associate = (models) => {
    Location.belongsTo(models.Organization);
    Location.belongsToMany(models.Service, { through: models.ServiceAtLocation });
    Location.hasMany(models.PhysicalAddress);
    Location.hasMany(models.Phone);
    Location.hasMany(models.Comment);
  };

  return Location;
};
