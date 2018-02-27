module.exports = (sequelize, DataTypes) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    email: DataTypes.TEXT,
    url: DataTypes.TEXT,
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
