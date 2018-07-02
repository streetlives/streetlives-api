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
    description: DataTypes.TEXT,
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

  Organization.findMatching = (filterParameters, limit = 10) => {
    const { searchString } = filterParameters;

    const where = {};
    if (searchString) {
      where.name = { [sequelize.Op.iLike]: `%${searchString}%` };
    }

    return Organization.findAll({ limit, where });
  };

  return Organization;
};
