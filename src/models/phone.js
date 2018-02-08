module.exports = (sequelize, DataTypes) => {
  const Phone = sequelize.define('Phone', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    number: DataTypes.STRING,
    extension: DataTypes.INTEGER,
    type: DataTypes.STRING,
    language: DataTypes.STRING,
    description: DataTypes.STRING,
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
