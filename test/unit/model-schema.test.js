import { TextDecoder, TextEncoder } from 'util';
import { DataTypes } from 'sequelize';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const models = require('../../src/models');

describe('model definitions match migrated schemas', () => {
  afterAll(async () => {
    await models.sequelize.close();
  });

  it('keeps CommentLike ids as UUIDs for existing databases', () => {
    const idAttribute = models.CommentLike.rawAttributes.id;

    expect(idAttribute.type.key).toBe(DataTypes.UUID.key);
    expect(idAttribute.primaryKey).toBe(true);
    expect(idAttribute.defaultValue).toBeDefined();

    const like = models.CommentLike.build({
      comment_id: '00000000-0000-0000-0000-000000000001',
      ip_address: '127.0.0.1',
    });

    expect(like.id).toEqual(expect.stringMatching(UUID_V4_REGEX));
  });

  it('does not map the removed PhysicalAddress neighborhood column', () => {
    expect(models.PhysicalAddress.rawAttributes.neighborhood).toBeUndefined();
    expect(Object.keys(models.PhysicalAddress.rawAttributes)).not.toContain('neighborhood');
  });
});
