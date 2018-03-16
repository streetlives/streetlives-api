module.exports = (sequelize, DataTypes) => {
  const RequiredDocument = sequelize.define('RequiredDocument', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    document: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  RequiredDocument.associate = (models) => {
    RequiredDocument.belongsTo(models.Service);
  };

  return RequiredDocument;
};
