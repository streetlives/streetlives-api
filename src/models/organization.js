module.exports = (sequelize, DataTypes, Op) => {
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
    partners: DataTypes.BOOLEAN,
    name_vector: DataTypes.TSVECTOR,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Organization.associate = (models) => {
    Organization.hasMany(models.Service, {
      onDelete: 'CASCADE',
      foreignKey: {
        name: 'organization_id',
        allowNull: false,
      },
    });
    Organization.hasMany(models.Location, { foreignKey: 'organization_id' });
    Organization.hasMany(models.Phone, { foreignKey: 'organization_id' });
  };

  Organization.findMatching = (filterParameters, limit = 10) => {
    const { searchString } = filterParameters;

    const where = {};
    if (searchString) {
      where.name = { [Op.iLike]: `%${searchString}%` };
    }

    return Organization.findAll({ limit, where });
  };

  return Organization;
};
