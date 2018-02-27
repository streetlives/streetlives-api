module.exports = (sequelize, DataTypes) => {
  const Phone = sequelize.define('Phone', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    number: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    extension: DataTypes.INTEGER,
    type: DataTypes.TEXT,
    language: DataTypes.TEXT,
    description: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Phone.associate = (models) => {
    Phone.belongsTo(models.Location);
    Phone.belongsTo(models.Service);
    Phone.belongsTo(models.Organization);
    Phone.belongsTo(models.ServiceAtLocation);
  };

  return Phone;
};
