module.exports = (sequelize, DataTypes) => {
  const PaymentAccepted = sequelize.define('PaymentAccepted', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    payment: DataTypes.TEXT,
  }, {
    tableName: 'payments_accepted',
    underscored: true,
    underscoredAll: true,
  });

  PaymentAccepted.associate = (models) => {
    PaymentAccepted.belongsTo(models.Service);
  };

  return PaymentAccepted;
};
