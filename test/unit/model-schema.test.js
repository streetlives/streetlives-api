import { TextDecoder, TextEncoder } from 'util';
import { DataTypes } from 'sequelize';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const models = require('../../src/models');

describe('model definitions match migrated schemas', () => {
  afterAll(async () => {
    await models.sequelize.close();
  });

  it('does not generate UUIDs for CommentLike integer ids', () => {
    const idAttribute = models.CommentLike.rawAttributes.id;

    expect(idAttribute.type.key).toBe(DataTypes.INTEGER.key);
    expect(idAttribute.primaryKey).toBe(true);
    expect(idAttribute.autoIncrement).toBe(true);
    expect(idAttribute.defaultValue).toBeUndefined();

    const like = models.CommentLike.build({
      comment_id: '00000000-0000-0000-0000-000000000001',
      ip_address: '127.0.0.1',
    });

    expect(like.id).toBeNull();
  });

  it('does not map the removed PhysicalAddress neighborhood column', () => {
    expect(models.PhysicalAddress.rawAttributes.neighborhood).toBeUndefined();
    expect(Object.keys(models.PhysicalAddress.rawAttributes)).not.toContain('neighborhood');
  });
});
