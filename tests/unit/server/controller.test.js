import { jest, expect, describe, test, beforeEach } from '@jest/globals';
import TestUtil from '../_util/testUtil.js';

import { Service } from '../../../server/services.js';
import { Controller } from '../../../server/controller.js';

describe('#Controller - test suite for access the service api', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });
  test('#getFileStream', async () => {
    const mockFileStream = TestUtil.generateReadableStream(['data']);
    const mockType = '.html';
    const mockFileName = 'test.html';

    jest
      .spyOn(Service.prototype, Service.prototype.getFileStream.name)
      .mockResolvedValue({
        stream: mockFileStream,
        type: mockType
      });
    const controller = new Controller();
    const { stream, type } = await controller.getFileStream(mockFileName);
    expect(stream).toStrictEqual(mockFileStream);
    expect(type).toStrictEqual(mockType)
  });
});
