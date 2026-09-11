// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
// Private operational state, like openai_rate_limit_state. It is never included in
// directory associations or the public data-change audit (which must not contain OTP state).
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'PublicCallingState',
    {
      key: { type: DataTypes.TEXT, primaryKey: true },
      state: { type: DataTypes.JSONB, allowNull: false },
    },
    { tableName: 'public_calling_state', timestamps: false },
  );
