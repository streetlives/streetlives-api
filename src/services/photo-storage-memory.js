// In-process stand-in for S3, used by the test environment so the suite never
// needs AWS credentials or a network. It is a real module rather than a jest
// mock so supertest exercises the same controller path production does.

const objects = new Map();

let failNextPut = null;

export const reset = () => {
  objects.clear();
  failNextPut = null;
};

// Lets a test make the next write fail the way S3 would.
export const failNextPutWith = (error) => {
  failNextPut = error;
};

export const putPhoto = async ({ key, body, contentType }) => {
  if (failNextPut) {
    const error = failNextPut;
    failNextPut = null;
    throw error;
  }

  objects.set(key, { body: Buffer.from(body), contentType });
};

export const deletePhoto = async (key) => {
  objects.delete(key);
};

export const getPhoto = key => objects.get(key) || null;

export const listKeys = () => [...objects.keys()];

export default {
  reset, failNextPutWith, putPhoto, deletePhoto, getPhoto, listKeys,
};
