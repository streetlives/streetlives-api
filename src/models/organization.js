module.exports = (sequelize, DataTypes) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.STRING,
    description: DataTypes.STRING,
    email: DataTypes.STRING,
    url: DataTypes.STRING,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Organization.associate = (models) => {
    Organization.hasMany(models.Service, {
      onDelete: 'CASCADE',
      foreignKey: { allowNull: false },
    });
    Organization.hasMany(models.Location);
    Organization.hasMany(models.Phone);
  };

  return Organization;
};
