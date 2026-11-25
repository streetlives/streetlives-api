/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

// GET /comments is served by API Gateway without an authorizer, so its response
// is public. The commenter's contact info (an email address) must not be in it.
describe('get comments', () => {
  const contactInfo = 'commenter@testmail.com';

  let location;

  beforeAll(async () => {
    const organization = await models.Organization.create({
      name: 'The Get Comments Test Org',
      Locations: [{ name: 'Get comments test location' }],
    }, {
      include: [{ model: models.Location }],
    });
    [location] = organization.Locations;

    const comment = await location.createComment({
      content: 'A comment whose author left an email',
      posted_by: 'Someone',
      contact_info: contactInfo,
    });
    await comment.createReply({
      content: 'A reply from the provider',
      posted_by: 'The provider',
      contact_info: 'provider@testmail.com',
      location_id: location.id,
    });
  });

  afterAll(() => location.setComments([]));

  it('returns the comments for a location without their contact info', async () => {
    const res = await request(app)
      .get('/comments')
      .query({ locationId: location.id })
      .expect(200);

    expect(res.body).toHaveLength(1);
    const [comment] = res.body;
    expect(comment).toMatchObject({
      content: 'A comment whose author left an email',
      likes_count: 0,
      likedByCurrentUser: false,
    });
    expect(comment).not.toHaveProperty('contact_info');
    expect(comment.Replies).toHaveLength(1);
    expect(comment.Replies[0]).not.toHaveProperty('contact_info');
    expect(JSON.stringify(res.body)).not.toContain('@testmail.com');
  });
});
