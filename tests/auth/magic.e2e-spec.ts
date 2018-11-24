import moment = require('moment');

import { TestHelper } from '../@utils/TestHelper';
import { usersFixture } from './@fixtures/users';

import { Project } from '../../src/@orm/project';
import { User } from '../../src/@orm/user';

const h = new TestHelper('/auth/magic').addFixture(usersFixture);

describe(`POST ${h.url}`, async () => {
  beforeAll(h.before);
  afterAll(h.after);

  it('by guest - validation error', async () => {
    await h
      .requestBy()
      .post(h.url)
      .expect(422)
      .expect({
        errors: [
          {
            children: [],
            constraints: {
              isEmail: 'email must be an email',
              isNotEmpty: 'email should not be empty',
              isString: 'email must be a string',
            },
            property: 'email',
          },
        ],
        message: 'Validation Error',
        statusCode: 422,
      });
  });

  it('by guest - correct data', async () => {
    const email = 'razvanlomov+14@gmail.com';
    await h
      .requestBy()
      .post(h.url)
      .send({
        email,
      })
      .expect(202)
      .expect({
        statusCode: 202,
        statusMessage: 'TEST Accepted',
      });
    const addedUser = await h.findOne(User, { email });
    expect(addedUser).toEqual(
      expect.objectContaining({
        createdAt: expect.any(moment),
        email,
        roles: [{ id: 1, name: 'user' }],
        status: User.JUST_CREATED,
        updatedAt: expect.any(moment),
      })
    );
    await h.removeCreated(Project, { id: addedUser.defaultProjectId });
    await h.removeCreated(User, { email });
  });

  it('by user (own email)', async () => {
    const email = 'no-password@mail.com';
    await h
      .requestBy(email)
      .post(h.url)
      .send({
        email,
      })
      .expect(202)
      .expect({
        statusCode: 202,
        statusMessage: 'TEST Accepted',
      });
  });

  it('by admin (own email)', async () => {
    await h
      .requestBy('admin@mail.com')
      .post(h.url)
      .send({
        email: 'admin@mail.com',
      })
      .expect(202)
      .expect({
        statusCode: 202,
        statusMessage: 'TEST Accepted',
      });
  });

  it('by super-admin (own email)', async () => {
    await h
      .requestBy('super-admin@mail.com')
      .post(h.url)
      .send({
        email: 'super-admin@mail.com',
      })
      .expect(202)
      .expect({
        statusCode: 202,
        statusMessage: 'TEST Accepted',
      });
  });
});