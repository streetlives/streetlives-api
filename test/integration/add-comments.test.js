import request from 'supertest';
import app from '../../src';
import models from '../../src/models';

describe('add comments', () => {
  const content = 'The content of a test comment';
  const postedBy = 'Name of person who posted';

  let location;

  const setupData = () => models.Organization.create({
    name: 'The Test Org',
    description: 'An organization meant for testing purposes.',
    Locations: [{ name: 'Some kind of center' }],
  }, {
    include: [{ model: models.Location }],
  })
    .then((organization) => {
      [location] = organization.Locations;
    });

  beforeAll(() => models.sequelize.sync({ force: true }).then(setupData));
  afterEach(() => {
    location.setComments([]);
  });
  afterAll(() => models.sequelize.close());

  it('should add a comment and return a 201 status code', () =>
    request(app)
      .post(`/locations/${location.id}/comments`)
      .send({ content, postedBy })
      .expect(201)
      .then(() => models.Location.findById(location.id, { include: models.Comment }))
      .then((updatedLocation) => {
        expect(updatedLocation.Comments).toHaveLength(1);

        const newComment = updatedLocation.Comments[0];
        expect(newComment).toMatchObject({
          content,
          posted_by: postedBy,
        });
      }));

  it('should append additional comments to existing ones', () => {
    const additionalContent = 'Yet another comment, from the same person';

    return request(app)
      .post(`/locations/${location.id}/comments`)
      .send({ content, postedBy })
      .expect(201)
      .then(() => request(app)
        .post(`/locations/${location.id}/comments`)
        .send({ content: additionalContent, postedBy })
        .expect(201))
      .then(() => models.Location.findById(location.id, { include: models.Comment }))
      .then((updatedLocation) => {
        expect(updatedLocation.Comments).toHaveLength(2);

        const [firstComment, secondComment] = updatedLocation.Comments;
        expect(firstComment).toMatchObject({ content, posted_by: postedBy });
        expect(secondComment).toMatchObject({ content: additionalContent, posted_by: postedBy });
      });
  });

  it('should return a 400 status code if content isn\'t specified', () =>
    request(app)
      .post(`/locations/${location.id}/comments`)
      .send({ postedBy })
      .expect(400));

  it('should return a 400 status code if "posted by" isn\'t specified', () =>
    request(app)
      .post(`/locations/${location.id}/comments`)
      .send({ content })
      .expect(400));

  it('should return a 404 status code when the given location ID isn\'t found', () => {
    const nonExistentLocationId = '11111111-1111-1111-1111-111111111111';

    return request(app)
      .post(`/locations/${nonExistentLocationId}/comments`)
      .send({ content, postedBy })
      .expect(404);
  });
});
